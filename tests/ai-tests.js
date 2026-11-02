/* اختبارات أدوات الذكاء الاصطناعي: node tests/ai-tests.js
   تغطي js/ai.js (تنظيف المخرجات، خطة التسعير، تقطيع الجداول) والاتصال بالخادم بواسطة fetch وهمي. */
const assert = require("assert");
const path = require("path");
let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { pass++; console.log("  ✓ " + name); },
    (e) => { fail++; console.log("  ✗ " + name + "\n      " + (e && e.message || e)); }
  );
}

// firebase وهمي (المستخدم مسجّل) و fetch وهمي قابل للتبديل
let nextResponse = null, sent = [];
global.firebase = { auth: () => ({ currentUser: { getIdToken: async () => "TOKEN123" } }) };
global.fetch = async (url, init) => {
  sent.push({ url, init });
  const r = typeof nextResponse === "function" ? nextResponse(JSON.parse(init.body), sent.length) : nextResponse;
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
};
const AI = require(path.join(__dirname, "..", "js", "ai.js"));

(async () => {
  console.log("تنظيف الأرقام والعناصر");
  await t("toNumber يفهم الفواصل والأرقام العربية والنصوص ولا يرجع NaN", () => {
    assert.strictEqual(AI.toNumber("25,000"), 25000);
    assert.strictEqual(AI.toNumber("٢٥٬٠٠٠ د.ع"), 25000);
    assert.strictEqual(AI.toNumber("18.5"), 18.5);
    assert.strictEqual(AI.toNumber("abc"), 0);
    assert.strictEqual(AI.toNumber(-5), 0);
    assert.strictEqual(AI.toNumber(null), 0);
  });
  await t("normalizeItems: يرفض بلا اسم، يضبط الأنواع، ويقبل روابط http(s) فقط", () => {
    const r = AI.normalizeItems([
      { name: "كريم / Cream", price: "12,500", qty: "٣", colors: "أحمر، أزرق", sizes: ["50ml"], image: "javascript:alert(1)", barcode: "123 456!" },
      { name: "", price: 5 }, null, "x",
      { name: "عطر / Perfume", image: "رابط الصورة: https://x.com/a.jpg وبعده نص" }
    ]);
    assert.strictEqual(r.items.length, 2);
    assert.strictEqual(r.dropped, 3);
    assert.strictEqual(r.items[0].price, 12500);
    assert.strictEqual(r.items[0].qty, 3);
    assert.deepStrictEqual(r.items[0].colors, ["أحمر", "أزرق"]);
    assert.strictEqual(r.items[0].image, null);
    assert.strictEqual(r.items[0].barcode, "123456");
    assert.strictEqual(r.items[1].image, "https://x.com/a.jpg");
    assert.strictEqual(r.items[1].qty, 1);
  });
  await t("normalizeItems: السطور المكررة تُدمج وتُجمع كمياتها بدل منتجين", () => {
    const r = AI.normalizeItems([
      { name: "كريم مرطبة", qty: 2, colors: ["أسود"], price: 10000 },
      { name: "كريم مرطبه", qty: 3, colors: ["أبيض"] },          // اختلاف ة/ه فقط ← نفس المنتج
      { name: "حذاء", qty: 1, barcode: "999" },
      { name: "حذاء رياضي", qty: 4, barcode: "999" },            // نفس الباركود ← نفس المنتج
      { name: "ساعة", qty: 1 }
    ]);
    assert.strictEqual(r.items.length, 3);
    assert.strictEqual(r.merged, 2);
    const cream = r.items[0];
    assert.strictEqual(cream.qty, 5);
    assert.strictEqual(cream.price, 10000);
    assert.deepStrictEqual(cream.colors, ["أسود", "أبيض"]);
    assert.strictEqual(r.items[1].qty, 5);
  });

  console.log("\nخطة التسعير: لا تنفيذ تخميني");
  const cats = ["العناية بالشعر", "الشامبو والبلسم", "العطور", "عطور رجالية", "عطور نسائية"];
  await t("خطة سليمة: تُبنى الخلاصة من الخطة نفسها لا من كلام النموذج", () => {
    const p = AI.normalizePricePlan({ action: "discount_percent", value: "20", category: "العطور", summary: "رفع الأسعار 500%!" }, cats);
    assert.strictEqual(p.value, 20);
    assert.strictEqual(p.category, "العطور");
    assert.ok(p.summary.includes("خصم 20%") && !p.summary.includes("500"));
  });
  await t("قسم غير موجود ← خطأ (كان الكود القديم يطبّق على كل المنتجات)", () => {
    assert.throws(() => AI.normalizePricePlan({ action: "discount_percent", value: 10, category: "أحذية" }, cats), /لم أجد قسماً/);
  });
  await t("اسم قسم ملتبس (ينطبق على أكثر من قسم) ← خطأ لا تخمين", () => {
    assert.throws(() => AI.normalizePricePlan({ action: "discount_percent", value: 10, category: "عطور" }, ["عطور رجالية", "عطور نسائية"]), /لم أجد قسماً|أكثر من قسم/);
  });
  await t("إجراء مجهول / unclear / قيمة صفرية / خصم مبالغ فيه / نطاق مقلوب ← أخطاء", () => {
    assert.throws(() => AI.normalizePricePlan({ action: "delete_all", value: 1 }, cats), /نوع العملية/);
    assert.throws(() => AI.normalizePricePlan({ action: "unclear", summary: "الأمر غامض" }, cats), /الأمر غامض/);
    assert.throws(() => AI.normalizePricePlan({ action: "increase_fixed", value: 0 }, cats), /قيمة واضحة/);
    assert.throws(() => AI.normalizePricePlan({ action: "discount_percent", value: 100 }, cats), /مرتفعة/);
    assert.throws(() => AI.normalizePricePlan({ action: "discount_fixed", value: 500, minPrice: 9000, maxPrice: 1000 }, cats), /أكبر من/);
    assert.throws(() => AI.normalizePricePlan(null, cats), /لم أفهم/);
  });
  await t("reset_discount لا يحتاج قيمة، و null/«الكل» تعني كل الأقسام", () => {
    const p = AI.normalizePricePlan({ action: "reset_discount", category: "null" }, cats);
    assert.strictEqual(p.category, null);
    assert.strictEqual(p.value, 0);
    assert.strictEqual(AI.normalizePricePlan({ action: "increase_fixed", value: "5000", category: "كل الأقسام" }, cats).category, null);
  });

  console.log("\nتقطيع الجداول ووصف المنتج");
  await t("splitCsvRows يحترم الحقول المقتبسة متعددة الأسطر", () => {
    const rows = AI.splitCsvRows('name,desc\r\nA,"سطر1\nسطر2"\nB,"x ""q"" y"\n\n');
    assert.strictEqual(rows.length, 3);
    assert.ok(rows[1].includes("سطر2"));
  });
  await t("cleanDescription يزيل الوسوم والتنسيق وعبارة «الوصف:»", () => {
    assert.strictEqual(AI.cleanDescription('<think>x</think>الوصف: "**كريم** مرطب للبشرة."'), "كريم مرطب للبشرة.");
  });

  console.log("\nالاتصال بالخادم");
  await t("يرسل توكن الدخول، ويقطّع جدول 85 صفاً إلى 3 دفعات بعناوين مكررة ويدمج النتائج", async () => {
    sent = [];
    nextResponse = (body) => {
      assert.ok(body.payload.fileText.startsWith("name,price\n"), "العناوين تتكرر في كل دفعة");
      const n = body.payload.fileText.split("\n").length - 1;
      const items = Array.from({ length: n }, (_, i) => ({ name: "منتج " + Math.random().toString(36).slice(2), price: 100 + i }));
      return { status: 200, body: { ok: true, data: { items } } };
    };
    const csv = "name,price\n" + Array.from({ length: 85 }, (_, i) => "p" + i + "," + (i + 1)).join("\n");
    const r = await AI.scanInvoice(csv, "text/csv", ["العطور"]);
    assert.strictEqual(sent.length, 3);
    assert.strictEqual(sent[0].init.headers.Authorization, "Bearer TOKEN123");
    assert.strictEqual(r.items.length, 85);
  });
  await t("فشل دفعة واحدة لا يُخفى: تحذير صريح مع بقية النتائج", async () => {
    sent = [];
    nextResponse = (body, n) => n === 2
      ? { status: 500, body: { error: "boom" } }
      : { status: 200, body: { ok: true, data: { items: [{ name: "منتج " + n + "x", price: 1 }] } } };
    const csv = "name,price\n" + Array.from({ length: 50 }, (_, i) => "p" + i + ",1").join("\n");
    const r = await AI.scanInvoice(csv, "text/csv", []);
    assert.ok(r.warnings.some(w => w.includes("فشلت الدفعة 2")));
    assert.ok(r.items.length >= 1);
  });
  await t("رد جزئي (partial) يظهر كتحذير", async () => {
    nextResponse = { status: 200, body: { ok: true, partial: true, data: { items: [{ name: "عطر ورد", price: 5 }] } } };
    const r = await AI.scanInvoice("QUJD", "image/png", []);
    assert.ok(r.warnings.some(w => w.includes("قُطع")));
  });
  await t("نوع ملف غير مدعوم يُرفض قبل أي طلب", async () => {
    sent = [];
    await assert.rejects(() => AI.scanInvoice("QUJD", "text/html", []), /غير مدعوم/);
    assert.strictEqual(sent.length, 0);
  });
  await t("parsePriceCommand: يمرّر الأقسام ويتحقق من الخطة", async () => {
    nextResponse = { status: 200, body: { ok: true, result: "{}", data: { action: "increase_percent", value: 10, category: "العناية بالشعر" } } };
    const plan = await AI.parsePriceCommand("ارفع اسعار الشعر 10%", cats);
    assert.strictEqual(plan.category, "العناية بالشعر");
    nextResponse = { status: 200, body: { ok: true, result: "{}", data: { action: "increase_percent", value: 10, category: "ملابس" } } };
    await assert.rejects(() => AI.parsePriceCommand("ارفع اسعار الملابس 10%", cats), /لم أجد قسماً/);
  });
  await t("generateDescription: يرفض الاسم الفارغ وينظّف الرد", async () => {
    await assert.rejects(() => AI.generateDescription("  "), /اسم المنتج/);
    nextResponse = { status: 200, body: { ok: true, result: "«وصف جميل للمنتج.»" } };
    assert.strictEqual(await AI.generateDescription("كريم", "العناية"), "وصف جميل للمنتج.");
  });
  await t("خطأ 404 بلا JSON ← رسالة تشرح أن الدوال غير منشورة", async () => {
    nextResponse = { status: 404, body: null };
    await assert.rejects(() => AI.generateDescription("كريم"), /Cloudflare Pages/);
  });
  await t("بدون تسجيل دخول لا يُرسل أي طلب", async () => {
    const saved = global.firebase;
    global.firebase = { auth: () => ({ currentUser: null }) };
    sent = [];
    await assert.rejects(() => AI.generateDescription("كريم"), /سجّل الدخول/);
    assert.strictEqual(sent.length, 0);
    global.firebase = saved;
  });

  console.log("\nمخطط JSON، شجرة الأقسام، الاسم الثنائي، التعطيل");
  await t("scanInvoice و parsePriceCommand يرسلان مخطط JSON للخادم", async () => {
    sent = [];
    nextResponse = { status: 200, body: { ok: true, data: { items: [{ name: "عطر ورد", price: 5 }] } } };
    await AI.scanInvoice("QUJD", "image/png", []);
    const sch = JSON.parse(sent[0].init.body).payload.schema;
    assert.ok(sch && sch.properties.items && sch.required.includes("items"));
    sent = [];
    nextResponse = { status: 200, body: { ok: true, result: "{}", data: { action: "reset_discount", value: 0, category: null } } };
    await AI.parsePriceCommand("الغ الخصم", ["العطور"]);
    const sch2 = JSON.parse(sent[0].init.body).payload.schema;
    assert.deepStrictEqual(sch2.properties.action.enum.includes("unclear"), true);
  });
  await t("الأقسام تُرسل بمسار «الأب › الفرعي» داخل الموجّه", () => {
    const prompt = AI.buildInvoicePrompt(["العناية بالشعر", "العناية بالشعر › الشامبو", { name: "عطور", path: "عطور" }], false);
    assert.ok(prompt.includes("العناية بالشعر › الشامبو") && prompt.includes("عطور"));
  });
  await t("نفس الاسم الفرعي تحت أبوين ← التباس يُرفض، والمسار الكامل يُقبل", () => {
    const cs = ["رجالي", "رجالي › أحذية", "نسائي", "نسائي › أحذية"];
    assert.throws(() => AI.normalizePricePlan({ action: "discount_percent", value: 10, category: "أحذية" }, cs), /لم أجد قسماً/);
    assert.strictEqual(AI.normalizePricePlan({ action: "discount_percent", value: 10, category: "نسائي › أحذية" }, cs).category, "نسائي › أحذية");
    assert.strictEqual(AI.normalizePricePlan({ action: "discount_percent", value: 10, category: "رجالي" }, cs).category, "رجالي");
  });
  await t("aiBilingualNames: افتراضياً ثنائي اللغة، وعند false يُطلب الاسم بلغته فقط", () => {
    assert.ok(AI.buildInvoicePrompt([], false).includes("Name in English"));
    global.STORE_CONFIG = { aiBilingualNames: false };
    const p = AI.buildInvoicePrompt([], false);
    delete global.STORE_CONFIG;
    assert.ok(!p.includes("Name in English") && p.includes("دون ترجمة"));
  });
  await t("aiEnabled:false يوقف كل الأدوات قبل أي طلب", async () => {
    global.STORE_CONFIG = { aiEnabled: false };
    sent = [];
    try {
      await assert.rejects(() => AI.generateDescription("كريم"), /معطّلة/);
      await assert.rejects(() => AI.parsePriceCommand("خصم 10%", []), /معطّلة/);
      await assert.rejects(() => AI.scanInvoice("QUJD", "image/png", []), /معطّلة/);
      assert.strictEqual(sent.length, 0);
    } finally { delete global.STORE_CONFIG; }
  });

  console.log("\nالتراجع عن التسعير (admin.js) ومطابقة الأقسام");
  const fs = require("fs"), vm = require("vm");
  const adminSrc = fs.readFileSync(path.join(__dirname, "..", "js", "admin.js"), "utf8");
  const grab = (n) => { const m = adminSrc.match(new RegExp("function " + n + "\\b[\\s\\S]*?\\n}\\n")); assert.ok(m, n); return m[0]; };
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(["cleanNameForMatch", "categoryPath", "matchCategory", "planPriceUndo"].map(grab).join("\n") + ";this.api={cleanNameForMatch,categoryPath,matchCategory,planPriceUndo}", ctx);
  const A = ctx.api;
  await t("planPriceUndo: يُرجع غير المعدَّل فقط، ويتجاهل ما عُدّل يدوياً بعد التسعير وما حُذف", () => {
    const rec = { rows: [
      { id: "a", before: { price: 100, oldPrice: 0, isOffer: false }, after: { price: 80, oldPrice: 100, isOffer: true } },
      { id: "b", before: { price: 200, oldPrice: 0, isOffer: false }, after: { price: 160, oldPrice: 200, isOffer: true } },
      { id: "c", before: { price: 50, oldPrice: 0, isOffer: false }, after: { price: 40, oldPrice: 50, isOffer: true } }
    ] };
    const products = [{ id: "a", price: 80, oldPrice: 100 }, { id: "b", price: 150, oldPrice: 200 }];   // b عُدّل يدوياً، c محذوف
    const r = A.planPriceUndo(products, rec);
    assert.strictEqual(r.restore.length, 1);
    assert.strictEqual(r.restore[0].p.id, "a");
    assert.strictEqual(r.skipped, 1);
    assert.strictEqual(r.missing, 1);
    assert.deepStrictEqual(r.restore[0].before, { price: 100, oldPrice: 0, isOffer: false });
  });
  await t("matchCategory: مسار كامل، فرعي مكرر ملتبس، وجزئي وحيد", () => {
    const cats = [{ id: "1", name: "رجالي", parentId: "" }, { id: "2", name: "أحذية", parentId: "1" },
                  { id: "3", name: "نسائي", parentId: "" }, { id: "4", name: "أحذية", parentId: "3" }, { id: "5", name: "عطور رجالية", parentId: "" }];
    assert.strictEqual(A.matchCategory("نسائي › أحذية", cats).id, "4");
    assert.strictEqual(A.matchCategory("أحذية", cats), null);                  // ملتبس
    assert.strictEqual(A.matchCategory("عطور", cats).id, "5");                 // جزئي وحيد
    assert.strictEqual(A.matchCategory("", cats), null);
    assert.strictEqual(A.categoryPath(cats[3], cats), "نسائي › أحذية");
  });

  console.log("\nفشل الحفظ في Firebase: تصنيف السبب وتعقيم أسماء الألوان/المقاسات");
  const storeSrc = fs.readFileSync(path.join(__dirname, "..", "js", "store.js"), "utf8");
  const grabStore = (n) => { const m = storeSrc.match(new RegExp("function " + n + "\\b[\\s\\S]*?\\n}\\n")); assert.ok(m, n); return m[0]; };
  const ctx3 = {}; vm.createContext(ctx3);
  vm.runInContext(grabStore("classifyWriteError") + ";this.classify=classifyWriteError", ctx3);
  await t("classifyWriteError: صلاحيات، مفتاح غير مسموح، شبكة، وغيرها", () => {
    const c = ctx3.classify;
    assert.strictEqual(c(new Error("PERMISSION_DENIED: Permission denied")).kind, "PERMISSION");
    assert.strictEqual(c({ code: "PERMISSION_DENIED", message: "x" }).kind, "PERMISSION");
    assert.strictEqual(c(new Error('Reference.update failed: First argument contains an invalid key (1.5L) in property')).kind, "KEY");
    assert.strictEqual(c(new Error("network error / Failed to fetch")).kind, "NETWORK");
    assert.strictEqual(c(new Error("شيء آخر")).kind, "OTHER");
  });
  const ctx4 = { Store: { getLastWriteError: () => ({ kind: "PERMISSION", message: "x" }) } }; vm.createContext(ctx4);
  vm.runInContext(["safeVariantName", "writeFailureMessage"].map(n => grab(n)).join("\n") + ";this.api={safeVariantName,writeFailureMessage}", ctx4);
  await t("safeVariantName: يزيل . $ # [ ] / | (مفاتيح Firebase) ويبقي الباقي", () => {
    const f = ctx4.api.safeVariantName;
    assert.strictEqual(f("1.5L"), "1٫5L");
    assert.strictEqual(f("50ml/100ml"), "50ml-100ml");
    assert.strictEqual(f("لون [فاتح] #2 $"), "لون -فاتح- -2 -");
    assert.strictEqual(f("أزرق||كحلي"), "أزرق--كحلي");
    assert.strictEqual(f("450 مل"), "450 مل");
    ["1.5L", "a/b", "x#y", "[z]", "$q"].forEach(v => assert.ok(!/[.$#\[\]\/]/.test(f(v)), v));
  });
  await t("writeFailureMessage: يذكر سبب الصلاحيات (ADMIN_UID) بنص عربي مفهوم", () => {
    const m = ctx4.api.writeFailureMessage("تعذّر الحفظ.");
    assert.ok(m.startsWith("تعذّر الحفظ.") && m.includes("PERMISSION_DENIED") && m.includes("ADMIN_UID"));
    ctx4.Store.getLastWriteError = () => ({ kind: "KEY", message: "k" });
    assert.ok(ctx4.api.writeFailureMessage("x").includes("رمزاً غير مسموح"));
    ctx4.Store.getLastWriteError = () => null;
    assert.ok(ctx4.api.writeFailureMessage("x").includes("حدّث الصفحة"));
  });

  console.log("\nألوان بصيغة كود (HEX)");
  await t("parseHexColor يقبل الصيغ الشائعة ويرفض الكلمات الشبيهة", () => {
    ["E07A5F", "#E07A5F", "0xE07A5F", "rgb(224,122,95)", "e07a5f"].forEach(v => assert.strictEqual(AI.parseHexColor(v), "#E07A5F", v));
    assert.strictEqual(AI.parseHexColor("#E75"), "#EE7755");
    assert.strictEqual(AI.parseHexColor("FFFFFF"), "#FFFFFF");
    ["facade", "تيراكوتا", "12345", "rgb(300,0,0)", "أحمر", "GG0000"].forEach(v => assert.strictEqual(AI.parseHexColor(v), null, v));
  });
  await t("hexToColorName: أسماء عربية معقولة للألوان الصريحة", () => {
    const exp = { "E07A5F": "تيراكوتا", "000000": "أسود", "FFFFFF": "أبيض", "1E3A8A": "كحلي", "FF0000": "أحمر", "8F6E4C": "بني", "ECC8AF": "بيج", "0000FF": "أزرق", "FFD700": "ذهبي", "FFFF00": "أصفر", "800000": "ماروني" };
    Object.keys(exp).forEach(h => assert.strictEqual(AI.hexToColorName(h), exp[h], h));
  });
  await t("splitColorEntry: «#E07A5F - تيراكوتا» يحتفظ باسم الملف، والاسم العادي ليس كوداً", () => {
    assert.deepStrictEqual(AI.splitColorEntry("#E07A5F - تيراكوتا"), { name: "تيراكوتا", hex: "#E07A5F" });
    assert.deepStrictEqual(AI.splitColorEntry("E07A5F"), { name: "تيراكوتا", hex: "#E07A5F" });
    assert.strictEqual(AI.splitColorEntry("أحمر"), null);
  });
  await t("لقطتك: ألوان الملف E07A5F/8F6E4C/ECC8AF تصير أسماء عربية بدرجاتها، والاسم المكرر يُميَّز", () => {
    const it = AI.normalizeItems([{ name: "أحمر شفاه جميل", colors: ["E07A5F", "8F6E4C", "#ECC8AF", "أسود", "E17B60", "أسود"] }]).items[0];
    assert.deepStrictEqual(it.colors, ["تيراكوتا", "بني", "بيج", "أسود", "تيراكوتا 2"]);
    assert.deepStrictEqual(it.colorHex, { "تيراكوتا": "#E07A5F", "بني": "#8F6E4C", "بيج": "#ECC8AF", "تيراكوتا 2": "#E17B60" });
  });
  await t("الموجّه يطلب إبقاء كود اللون كما هو ولا يخمّن اسمه", () => {
    assert.ok(AI.buildInvoicePrompt([], false).includes("#E07A5F") && AI.buildInvoicePrompt([], false).includes("ولا تخمّن اسمه"));
  });
  const palette = adminSrc.match(/const COLOR_PALETTE = \[[\s\S]*?\n\];/)[0];
  const ctx5 = { window: { StoreAI: AI } }; vm.createContext(ctx5);
  vm.runInContext(palette + "\n" + ["isTransparentOrInvalidColor", "getColorHex", "repairHexColorNames"].map(n => grab(n)).join("\n") + ";this.api={getColorHex,repairHexColorNames}", ctx5);
  await t("getColorHex: الاسم بصيغة كود ← الدرجة نفسها (لا الأزرق الافتراضي)، والأسماء العادية كما كانت", () => {
    assert.strictEqual(ctx5.api.getColorHex("E07A5F"), "#E07A5F");
    assert.strictEqual(ctx5.api.getColorHex("#ECC8AF"), "#ECC8AF");
    assert.strictEqual(ctx5.api.getColorHex("أسود"), "#0f172a");
    assert.strictEqual(ctx5.api.getColorHex("لون مجهول"), "#2563eb");
  });
  await t("repairHexColorNames: منتج قديم بلون اسمه «E07A5F» ← اسم عربي + درجة + مفاتيح مخزون جديدة بنفس الكميات", () => {
    const r = ctx5.api.repairHexColorNames([{ name: "E07A5F", hex: "#2563eb" }, { name: "أسود", hex: "#0f172a" }], { "E07A5F||15 مل": 3, "أسود||15 مل": 2 });
    assert.strictEqual(r.colors[0].name, "تيراكوتا"); assert.strictEqual(r.colors[0].hex, "#E07A5F"); assert.strictEqual(r.colors[1].name, "أسود");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.inventory)), { "تيراكوتا||15 مل": 3, "أسود||15 مل": 2 });   // JSON: كائن من سياق vm مختلف
    const same = ctx5.api.repairHexColorNames([{ name: "أسود", hex: "#000" }], { "أسود||_": 1 });
    assert.strictEqual(same.colors[0].name, "أسود");
  });

  console.log("\nالنتيجة: " + pass + " نجح، " + fail + " فشل");
  process.exit(fail ? 1 : 0);
})();
