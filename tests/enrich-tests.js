/* اختبار تكاملي لجودة الاستخراج والإثراء وكتابة الأوصاف: node tests/enrich-tests.js
   يربط عميل المتصفح (js/ai.js) بخادم /api/ai الحقيقي (functions/api/ai.js) ويحاكي Gemini وGroq بـ fetch وهمي. لا يتصل بالإنترنت.
   يتحقق من: التأسيس على مصادر بحث، رفض التخمين، قاعدة الأقسام، جودة الاستخراج (وصف مكرر/مقاسات خاطئة)،
   الشرح الإعلاني للناقص، وشارات المراجعة. */
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
const { pathToFileURL } = require("url");
let pass = 0, fail = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { pass++; console.log("  ✓ " + name); }, (e) => { fail++; console.log("  ✗ " + name + "\n      " + (e && e.stack || e)); });

const outbound = [];
let mode = "normal";
const SOURCES = [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "bounty.example" } },
                 { web: { uri: "https://shop.example/p/bounty", title: "shop.example" } }];

function geminiAnswer(prompt) {
  const grounded = (obj, chunks = SOURCES) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(obj) }] }, groundingMetadata: { groundingChunks: chunks } }] });
  const base = { found: true, confidence: "high", officialName: "", brand: "", productType: "", category: "", suggestedCategory: "", description: "", colors: [], sizes: [] };
  if (prompt.includes("شامبو باونتي")) return grounded(Object.assign(base, { officialName: "شامبو باونتي / Bounty Shampoo", brand: "Bounty", productType: "شامبو", category: "العناية بالشعر", description: "شامبو يغذّي الشعر ويمنحه لمعاناً وتجديداً بتركيبة مخصصة للاستخدام اليومي.", colors: ["شفاف", "ذهبي"], sizes: ["400ml", "10% + 1%"] }));
  if (prompt.includes("منتج مجهول")) return grounded(Object.assign(base, { found: false, confidence: "low" }), []);
  if (prompt.includes("كريم مشكوك")) return grounded(Object.assign(base, { confidence: "low", description: "وصف غير موثوق", colors: ["أحمر"] }));
  if (prompt.includes("منتج مخترع")) return grounded(Object.assign(base, { description: "وصف من الذاكرة", colors: ["أزرق"] }), []);
  if (prompt.includes("أحمر شفاه ماركة")) return grounded(Object.assign(base, { officialName: "Brand Lipstick", category: "", suggestedCategory: "مكياج", description: "أحمر شفاه بتغطية عالية وثبات يدوم طوال اليوم مع ملمس مريح.", colors: ["أحمر"] }));
  if (prompt.includes("سيروم نياسيناميد")) return grounded(Object.assign(base, { officialName: "The Ordinary Niacinamide 10% + Zinc 1%", category: "العناية بالبشرة", description: "سيروم نياسيناميد 10% + زنك 1%" /* صدى للاسم: يجب أن يُرفض */ }));
  return grounded(base, []);
}

function router(url, init) {
  const u = String(url);
  if (u === "/api/ai") {
    const req = { headers: { get: (h) => (h === "Authorization" ? (router.token === null ? null : "Bearer " + (router.token || "good")) : null) }, json: async () => JSON.parse(init.body) };
    return router.server.onRequestPost({ request: req, env: router.env });
  }
  outbound.push(u);
  if (u.includes("identitytoolkit")) return new Response(JSON.stringify({ users: [{ email: "admin@shop.com" }] }), { status: 200 });
  if (u.includes("generativelanguage")) {
    const body = JSON.parse(init.body); router.lastGemini = body;
    if (mode === "flaky" && (router.flaky = (router.flaky || 0) + 1) <= 2) return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 500 });
    if (mode === "no_grounding") return new Response(JSON.stringify({ error: { message: "google_search tool is not supported for this model" } }), { status: 400 });
    if (mode === "schema_reject" && body.generationConfig.responseJsonSchema) return new Response(JSON.stringify({ error: { message: "responseJsonSchema not allowed with tools" } }), { status: 400 });
    return new Response(JSON.stringify(geminiAnswer(body.contents[0].parts[0].text)), { status: 200 });
  }
  if (u.includes("api.groq.com")) {
    const body = JSON.parse(init.body); router.lastGroq = body; router.groqCalls = (router.groqCalls || 0) + 1;
    if (mode === "groq_down") return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 });
    const prompt = body.messages[1].content;
    if (!body.response_format) return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "جهاز عصري يجمع بين الأداء السريع والتصميم الأنيق ليرافقك في يومك." } }] }), { status: 200 });
    const rows = [...prompt.matchAll(/^(\d+)\. (.+)$/gm)].map(m => ({ i: +m[1], name: m[2] }));
    const descriptions = rows.map(r => r.name.includes("صدى") ? { i: r.i, text: r.name } : { i: r.i, text: "شرح إعلاني جذاب يوضح استخدام المنتج وفائدته للمستخدم بأسلوب مبسّط ومشجّع على الشراء." });
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ descriptions }) } }] }), { status: 200 });
  }
  return new Response("not found", { status: 404 });
}

