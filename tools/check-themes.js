#!/usr/bin/env node
/* فحص جودة كل الثيمات في js/themes.js:  node tools/check-themes.js [اسم-ثيم]
   ✗ = عيب يجب إصلاحه (مفتاح ناقص، لون غير صالح، تباين نص ضعيف)   ! = تنبيه جمالي
   يستعمل نفس معادلات boot.js لاختيار لون النص التلقائي فوق الخلفيات. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "themes.js"), "utf8") + "\n;this.T = STORE_THEMES;", ctx);
const THEMES = ctx.T;

const parse = h => { h = String(h || "").trim().replace(/^#/, ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
const lum = c => { const a = parse(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const CORE = ["primary", "secondary", "accent", "bg", "surface", "text", "textMuted", "border"];
const OPT_COLORS = ["headerBg", "heroBg", "bandBg", "footerBg", "sidebarBg", "buttonBg", "buttonText", "buttonHoverBg", "heroButtonBg", "heroButtonText", "heading", "price", "headerText", "heroText", "bandText", "footerText", "sidebarText", "border", "success", "warning", "error"];
// أوزان Google Fonts المدعومة لكل خط عربي شائع (لتجنب فشل تحميل الخط)
const FONT_WEIGHTS = {
  "Tajawal": [200, 300, 400, 500, 700, 800, 900], "Cairo": [200, 300, 400, 500, 600, 700, 800, 900, 1000], "Almarai": [300, 400, 700, 800],
  "IBM Plex Sans Arabic": [100, 200, 300, 400, 500, 600, 700], "Readex Pro": [160, 200, 300, 400, 500, 600, 700], "Changa": [200, 300, 400, 500, 600, 700, 800],
  "El Messiri": [400, 500, 600, 700], "Baloo Bhaijaan 2": [400, 500, 600, 700, 800], "Noto Kufi Arabic": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Amiri": [400, 700], "Lemonada": [300, 400, 500, 600, 700], "Harmattan": [400, 500, 600, 700], "Mada": [200, 300, 400, 500, 600, 700, 900]
};

const only = process.argv[2];
let errors = 0, warns = 0;
Object.keys(THEMES).filter(n => !only || n === only).forEach(name => {
  const T = THEMES[name], C = T.colors || {}, lines = [];
  const bad = m => { errors++; lines.push("  ✗ " + m); };
  const warn = m => { warns++; lines.push("  ! " + m); };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) bad("اسم الثيم يجب أن يكون حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط");
  CORE.forEach(k => { if (!parse(C[k])) bad("colors." + k + " مفقود أو غير صالح (#RRGGBB)"); });
  OPT_COLORS.forEach(k => { if (C[k] != null && C[k] !== "" && !parse(C[k])) bad("colors." + k + " غير صالح"); });
  if (!lines.length) {
    const g = k => C[k] || null;
    const ink = bg => lum(bg) > 0.5 ? C.text : "#FFFFFF";
    const chk = (label, a, b, min, fatal) => { const r = cr(a, b); if (r < min) (fatal ? bad : warn)(label + " تباينه " + r.toFixed(1) + " (المطلوب ≥ " + min + ")"); };
    chk("النص الأساسي على الخلفية", C.text, C.bg, 7, true);
    chk("النص الثانوي على البطاقة", C.textMuted, C.surface, 4.5, true);
    chk("secondary (الروابط) على البطاقة", C.secondary, C.surface, 4.5, true);
    chk("النص فوق primary (تلقائي)", ink(C.primary), C.primary, 4.5, true);
    chk("primary على البطاقة (العناوين والأسعار)", C.primary, C.surface, 4.5, true);
    const btnBg = g("buttonBg") || C.primary, btnTx = g("buttonText") || ink(btnBg);
    chk("نص الأزرار على خلفيتها", btnTx, btnBg, 4.5, true);
    if (g("buttonHoverBg")) chk("نص الأزرار عند التحويم", g("buttonText") || ink(g("buttonHoverBg")), g("buttonHoverBg"), 4.5, true);
    const heroBg = g("heroBg") || C.primary, heroTx = g("heroText") || ink(heroBg);
    chk("نص الهيرو على خلفيته", heroTx, heroBg, 4.5, true);
    const hbBg = g("heroButtonBg") || C.accent, hbTx = g("heroButtonText") || (g("heroButtonBg") ? ink(g("heroButtonBg")) : C.primary);
    chk("نص زر الهيرو على خلفيته", hbTx, hbBg, 4.5, true);
    chk("زر الهيرو على خلفية الهيرو (وضوح الزر)", hbBg, heroBg, 1.8, false);
    chk("accent على خلفية الهيرو (الشارة الصغيرة)", C.accent, heroBg, 3, false);
    if (g("headerBg")) chk("نص الهيدر على خلفيته", g("headerText") || (lum(g("headerBg")) <= 0.5 ? "#FFFFFF" : C.primary), g("headerBg"), 4.5, true);
    const ftBg = g("footerBg") || C.primary; chk("نص الفوتر على خلفيته", g("footerText") || ink(ftBg), ftBg, 4.5, true);
    chk("accent مقابل primary (خط الفوتر والشارات)", C.accent, C.primary, 1.8, false);
    chk("accent على خلفية الصفحة (شارة مميز)", C.primary, C.accent, 3, false);
  }
  if (T.fontFamily) {
    const w = FONT_WEIGHTS[T.fontFamily];
    if (!w) warn("الخط " + T.fontFamily + " غير مدرج في قائمة الفحص — تأكد يدوياً من أوزانه ودعمه للعربية على fonts.google.com");
    else String(T.fontWeights || "400;500;700").split(";").forEach(x => { if (!w.includes(Number(x))) bad("الخط " + T.fontFamily + " لا يدعم الوزن " + x + " (المتاح: " + w.join(",") + ") — سيفشل تحميله"); });
  } else warn("fontFamily غير محدد");
  if (!/^\d+\s*\/\s*\d+$/.test(String(T.cardImageRatio || ""))) bad('cardImageRatio يجب أن يكون مثل "1/1"');
  if (!["cover", "contain"].includes(T.cardImageFit)) bad('cardImageFit يجب أن يكون "cover" أو "contain"');
  ["radiusCard", "radiusControl"].forEach(k => { if (typeof T[k] !== "number" || T[k] < 0 || T[k] > 60) bad(k + " يجب أن يكون رقماً بين 0 و60"); });
  if (T.cardSizes != null) {
    const PL = ["homeProducts", "homeCategories", "productsPage", "categoriesPage"];
    if (typeof T.cardSizes !== "object" || Array.isArray(T.cardSizes)) bad("cardSizes يجب أن يكون كائناً");
    else Object.keys(T.cardSizes).forEach(pl => {
      if (PL.indexOf(pl) < 0) return bad("cardSizes." + pl + " موضع غير معروف (المتاح: " + PL.join(", ") + ")");
      const o = T.cardSizes[pl] || {};
      Object.keys(o).forEach(f => {
        if (["width", "height", "mobileWidth", "mobileHeight"].indexOf(f) < 0) return bad("cardSizes." + pl + "." + f + " حقل غير معروف");
        const lim = /height/i.test(f) ? [100, 900] : [80, 700], v = o[f];
        if (v === "" || v == null) return;
        if (typeof v !== "number" || !isFinite(v) || v < lim[0] || v > lim[1]) bad("cardSizes." + pl + "." + f + " يجب أن يكون رقماً بين " + lim[0] + " و" + lim[1]);
      });
    });
  }
  if (!T.label) warn("label غير مكتوب");
  console.log((lines.some(l => l.includes("✗")) ? "✗" : lines.length ? "!" : "✓") + " " + name.padEnd(20) + (T.label ? " — " + T.label : ""));
  lines.forEach(l => console.log(l));
});
console.log("\n" + Object.keys(THEMES).filter(n => !only || n === only).length + " ثيم — " + (errors ? "✗ " + errors + " عيب" : "✓ لا عيوب") + " — " + warns + " تنبيه");
process.exit(errors ? 1 : 0);
