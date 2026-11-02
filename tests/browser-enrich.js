/* اختبار متصفح حقيقي (اختياري): node tests/browser-enrich.js
   يحمّل js/ai.js و js/admin.js الحقيقيين في Chrome بدون واجهة، مع Store وfetch وهميين، ثم يمرّر منتجات عبر
   الإثراء ← بطاقات المراجعة ← الحفظ ويفحص DOM وما يُكتب في المتجر. يحتاج puppeteer-core ومتصفح Chrome:
     PUPPETEER_CORE=/path/to/puppeteer-core  CHROME_PATH=/path/to/chrome  (يتخطى الاختبار إن لم يوجدا) */
const fs = require("fs"), path = require("path"), assert = require("assert");
const guess = (c) => c.find(p => p && fs.existsSync(p));
const PUP = process.env.PUPPETEER_CORE || guess(["/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core"]);
const CHROME = process.env.CHROME_PATH || guess(["/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]);
if (!PUP || !CHROME) { console.log("تخطّي: puppeteer-core/Chrome غير متوفرين (اختبار اختياري)."); process.exit(0); }
const puppeteer = require(PUP);
const root = path.join(__dirname, "..");
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + (e && e.message || e)); } };

const STUBS = `
  window.STORE_CONFIG = { imgbbApiKey: "k", imageKitEndpoint: "https://ik.example", aiEnabled: true, aiEnrich: true, aiEnrichMax: 40, aiBilingualNames: true };
  window.firebase = { auth: () => ({ currentUser: { getIdToken: async () => "tok" } }) };
  window.toasts = [];
  window.showToast = (m, k) => window.toasts.push([k, m]);
  window.iconSvg = () => "<i></i>";
  window.Store = {
    _cats: [{ id: "c1", name: "العناية بالشعر", parentId: "" }, { id: "c2", name: "العناية بالبشرة", parentId: "" }],
    _products: [], _added: [], _n: 0,
    getCategories() { return this._cats; }, getAdminProducts() { return this._products; }, getProducts() { return this._products; },
    canWriteNode: () => true, canWriteProducts: () => true, ensureAllProductsFresh: async () => {},
    addProduct(p) { p.id = "new" + (++this._n); this._added.push(JSON.parse(JSON.stringify(p))); this._products.push(p); return p; },
    addCategory(c) { c.id = "cat" + (++this._n); this._cats.push(c); return c; },
    saveProducts: async () => true, getOrders: () => [], isProductAvailable: () => true, getTotalStock: () => 0, getCategoryName: () => "", saveCalls: 0
  };
  window.bumpMetaVersion = () => {};
  window.fetchLog = [];
  const SOURCES = [{ uri: "https://vertexaisearch.cloud.google.com/x", title: "bounty.example" }];
  window.fetch = async (url, init) => {
    const u = String(url); const json = (o, st = 200) => ({ ok: st < 400, status: st, json: async () => o });
    if (u === "/api/ai") {
      const b = JSON.parse(init.body); window.fetchLog.push(b.action);
      if (b.action === "gemini_search") {
        const p = b.payload.prompt;
        const base = { found: true, confidence: "high", officialName: "", brand: "", productType: "", category: "", suggestedCategory: "", description: "", colors: [], sizes: [] };
        if (p.includes("شامبو باونتي")) return json({ ok: true, grounded: true, sources: SOURCES, data: Object.assign(base, { officialName: "شامبو باونتي / Bounty Shampoo", category: "العناية بالشعر", description: "شامبو يغذّي الشعر ويمنحه لمعاناً وتجديداً بتركيبة مخصصة للاستخدام اليومي.", colors: ["ذهبي"], sizes: ["400ml"] }) });
        if (p.includes("نياسيناميد")) return json({ ok: true, grounded: true, sources: SOURCES, data: Object.assign(base, { category: "العناية بالبشرة", description: "سيروم نياسيناميد 10% + زنك 1%" }) });
        if (p.includes("بحث معطوب")) return json({ error: "boom" }, 500);
        return json({ ok: true, grounded: false, sources: [], data: Object.assign(base, { found: false }) });
      }
      if (b.action === "groq_chat") {
        const rows = b.payload.prompt.split(String.fromCharCode(10)).map(l => parseInt(l, 10)).filter(n => n > 0);   // أسطر «1. اسم»
        return json({ ok: true, data: { descriptions: rows.map(i => ({ i, text: "شرح إعلاني جذاب يوضح استخدام المنتج وفائدته للمستخدم بأسلوب مبسّط." })) } });
      }
    }
    return json({ error: "unexpected " + u }, 500);
  };
  window.confirm = () => true;
`;
const DOM = `
  <div id="shelfScanModal" style="display:none"><h3 id="batchModalTitle"></h3><span id="shelfScanStatus"></span>
    <input type="checkbox" id="batchSelectAll"><span id="batchSelectedCounter"></span><div id="shelfDetectedList"></div>
    <button id="closeShelfScanModal"></button><button id="btnCancelShelfScan"></button><button id="btnSaveShelfProducts">حفظ</button></div>
`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent("<!doctype html><html dir='rtl'><body>" + DOM + "</body></html>");
  await page.evaluate(STUBS);
  await page.addScriptTag({ path: path.join(root, "js", "app.js") }).catch(() => {});   // escapeHtml/safeUrl الحقيقيان إن حُمّل بلا أخطاء
  await page.evaluate(() => { if (typeof escapeHtml !== "function") { window.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); window.safeUrl = u => /^https?:/i.test(u) ? u : "#"; } });
  // app.js الحقيقي يعرّف showToast/iconSvg بنفسه فيدوس على البدائل ← نعيدها بعد تحميله كي تُسجَّل التنبيهات فعلاً
  await page.evaluate(() => { window.showToast = (m, k) => window.toasts.push([k, m]); window.iconSvg = () => "<i></i>"; });
  await page.addScriptTag({ path: path.join(root, "js", "ai.js") });
  await page.addScriptTag({ path: path.join(root, "js", "admin.js") });
  await page.evaluate(() => { wireSmartMediaScanner(); });

  console.log("استيراد ← بحث رسمي ← شرح إعلاني ← مراجعة (DOM حقيقي)");
  // الصف 3 هو حالة لقطة الشاشة: الوصف يكرر الاسم، والمقاس «10% + 1%»، والقسم خاطئ — يجب أن تُنظَّف قبل أن تصل البطاقة
  await page.evaluate(() => {
    const raw = StoreAI.normalizeItems([
      { name: "شامبو باونتي 400مل", category: "", price: 5000, qty: 10, barcode: "111" },
      { name: "منتج مجهول 77", category: "", price: 2000, qty: 3 },
      { name: "سيروم نياسيناميد / Niacinamide Serum", category: "العناية بالشعر", price: 12000, qty: 1, description: "سيروم نياسيناميد 10% + زنك 1% (The Ordinary)", sizes: ["10% + 1%"] }
    ]).items;
    window.__done = enrichAndOpen(raw, "اختبار الاستيراد", ["تحذير تجريبي"]);
  });
  await page.waitForFunction(() => document.querySelectorAll(".shelf-item-card").length === 3, { timeout: 10000 });
  const cards = () => page.$$eval(".shelf-item-card", els => els.map(c => ({
    name: c.querySelector(".shelf-item-name").value, cat: c.querySelector(".shelf-item-category").value,
    price: c.querySelector(".shelf-item-price").value, stock: c.querySelector(".shelf-item-stock").value,
    colors: c.querySelector(".shelf-item-colors").value, sizes: c.querySelector(".shelf-item-sizes").value,
    desc: c.querySelector(".shelf-item-desc").value, img: (c.querySelector(".shelf-item-img") || {}).src || "",
    badge: (c.querySelector(".shelf-enrich-box") || {}).innerText || ""
  })));
  await page.waitForFunction(() => { const o = document.getElementById("processLoadingOverlay"); return !o || o.style.display === "none"; }, { timeout: 5000 });
  let cs;
  await t("تُفتح النافذة بثلاث بطاقات وتظهر التحذيرات في الرأس", async () => {
    cs = await cards();
    assert.strictEqual(cs.length, 3);
    assert.ok((await page.$eval("#shelfScanStatus", e => e.textContent)).includes("تحذير تجريبي"));
  });
  await t("المنتج المعروف: وصف رسمي + ألوان + مقاسات + قسم، بلا أي صورة، وشارة «مواصفات رسمية»", async () => {
    const c = cs[0];
    assert.strictEqual(c.cat, "c1"); assert.strictEqual(c.price, "5000"); assert.strictEqual(c.stock, "10");
    assert.strictEqual(c.colors, "ذهبي"); assert.strictEqual(c.sizes, "400ml"); assert.ok(c.desc.startsWith("شامبو يغذّي الشعر"));
    assert.strictEqual(c.img, "");
    assert.ok(c.badge.includes("مواصفات رسمية") && c.badge.includes("ثقة عالية") && c.badge.includes("سيُوزَّع المخزون"), c.badge);
  });
  await t("المنتج المجهول: لا بيانات مخترعة، شرح إعلاني عام بشارته، و«لم يُعثر»", async () => {
    const c = cs[1];
    assert.strictEqual(c.colors, ""); assert.strictEqual(c.sizes, "");
    assert.ok(c.desc.includes("شرح إعلاني"), c.desc);
    assert.ok(c.badge.includes("شرح إعلاني عام") && c.badge.includes("لم يُعثر"), c.badge);
  });
  await t("لقطتك: لا اسم في الوصف، لا «10% + 1%» في المقاسات، والقسم «العناية بالبشرة» لا الشعر", async () => {
    const c = cs[2];
    assert.ok(!c.desc.includes("نياسيناميد 10%"), "الوصف: " + c.desc);
    assert.strictEqual(c.sizes, ""); assert.strictEqual(c.cat, "c2");
    assert.ok(c.desc.includes("شرح إعلاني"));
  });
  await t("زر «استخدمه» يضع الاسم الرسمي", async () => {
    await page.click(".btn-use-official");
    assert.strictEqual((await cards())[0].name, "شامبو باونتي / Bounty Shampoo");
  });

  console.log("\nالحفظ");
  await t("الحفظ يكتب الثلاثة صحيحين (الاسم الرسمي، الوصف، المصفوفة، المخزون بمجموع الكمية، بلا صور)", async () => {
    await page.click("#btnSaveShelfProducts");
    await page.waitForFunction(() => window.Store._added.length === 3, { timeout: 8000 });
    const added = await page.evaluate(() => window.Store._added);
    const a = added.find(p => p.barcode === "111"), b = added.find(p => p.price === 2000), c = added.find(p => p.price === 12000);
    assert.strictEqual(a.name, "شامبو باونتي / Bounty Shampoo"); assert.strictEqual(a.categoryId, "c1");
    assert.deepStrictEqual(a.sizes, ["400ml"]); assert.deepStrictEqual(a.inventory, { "ذهبي||400ml": 10 }); assert.strictEqual(a.stock, 10);
    assert.ok(a.description.startsWith("شامبو يغذّي الشعر")); assert.strictEqual(a.image, "");
    assert.strictEqual(b.stock, 3); assert.ok(b.description.includes("شرح إعلاني")); assert.deepStrictEqual(b.sizes, []);
    assert.strictEqual(c.categoryId, "c2"); assert.deepStrictEqual(c.sizes, []); assert.ok(!c.description.includes("نياسيناميد 10%"));
    const bad = (await page.evaluate(() => window.toasts)).filter(x => x[0] === "error" && /^(حدث خطأ|تعذّر|لم يُحفظ)/.test(x[1]));
    assert.deepStrictEqual(bad, []);
    assert.ok((await page.evaluate(() => window.toasts)).some(x => x[0] === "success" && x[1].includes("تم بنجاح")));
  });
  await t("زر «إكمال البيانات الناقصة» أُلغي من الصفحة والكود", async () => {
    assert.strictEqual(await page.evaluate(() => typeof wireCompleteMissing), "undefined");
    assert.ok(!fs.readFileSync(path.join(root, "admin.html"), "utf8").includes("btnCompleteMissing"));
  });
  await t("لا استدعاء لأي إجراء صور (resolve_image/ImgBB) أثناء الإثراء", async () => {
    const log = await page.evaluate(() => window.fetchLog);
    assert.ok(!log.some(x => /resolve_image|imgbb/.test(x)), JSON.stringify(log));
  });
  console.log("\nفشل الحفظ في Firebase (صلاحيات) + مقاس بنقطة عشرية");
  await t("مقاس «1.5L» يُعقَّم قبل الحفظ، وعند رفض Firebase تظهر رسالة بسبب الصلاحيات لا رسالة عامة", async () => {
    await page.evaluate(() => {
      window.toasts.length = 0; window.Store._added.length = 0;
      document.getElementById("shelfDetectedList").innerHTML = "";
      window.Store.saveProducts = async () => false;
      window.Store.getLastWriteError = () => ({ kind: "PERMISSION", message: "PERMISSION_DENIED" });
      window.__done2 = enrichAndOpen([{ name: "كريم يد", category: "", price: 1000, qty: 2, barcode: "9", colors: [], sizes: ["1.5L"], description: "وصف حقيقي كافٍ للمنتج يشرح الاستخدام اليومي والفائدة بأسلوب واضح ومقروء للزبائن." }], "اختبار الفشل", []);
    });
    await page.waitForFunction(() => document.querySelectorAll(".shelf-item-card").length === 1, { timeout: 8000 });
    await page.waitForFunction(() => { const o = document.getElementById("processLoadingOverlay"); return !o || o.style.display === "none"; }, { timeout: 5000 });
    await page.click("#btnSaveShelfProducts");
    await page.waitForFunction(() => window.toasts.length > 0, { timeout: 8000 });
    const toasts = await page.evaluate(() => window.toasts);
    const msg = toasts[toasts.length - 1][1];
    assert.ok(msg.includes("PERMISSION_DENIED") && msg.includes("ADMIN_UID"), msg);
    const added = await page.evaluate(() => window.Store._added[0]);
    assert.deepStrictEqual(added.sizes, ["1٫5L"]);
    assert.deepStrictEqual(Object.keys(added.inventory), ["_||1٫5L"]);
    assert.ok(!/[.$#\[\]\/]/.test(Object.keys(added.inventory)[0]));
  });
  console.log("\nألوان الأكواد + إخفاء رسائل فشل البحث");
  await t("ألوان الملف E07A5F/8F6E4C تظهر كأسماء، وتُحفظ بدرجاتها الفعلية لا بالأزرق", async () => {
    await page.evaluate(() => {
      window.toasts.length = 0; window.Store._added.length = 0;
      document.getElementById("shelfDetectedList").innerHTML = "";
      window.Store.saveProducts = async () => true;
      const raw = StoreAI.normalizeItems([{ name: "أحمر شفاه ماركة نادرة", price: 3000, qty: 6, barcode: "77", colors: ["E07A5F", "8F6E4C"], sizes: ["15 مل"], description: "وصف حقيقي كافٍ للمنتج يشرح الاستخدام اليومي والفائدة بأسلوب واضح ومقروء للزبائن." }]).items;
      window.__done3 = enrichAndOpen(raw, "ألوان", []);
    });
    await page.waitForFunction(() => document.querySelectorAll(".shelf-item-card").length === 1, { timeout: 8000 });
    await page.waitForFunction(() => { const o = document.getElementById("processLoadingOverlay"); return !o || o.style.display === "none"; }, { timeout: 5000 });
    assert.strictEqual(await page.$eval(".shelf-item-colors", e => e.value), "تيراكوتا, بني");
    await page.click("#btnSaveShelfProducts");
    await page.waitForFunction(() => window.Store._added.length === 1, { timeout: 8000 });
    const a = await page.evaluate(() => window.Store._added[0]);
    assert.deepStrictEqual(a.colors.map(c => [c.name, c.hex]), [["تيراكوتا", "#E07A5F"], ["بني", "#8F6E4C"]]);
    assert.deepStrictEqual(Object.keys(a.inventory).sort(), ["بني||15 مل", "تيراكوتا||15 مل"].sort());
    assert.strictEqual(Object.values(a.inventory).reduce((x, y) => x + y, 0), 6);
  });
  await t("كود لون يُكتب يدوياً في خانة الألوان يتحول عند الحفظ إلى اسم + درجة", async () => {
    await page.evaluate(() => {
      window.toasts.length = 0; window.Store._added.length = 0;
      document.getElementById("shelfDetectedList").innerHTML = "";
      window.__done4 = enrichAndOpen([{ name: "طلاء أظافر", price: 2000, qty: 2, barcode: "88", colors: [], sizes: [], description: "وصف حقيقي كافٍ للمنتج يشرح الاستخدام اليومي والفائدة بأسلوب واضح ومقروء للزبائن." }], "يدوي", []);
    });
    await page.waitForFunction(() => document.querySelectorAll(".shelf-item-card").length === 1, { timeout: 8000 });
    await page.waitForFunction(() => { const o = document.getElementById("processLoadingOverlay"); return !o || o.style.display === "none"; }, { timeout: 5000 });
    await page.$eval(".shelf-item-colors", e => { e.value = "#ECC8AF, 1E3A8A"; });
    await page.click("#btnSaveShelfProducts");
    await page.waitForFunction(() => window.Store._added.length === 1, { timeout: 8000 });
    const a = await page.evaluate(() => window.Store._added[0]);
    assert.deepStrictEqual(a.colors.map(c => [c.name, c.hex]), [["بيج", "#ECC8AF"], ["كحلي", "#1E3A8A"]]);
  });
  await t("فشل البحث (بعد إعادة المحاولة) لا يُعرض للمدير: لا رسالة في الرأس ولا توست، والمراجعة تفتح", async () => {
    await page.evaluate(() => {
      window.toasts.length = 0;
      document.getElementById("shelfDetectedList").innerHTML = "";
      document.getElementById("shelfScanStatus").textContent = "";
      window.__done5 = enrichAndOpen([{ name: "منتج بحث معطوب", price: 100, qty: 1 }], "فشل البحث", []);
    });
    await page.waitForFunction(() => document.querySelectorAll(".shelf-item-card").length === 1, { timeout: 25000 });
    const status = await page.$eval("#shelfScanStatus", e => e.textContent);
    const all = JSON.stringify(await page.evaluate(() => window.toasts));
    assert.ok(!/فشل إثراء|تعذّر البحث|إكمال بيانات|خطأ مؤقت/.test(status + all), status + all);
  });
  await t("لا أخطاء JavaScript غير ملتقطة في الصفحة", () => assert.deepStrictEqual(errors, []));

  await browser.close();
  console.log("\nالنتيجة: " + pass + " نجح، " + fail + " فشل");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