(async () => {
  const tmp = path.join(os.tmpdir(), "ai_server_test_" + process.pid + ".mjs");
  fs.copyFileSync(path.join(__dirname, "..", "functions", "api", "ai.js"), tmp);
  router.server = await import(pathToFileURL(tmp).href);
  router.env = { FIREBASE_API_KEY: "k", ADMIN_EMAILS: "admin@shop.com", GEMINI_API_KEY: "g", GROQ_API_KEY: "q" };
  global.fetch = async (u, i) => router(u, i);
  global.firebase = { auth: () => ({ currentUser: { getIdToken: async () => "good" } }) };
  const AI = require(path.join(__dirname, "..", "js", "ai.js"));
  const cats = ["العناية بالشعر", "العناية بالبشرة"];
  const call = (action, payload, token) => { router.token = token; return fetch("/api/ai", { method: "POST", body: JSON.stringify({ action, payload }) }).then(async r => [r.status, await r.json()]); };
  const mk = (name, extra) => Object.assign({ name, category: "", price: 5000, qty: 7, barcode: "123", colors: [], sizes: [], description: "", image: null }, extra || {});

  console.log("الخادم: الأمان والبحث");
  await t("يرفض بلا توكن", async () => { const [st] = await call("gemini_search", { prompt: "x" }, null); assert.strictEqual(st, 401); router.token = undefined; });
  await t("بحث الصور أُلغي: الإجراء resolve_image لم يعد موجوداً (لا سطح SSRF)", async () => {
    const [st, body] = await call("resolve_image", { urls: ["https://shop.example/p/bounty"] });
    assert.strictEqual(st, 400); assert.strictEqual(body.code, "bad_action");
  });
  await t("gemini_search يرجع المصادر الفعلية ويرسل أداة البحث + المخطط بلا temperature", async () => {
    const [st, body] = await call("gemini_search", { prompt: "شامبو باونتي 400مل", schema: { type: "object", properties: {} } });
    assert.strictEqual(st, 200); assert.strictEqual(body.grounded, true); assert.strictEqual(body.sources.length, 2);
    assert.deepStrictEqual(router.lastGemini.tools, [{ google_search: {} }]);
    assert.ok(router.lastGemini.generationConfig.responseJsonSchema);
    assert.strictEqual(router.lastGemini.generationConfig.temperature, undefined);
  });
  await t("رفض الجمع بين المخطط والأداة ← يعيد بدون مخطط ويحلل JSON", async () => {
    mode = "schema_reject";
    const [st, body] = await call("gemini_search", { prompt: "شامبو باونتي 400مل", schema: { type: "object", properties: {} } });
    mode = "normal";
    assert.strictEqual(st, 200); assert.strictEqual(body.data.found, true); assert.ok(!router.lastGemini.generationConfig.responseJsonSchema);
  });
  await t("نموذج بلا بحث ← خطأ no_grounding بنص واضح", async () => {
    mode = "no_grounding";
    const [st, body] = await call("gemini_search", { prompt: "شامبو باونتي" });
    mode = "normal";
    assert.strictEqual(st, 422); assert.strictEqual(body.code, "no_grounding"); assert.ok(body.error.includes("GEMINI_ENRICH_MODEL"));
  });

  console.log("\nجودة الاستخراج (حالة لقطة الشاشة)");
  await t("اسم المنتج في الوصف + «10% + 1%» كمقاس + لون «شفاف»: كلها تُنظَّف قبل المراجعة", () => {
    const r = AI.normalizeItems([{ name: "سيروم نياسيناميد / Niacinamide Serum", description: "سيروم نياسيناميد 10% + زنك 1% (The Ordinary)", sizes: ["10% + 1%", "30ml"], colors: ["شفاف", "50ml"], category: "العناية بالشعر", price: "12,000", qty: 1 }]);
    const it = r.items[0];
    assert.strictEqual(it.description, ""); assert.strictEqual(it.descKind, "");
    assert.deepStrictEqual(it.sizes, ["30ml"]); assert.deepStrictEqual(it.colors, []);
    assert.strictEqual(it.price, 12000);
  });
  await t("الوصف الحقيقي من الملف يبقى ويُعلَّم source", () => {
    const d = "سيروم خفيف يساعد على توحيد لون البشرة ويمنح مظهراً أكثر نضارة وإشراقاً مع الاستخدام اليومي.";
    const it = AI.normalizeItems([{ name: "سيروم نياسيناميد", description: d }]).items[0];
    assert.strictEqual(it.description, d); assert.strictEqual(it.descKind, "source");
  });
  await t("مدقق المقاسات: يقبل الأحجام والمقاسات الحقيقية ويرفض النسب والتراكيز", () => {
    ["30ml", "50 مل", "XL", "256GB", "42", "2×50ml", "12 قطعة", "مقاس واحد"].forEach(v => assert.ok(AI.isValidSize(v), v));
    ["10% + 1%", "5%", "1", "طويل", "100"].forEach(v => assert.ok(!AI.isValidSize(v), v));
  });
  await t("الموجّه: التراكيز جزء من الاسم، ممنوع الاسم في الوصف، النوع ثم الماركة ثم الاقتراح، ولقطة العبوة", () => {
    const p = AI.buildInvoicePrompt(["العناية بالبشرة"], false);
    assert.ok(p.includes("جزء من الاسم") && p.includes("ممنوع منعاً باتاً") && p.includes("نوع المنتج أولاً") && p.includes("ممنوع إجبار المنتج") && p.includes("عبوة منتج واحد"));
  });

  console.log("\nإثراء ببحث Google (وصف رسمي، ألوان، مقاسات، قسم)");
  await t("منتج معروف: وصف رسمي (descKind=official) وألوان/مقاسات صالحة وقسم، ولا يمس الاسم والسعر والكمية، ولا صورة", async () => {
    const r = await AI.enrichItems([mk("شامبو باونتي 400مل")], cats, {});
    const it = r.items[0];
    assert.strictEqual(it.name, "شامبو باونتي 400مل"); assert.strictEqual(it.price, 5000); assert.strictEqual(it.qty, 7); assert.strictEqual(it.barcode, "123");
    assert.ok(it.description.startsWith("شامبو يغذّي الشعر")); assert.strictEqual(it.descKind, "official");
    assert.deepStrictEqual(it.colors, ["ذهبي"]); assert.deepStrictEqual(it.sizes, ["400ml"]);   // «شفاف» و«10% + 1%» حُذفا
    assert.strictEqual(it.category, "العناية بالشعر"); assert.strictEqual(it.image, null);
    assert.strictEqual(it.enriched.state, "high"); assert.strictEqual(it.enriched.officialName, "شامبو باونتي / Bounty Shampoo");
    assert.ok(!outbound.some(u => /ibb|imgbb|og:image/.test(u)));
  });
  await t("وصف البحث الذي يكرر الاسم يُرفض (لا يدخل خانة الوصف)", async () => {
    const r = await AI.enrichItems([mk("سيروم نياسيناميد 10% + زنك 1%")], cats, {});
    assert.strictEqual(r.items[0].description, ""); assert.strictEqual(r.items[0].category, "العناية بالبشرة");
  });
  await t("غير موجود / ثقة منخفضة / رد بلا مصادر (هلوسة): لا يُملأ شيء ويُحذَّر", async () => {
    for (const n of ["منتج مجهول 77", "كريم مشكوك", "منتج مخترع"]) {
      const r = await AI.enrichItems([mk(n)], cats, {});
      const it = r.items[0];
      assert.strictEqual(it.description, "", n); assert.deepStrictEqual(it.colors, [], n); assert.ok(["notfound", "low"].includes(it.enriched.state), n);
    }
  });
  await t("لا قسم مطابق: يقترح قسماً بنوع المنتج", async () => {
    const r = await AI.enrichItems([mk("أحمر شفاه ماركة")], cats, {});
    assert.strictEqual(r.items[0].category, "مكياج");
  });
  await t("لا يستبدل ما كتبه التاجر (وصف/لون موجودان)", async () => {
    const r = await AI.enrichItems([mk("شامبو باونتي 400مل", { description: "وصف التاجر", colors: ["أسود"] })], cats, {});
    assert.strictEqual(r.items[0].description, "وصف التاجر"); assert.deepStrictEqual(r.items[0].colors, ["أسود"]);
  });
  await t("skip والحد aiEnrichMax وaiEnrich:false", async () => {
    const before = outbound.filter(u => u.includes("generativelanguage")).length;
    global.STORE_CONFIG = { aiEnrichMax: 2 };
    const items = ["شامبو باونتي 1", "شامبو باونتي 2", "شامبو باونتي 3", "شامبو باونتي 4"].map(n => mk(n));
    const r = await AI.enrichItems(items, cats, { skip: it => it.name.endsWith("4") });
    assert.strictEqual(outbound.filter(u => u.includes("generativelanguage")).length - before, 2);
    assert.ok(r.warnings.some(w => w.includes("أول 2")) && !r.items[3].enriched);
    global.STORE_CONFIG = { aiEnrich: false };
    const b2 = outbound.length; await AI.enrichItems([mk("شامبو باونتي")], cats, {}); delete global.STORE_CONFIG;
    assert.strictEqual(outbound.length, b2);
  });
  await t("خطأ مؤقت في البحث: يعيد المحاولة (حتى 3) فينجح بدل أن يفشل المنتج", async () => {
    mode = "flaky"; router.flaky = 0;
    const r = await AI.enrichItems([mk("شامبو باونتي 400مل")], cats, { retryDelayMs: 1 });
    mode = "normal";
    assert.strictEqual(r.items[0].enriched.state, "high"); assert.ok(!r.warnings.some(w => w.includes("فشل إثراء")));
    assert.strictEqual(router.flaky, 3);
  });
  await t("نموذج بلا بحث: يتوقف بتحذير ولا يكرر الطلبات الفاشلة", async () => {
    mode = "no_grounding";
    const before = outbound.filter(u => u.includes("generativelanguage")).length;
    const r = await AI.enrichItems(Array.from({ length: 12 }, (_, i) => mk("شامبو باونتي " + i)), cats, {});
    mode = "normal";
    assert.ok(outbound.filter(u => u.includes("generativelanguage")).length - before <= 4);
    assert.ok(r.warnings.some(w => w.startsWith("توقف الإثراء")));
  });

  console.log("\nالشرح الإعلاني للمنتجات بلا وصف");
  await t("يكتب شرحاً للناقص فقط (descKind=ad) ولا يمس الموجود، ويقسّم 20 منتجاً على 3 طلبات", async () => {
    router.groqCalls = 0;
    const items = Array.from({ length: 20 }, (_, i) => mk("منتج رقم " + i, i === 3 ? { description: "وصف التاجر", descKind: "source" } : {}));
    const r = await AI.completeDescriptions(items, {});
    assert.strictEqual(router.groqCalls, 3);                        // 19 ناقصاً ÷ 8
    assert.strictEqual(r.items[3].description, "وصف التاجر"); assert.strictEqual(r.items[3].descKind, "source");
    assert.ok(r.items.filter((_, i) => i !== 3).every(it => it.descKind === "ad" && it.description.length > 30));
    assert.ok(router.lastGroq.messages[0].content.includes("إلكترونيات") && router.lastGroq.messages[0].content.includes("ممنوع اختراع"));
    assert.strictEqual(router.lastGroq.response_format.type, "json_schema");
  });
  await t("شرح يكرر اسم المنتج يُرفض (يبقى فارغاً مع تحذير)، وskip يتجاوز المحدد", async () => {
    const r = await AI.completeDescriptions([mk("سيروم صدى الجمال"), mk("كريم عادي")], { skip: it => it.name === "كريم عادي" });
    assert.strictEqual(r.items[0].description, ""); assert.strictEqual(r.items[1].description, "");
    assert.ok(r.warnings.some(w => w.includes("لم يُنتج له وصف")));
  });
  await t("فشل Groq لا يكسر: المنتجات تبقى كما هي مع تحذير", async () => {
    mode = "groq_down";
    const r = await AI.completeDescriptions([mk("كريم أ"), mk("كريم ب")], {});
    mode = "normal";
    assert.ok(r.items.every(it => it.description === "")); assert.ok(r.warnings.some(w => w.includes("تعذّر كتابة أوصاف")));
  });
  await t("الشرح المفرد (زر ✨) يستعمل نفس قواعد الدقة", async () => {
    const txt = await AI.generateDescription("هاتف ذكي", "إلكترونيات");
    assert.ok(txt.length > 20); assert.ok(router.lastGroq.messages[0].content.includes("ممنوع الادعاءات الطبية"));
  });

  console.log("\nمسار كامل: الاستخراج ← البحث ← الشرح (سيناريو لقطتك)");
  await t("منتجان من ملف بلا أوصاف: الأول يُثرى برسمي، الثاني (مجهول) يأخذ شرحاً إعلانياً، والبيانات الخاطئة لا تدخل", async () => {
    const extracted = AI.normalizeItems([
      { name: "شامبو باونتي 400مل", description: "شامبو باونتي 400مل", sizes: ["10% + 1%"], category: "العناية بالبشرة", price: 5000, qty: 4 },
      { name: "منتج مجهول 77", price: 2000, qty: 3 }
    ]).items;
    const enriched = (await AI.enrichItems(extracted, cats, {})).items;
    const done = (await AI.completeDescriptions(enriched, {})).items;
    assert.strictEqual(done[0].descKind, "official"); assert.deepStrictEqual(done[0].sizes, ["400ml"]); assert.strictEqual(done[0].category, "العناية بالشعر");
    assert.strictEqual(done[1].descKind, "ad"); assert.strictEqual(done[1].enriched.state, "notfound");
    assert.ok(done.every(it => it.price > 0 && it.qty > 0));
  });

  console.log("\nلوحة الأدمن: شارات المراجعة");
  const app = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  const adminSrc = fs.readFileSync(path.join(__dirname, "..", "js", "admin.js"), "utf8");
  const grab = (src, n) => { const m = src.match(new RegExp("function " + n + "\\b[\\s\\S]*?\\n}\\n")); assert.ok(m, n); return m[0]; };
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(["escapeHtml", "safeUrl"].map(n => grab(app, n)).join("\n") + ["cleanNameForMatch", "enrichBadgesHtml", "findExistingFor"].map(n => grab(adminSrc, n)).join("\n") + ";this.api={enrichBadgesHtml,findExistingFor}", ctx);
  await t("الشارات تهرّب النصوص الخبيثة وتعرض الثقة ونوع الوصف", () => {
    const h = ctx.api.enrichBadgesHtml({ name: "شامبو", descKind: "ad", enriched: { state: "medium", officialName: '<img src=x onerror=alert(1)>', sources: [{ uri: "javascript:alert(1)", title: "<b>x</b>" }], addedVariants: true } });
    assert.ok(!h.includes("<img src=x") && !h.includes("<b>x</b>") && !/href="javascript:/i.test(h));
    assert.ok(h.includes("ثقة متوسطة") && h.includes("شرح إعلاني عام") && h.includes("سيُوزَّع المخزون"));
    assert.ok(ctx.api.enrichBadgesHtml({ name: "x", descKind: "official" }).includes("مواصفات رسمية"));
    assert.strictEqual(ctx.api.enrichBadgesHtml({ name: "x", descKind: "source" }), "");
    assert.ok(!adminSrc.includes("webImage") && !adminSrc.includes("btnCompleteMissing"));
  });
  await t("findExistingFor: بالباركود ثم بالاسم الموحَّد", () => {
    const ex = [{ id: "1", name: "كريم مرطبة", barcode: "" }, { id: "2", name: "حذاء", sku: "999" }];
    assert.strictEqual(ctx.api.findExistingFor({ name: "كريم مرطبه" }, ex).id, "1");
    assert.strictEqual(ctx.api.findExistingFor({ name: "شيء آخر", barcode: "999" }, ex).id, "2");
    assert.strictEqual(ctx.api.findExistingFor({ name: "لا شيء" }, ex), undefined);
  });

  fs.unlinkSync(tmp);
  console.log("\nالنتيجة: " + pass + " نجح، " + fail + " فشل");
  process.exit(fail ? 1 : 0);
})();
