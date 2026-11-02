/* اختبارات محرّك التهيئة js/boot.js: node tests/boot-tests.js
   تشغّل boot.js داخل DOM وهمي وتتحقق من الثيم والرموز و Google Analytics. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const BOOT = fs.readFileSync(path.join(__dirname, "..", "js", "boot.js"), "utf8");
const CONFIG_SRC = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8");
const THEMES_SRC = fs.readFileSync(path.join(__dirname, "..", "js", "themes.js"), "utf8");

function makeEnv(cfgPatch, opts) {
  opts = opts || {};
  const head = [];
  const metas = (opts.metas || []).map(c => ({ _a: { content: c }, getAttribute(k) { return this._a[k]; }, setAttribute(k, v) { this._a[k] = v; } }));
  const attrs = new Set(opts.htmlAttrs || []);
  const fetched = [];
  const ctx = {
    console: { warn() {}, log() {}, error() {} },
    URL, URLSearchParams, encodeURIComponent, Date, Object, Array, Number, String, JSON, Math, Promise,
    localStorage: { getItem: () => null }, sessionStorage: (function () { const m = {}; return { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; } }; })(),
    location: { search: opts.search || "", origin: "https://shop.example", href: "https://shop.example/" },
    fetch: u => { fetched.push(u); return Promise.resolve({ ok: false }); }
  };
  ctx.window = ctx;
  ctx.document = {
    readyState: "complete", title: opts.title || "", addEventListener() {},
    documentElement: { hasAttribute: a => attrs.has(a) },
    head: {
      appendChild(el) { head.push(el); },
      querySelector: () => null,
      querySelectorAll(sel) { return sel === "meta[content]" ? metas : []; }
    },
    querySelector: () => null, querySelectorAll: () => [],
    createElement(tag) { return { tag, _a: {}, setAttribute(k, v) { this._a[k] = v; }, textContent: "" }; }
  };
  vm.createContext(ctx);
  vm.runInContext(THEMES_SRC, ctx);
  vm.runInContext(CONFIG_SRC + "\n;this.__C = STORE_CONFIG;", ctx);
  const C = ctx.__C;
  if (cfgPatch) cfgPatch(C);
  vm.runInContext(BOOT, ctx);
  const style = head.find(e => e.tag === "style");
  return { ctx, head, metas, fetched, css: style ? style.textContent : "", C };
}

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }

console.log("boot.js — الثيم");
t("القالب الافتراضي navy-gold يطبّق الألوان الأساسية", () => {
  const e = makeEnv();
  assert.ok(e.css.startsWith(":root:root{"));
  assert.ok(e.css.includes("--primary:#172554"));
  assert.ok(e.css.includes("--secondary:#2563EB"));
});
t("تغيير preset يغيّر كل الألوان", () => {
  const e = makeEnv(C => { C.theme.preset = "cosmetics-rose"; });
  assert.ok(e.css.includes("--primary:#5B4146"));
  assert.ok(e.css.includes("--bg:#FFF9F5"));
});
t("لون مخصص في theme.colors يتغلب على القالب", () => {
  const e = makeEnv(C => { C.theme.colors.primary = "#112233"; });
  assert.ok(e.css.includes("--primary:#112233"));
  assert.ok(e.css.includes("--secondary:#2563EB"), "بقية الألوان من القالب");
  assert.ok(e.css.includes("--primary-rgb:17,34,51"));
});
t("لون غير صالح يُتجاهل ويُستخدم لون القالب", () => {
  const e = makeEnv(C => { C.theme.colors.accent = "not-a-color"; });
  assert.ok(e.css.includes("--accent:#D4A853"));
});
t("أخطاء الاسم الشائعة تُصحَّح: أحرف كبيرة/مسافات/شرطة سفلية", () => {
  ["Pet-Olive", "  pet-olive ", "pet_olive", "PET OLIVE"].forEach(n => {
    const e = makeEnv(C => { C.theme.preset = n; });
    assert.strictEqual(e.ctx.StoreBoot.activePreset, "pet-olive", JSON.stringify(n));
    assert.strictEqual(e.ctx.StoreBoot.themeError, "");
  });
});
t("اسم خاطئ: يرجع navy-gold مع رسالة تقترح الأسماء الصحيحة", () => {
  const e = makeEnv(C => { C.theme.preset = "marketplace"; });
  assert.strictEqual(e.ctx.StoreBoot.activePreset, "navy-gold");
  assert.ok(e.ctx.StoreBoot.themeError.indexOf("marketplace-yellow") > -1, e.ctx.StoreBoot.themeError);
  assert.ok(e.ctx.StoreBoot.themeError.indexOf("الأسماء المتاحة") > -1);
});
t("قالب غير معروف يرجع إلى navy-gold", () => {
  const e = makeEnv(C => { C.theme.preset = "nope"; });
  assert.ok(e.css.includes("--primary:#172554"));
});
t("لون أساسي فاتح ← نص أغمق على الأزرار والفوتر (on-primary)", () => {
  const e = makeEnv(C => { C.theme.colors.primary = "#F5E7E8"; });
  assert.ok(!e.css.includes("--on-primary:#FFFFFF"));
  const e2 = makeEnv();
  assert.ok(e2.css.includes("--on-primary:#FFFFFF"));
});
t("الخط والشكل وبطاقة المنتج من الإعدادات", () => {
  const e = makeEnv(C => { C.theme.fontFamily = "Cairo"; C.theme.radiusCard = 20; C.theme.cardImageRatio = "4/5"; C.theme.cardImageFit = "contain"; });
  assert.ok(e.css.includes("--font-body:'Cairo',system-ui"));
  assert.ok(e.css.includes("--r-card:20px"));
  assert.ok(e.css.includes("--card-image-ratio:4/5"));
  assert.ok(e.css.includes("--card-image-fit:contain"));
  const link = e.head.find(x => x._a && x._a.href && x._a.href.indexOf("fonts.googleapis.com/css2") > -1);
  assert.ok(link && link._a.href.indexOf("family=Cairo:wght@400;500;700") > -1);
});
t("المعاينة ?theme= تعمل فقط عند allowPreview", () => {
  const off = makeEnv(null, { search: "?theme=pharmacy-teal" });
  assert.ok(off.css.includes("--primary:#172554"));
  const on = makeEnv(C => { C.theme.allowPreview = true; }, { search: "?theme=pharmacy-teal" });
  assert.ok(on.css.includes("--primary:#172B45") && on.css.includes("--secondary:#0E7C7E"));
});

t("خلفية الهيرو منفصلة: لا تغيّر primary وتحسب نص الهيرو منها", () => {
  const e = makeEnv(C => { C.theme.colors.hero = "#FFF3C4"; });
  assert.ok(e.css.includes("--hero-bg:#FFF3C4"));
  assert.ok(e.css.includes("--primary:#172554"), "primary لم يتغير");
  assert.ok(/\.hero\{--on-primary:#0F172A/.test(e.css), "نص داكن فوق هيرو فاتح");
  const none = makeEnv();
  assert.ok(!none.css.includes("--hero-bg") && !none.css.includes(".hero{"));
  const bad = makeEnv(C => { C.theme.colors.hero = "zzz"; });
  assert.ok(!bad.css.includes("--hero-bg"));
});

t("الأزرار منفصلة عن الخلفيات: buttonBg لا يغيّر primary ولا الفوتر", () => {
  const e = makeEnv(C => { C.theme.colors.buttonBg = "#B45309"; });
  assert.ok(e.css.includes("--btn-bg:#B45309"));
  assert.ok(e.css.includes("--btn-text:#FFFFFF"), "نص الزر يُحسب تلقائياً");
  assert.ok(e.css.includes("--btn-hover-bg:") && e.css.includes("--btn-active-bg:"));
  assert.ok(e.css.includes("--primary:#172554") && !e.css.includes("--footer-bg"));
  const light = makeEnv(C => { C.theme.colors.buttonBg = "#FDE68A"; C.theme.colors.buttonText = "#7C2D12"; });
  assert.ok(light.css.includes("--btn-text:#7C2D12"), "نص الزر اليدوي يتغلب على الحساب التلقائي");
});
t("النصوص منفصلة: heading و price", () => {
  const e = makeEnv(C => { C.theme.colors.heading = "#222222"; C.theme.colors.price = "#B91C1C"; });
  assert.ok(e.css.includes("--heading-color:#222222") && e.css.includes("--price-color:#B91C1C"));
  assert.ok(e.css.includes("--primary:#172554"));
});
t("خلفية الفوتر والشريط والجانبي منفصلة مع نص تلقائي لكل منها", () => {
  const e = makeEnv(C => { C.theme.colors.footerBg = "#FFF3C4"; C.theme.colors.sidebarBg = "#111111"; C.theme.colors.bandText = "#FFEEAA"; });
  assert.ok(e.css.includes("--footer-bg:#FFF3C4") && e.css.includes("--sidebar-bg:#111111"));
  assert.ok(/\.site-footer\{--on-primary:#0F172A/.test(e.css), "نص داكن فوق فوتر فاتح");
  assert.ok(/\.admin-sidebar\{--on-primary:#FFFFFF/.test(e.css), "نص أبيض فوق شريط داكن");
  assert.ok(/\.contact-band\{--on-primary:#FFEEAA/.test(e.css), "نص الشريط اليدوي");
  assert.ok(!e.css.includes("--band-bg"), "bandBg لم يُحدَّد فيبقى على primary");
});
t("الهيدر: خلفية داكنة تقلب نص الهيدر للأبيض تلقائياً", () => {
  const e = makeEnv(C => { C.theme.colors.headerBg = "#1B1B1B"; });
  assert.ok(e.css.includes("--header-bg:#1B1B1B"));
  assert.ok(/\.site-header\{--heading-color:#FFFFFF/.test(e.css));
});
t("زر الهيرو منفصل عن أزرار المتجر", () => {
  const e = makeEnv(C => { C.theme.colors.heroButtonBg = "#FFFFFF"; });
  assert.ok(e.css.includes("--hero-btn-bg:#FFFFFF") && e.css.includes("--hero-btn-text:#0F172A"));
  assert.ok(!e.css.includes("--btn-bg:"));
});

console.log("boot.js — مكتبة الثيمات (themes.js)");
const THEME_NAMES = Object.keys(makeEnv().ctx.StoreBoot.presets);
t("الثيمات الـ15 كلها تُحمَّل وتولّد متغيرات سليمة", () => {
  assert.ok(THEME_NAMES.length >= 15, "عدد الثيمات " + THEME_NAMES.length);
  THEME_NAMES.forEach(n => {
    const e = makeEnv(C => { C.theme.preset = n; });
    assert.strictEqual(e.ctx.StoreBoot.activePreset, n);
    assert.ok(/--primary:#[0-9A-F]{6}/.test(e.css) && /--on-primary:#[0-9A-F]{6}/.test(e.css), n);
    assert.ok(!/undefined|NaN/.test(e.css), n + " فيه undefined/NaN");
  });
});
t("الخط والأوزان والشكل تأتي من الثيم عندما تكون قيم config فارغة", () => {
  const e = makeEnv(C => { C.theme.preset = "electronics-market"; });
  assert.ok(e.css.includes("--font-body:'Almarai'"));
  const link = e.head.find(x => x._a && x._a.href && x._a.href.indexOf("css2") > -1);
  assert.ok(link._a.href.indexOf("family=Almarai:wght@400;700") > -1, "أوزان Almarai من الثيم: " + link._a.href);
  const m = makeEnv(C => { C.theme.preset = "fashion-mono"; });
  assert.ok(m.css.includes("--r-card:0px") && m.css.includes("--card-image-ratio:3/4") && m.css.includes("--card-image-fit:cover"));
});
t("أبعاد البطاقات: بلا إعداد = لا قواعد، وقيم config.js تتغلب على الثيم وغير الصالحة تُتجاهل", () => {
  const none = makeEnv(C => { C.theme.preset = "navy-gold"; });
  assert.ok(none.css.indexOf("#featuredGrid") === -1 && none.css.indexOf("#shopGrid") === -1, "بدون cardSizes لا يُضاف شيء");
  const e = makeEnv(C => { C.theme.preset = "navy-gold"; C.theme.cardSizes = { productsPage: { width: 260, height: 420, mobileWidth: 170 }, homeCategories: { width: 190, height: 220 }, homeProducts: { width: 5, height: 99999 } }; });
  assert.ok(e.css.includes("@media(min-width:768px){html body #shopGrid{grid-template-columns:repeat(auto-fill,min(260px,100%))"), "عرض صفحة المنتجات");
  assert.ok(e.css.includes("html body #shopGrid>:is(.product-card,.skeleton-card){height:420px}"), "طول صفحة المنتجات");
  assert.ok(e.css.includes("@media(max-width:767px){html body #shopGrid{grid-template-columns:repeat(auto-fill,min(170px,100%))"), "عرض الجوال");
  assert.ok(e.css.includes("html body #homeCategories>.cat-chip{flex:0 0 190px;width:190px;height:220px"), "بطاقة قسم الرئيسية");
  assert.ok(e.css.indexOf("#featuredGrid") === -1, "قيم خارج المدى تُتجاهل");
});
t("قيم config.js للخط والشكل تتغلب على الثيم (وأوزان خط مخصص افتراضية آمنة)", () => {
  const e = makeEnv(C => { C.theme.preset = "electronics-market"; C.theme.fontFamily = "Cairo"; C.theme.radiusCard = 30; C.theme.cardImageRatio = "4/5"; });
  assert.ok(e.css.includes("--font-body:'Cairo'") && e.css.includes("--r-card:30px") && e.css.includes("--card-image-ratio:4/5"));
  const link = e.head.find(x => x._a && x._a.href && x._a.href.indexOf("css2") > -1);
  assert.ok(link._a.href.indexOf("family=Cairo:wght@400;500;700") > -1);
  const sys = makeEnv(C => { C.theme.fontFamily = "system"; });
  assert.ok(!sys.head.some(x => x._a && x._a.href && x._a.href.indexOf("css2") > -1), "system = بدون تحميل خط");
});
t("ألوان اختيارية يحددها الثيم نفسه (أزرار/هيدر/هيرو) وتتغلب عليها ألوان config", () => {
  const e = makeEnv(C => { C.theme.preset = "electronics-market"; });
  assert.ok(e.css.includes("--btn-bg:#FFD814") && e.css.includes("--btn-text:#0F1111") && e.css.includes("--header-bg:#131921"));
  assert.ok(/\.site-header\{--heading-color:#FFFFFF/.test(e.css), "هيدر داكن ← نص أبيض");
  assert.ok(e.css.includes("--hero-btn-bg:#FF9900"));
  const o = makeEnv(C => { C.theme.preset = "electronics-market"; C.theme.colors.buttonBg = "#112233"; });
  assert.ok(o.css.includes("--btn-bg:#112233") && !o.css.includes("--btn-bg:#FFD814"));
});

console.log("boot.js — الخدمات والوسوم");
t("Google Analytics يُحقن من googleAnalyticsId", () => {
  const e = makeEnv(C => { C.googleAnalyticsId = "G-TEST12345"; });
  const s = e.head.find(x => x.tag === "script");
  assert.ok(s && s.src.indexOf("id=G-TEST12345") > -1);
});
t("لا Analytics إذا كان المعرّف فارغاً أو الصفحة data-no-analytics", () => {
  assert.ok(!makeEnv(C => { C.googleAnalyticsId = ""; }).head.some(x => x.tag === "script"));
  assert.ok(!makeEnv(null, { htmlAttrs: ["data-no-analytics"] }).head.some(x => x.tag === "script"));
});
t("preconnect لـ Firebase و ImageKit من الإعدادات", () => {
  // نحدد عنوان القاعدة داخل الاختبار نفسه كي لا يفشل كلما تغيّر مشروع Firebase في config.js
  const e = makeEnv(C => { C.firebaseDatabaseURL = "https://demo-shop-default-rtdb.europe-west1.firebasedatabase.app/"; });
  const hrefs = e.head.filter(x => x._a && x._a.rel === "preconnect").map(x => x._a.href);
  assert.ok(hrefs.includes("https://demo-shop-default-rtdb.europe-west1.firebasedatabase.app"), JSON.stringify(hrefs));
  assert.ok(hrefs.includes("https://ik.imagekit.io"));
});
t("الشعار وأيقونة الموقع من config.logo مع رقم النسخة", () => {
  const e = makeEnv(C => { C.logo = "assets/logo/my.png"; C.assetVersion = 5; });
  const icon = e.head.find(x => x._a && x._a.rel === "icon");
  assert.strictEqual(icon._a.href, "assets/logo/my.png?v=5");
});
t("رموز {{storeName}} في العنوان ووسوم الميتا", () => {
  const e = makeEnv(C => { C.storeName = "متجر الورد"; C.siteUrl = "https://rose.example/"; }, {
    title: "السلة | {{storeName}}", metas: ["{{siteUrl}}/", "{{logoUrl}}", "نص عادي"]
  });
  assert.strictEqual(e.ctx.document.title, "السلة | متجر الورد");
  assert.strictEqual(e.metas[0].getAttribute("content"), "https://rose.example/");
  assert.ok(/^https:\/\/rose\.example\/assets\/logo\/logo\.png\?v=\d+$/.test(e.metas[1].getAttribute("content")), e.metas[1].getAttribute("content"));
  assert.strictEqual(e.metas[2].getAttribute("content"), "نص عادي");
});
t("الجلب المبكر يعمل فقط في الصفحة التي تحمل data-early-fetch", () => {
  assert.strictEqual(makeEnv().fetched.length, 0);
  const e = makeEnv(null, { htmlAttrs: ["data-early-fetch"] });
  assert.ok(e.fetched.length >= 3 && e.fetched[0].indexOf("firebasedatabase.app/ws_categories.json") > -1);
});

console.log("\nالنتيجة: " + pass + " نجح، " + fail + " فشل");
process.exit(fail ? 1 : 0);
