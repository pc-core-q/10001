#!/usr/bin/env node
/* فحص ملف js/config.js قبل تسليم المتجر:  node tools/check-config.js
   يتأكد أن كل الخدمات معبّأة بصيغة صحيحة، وأن الألوان والقالب سليمة، وينبّه لأي خطر أمني.
   يخرج بالرمز 1 إذا وُجد خطأ (✗)، والتحذيرات (!) لا توقف التسليم. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js", "config.js"), "utf8");
const ctx = vm.createContext({});
vm.runInContext(src + "\n;this.__C = STORE_CONFIG;", ctx);
const C = ctx.__C;
const tctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "js", "themes.js"), "utf8") + "\n;this.T = STORE_THEMES;", tctx);
const presets = Object.keys(tctx.T);

let errors = 0, warns = 0;
const ok = m => console.log("  ✓ " + m);
const bad = m => { errors++; console.log("  ✗ " + m); };
const warn = m => { warns++; console.log("  ! " + m); };
const empty = v => v == null || String(v).trim() === "" || /^YOUR_/i.test(String(v).trim());
const hex = v => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v).trim());

// أي قيمة ما زالت تحوي YOUR_ (من config.template.js) تعتبر غير معبّأة
(function scan(o, pathName) {
  Object.keys(o).forEach(k => {
    const v = o[k], name = pathName ? pathName + "." + k : k;
    if (v && typeof v === "object") scan(v, name);
    else if (typeof v === "string" && /YOUR_/.test(v)) bad(name + " ما زال يحوي YOUR_ (غير معبّأ): " + v);
  });
})(C, "");

console.log("\n1) هوية المتجر");
empty(C.storeName) ? bad("storeName فارغ") : ok("storeName = " + C.storeName);
if (/^(test|متجرك)/i.test(String(C.storeName || "").trim())) warn("storeName ما زال قيمة تجريبية (" + C.storeName + ")");
fs.existsSync(path.join(root, C.logo || "")) ? ok("الشعار موجود: " + C.logo) : bad("ملف الشعار غير موجود: " + C.logo);
empty(C.currencySymbol) ? bad("currencySymbol فارغ") : ok("العملة: " + C.currencySymbol);

console.log("\n2) التواصل (اختياري هنا — يمكن تعبئته من لوحة التحكم)");
if (empty(C.whatsappNumber)) warn("whatsappNumber فارغ: يجب تعبئته هنا أو من لوحة التحكم وإلا لن يُقبل إتمام الطلب");
else if (!/^\d{10,15}$/.test(String(C.whatsappNumber))) bad("whatsappNumber يجب أن يكون أرقاماً فقط بصيغة دولية بدون + (مثال 9647801234567)");
else ok("whatsappNumber صالح");
["instagram", "tiktok", "mapUrl"].forEach(k => { if (!empty(C[k]) && !/^https?:\/\//i.test(C[k])) bad(k + " يجب أن يبدأ بـ https://"); });

console.log("\n3) Firebase");
["firebaseApiKey", "firebaseAuthDomain", "firebaseProjectId", "firebaseStorageBucket", "firebaseMessagingSenderId", "firebaseAppId", "firebaseDatabaseURL"]
  .forEach(k => empty(C[k]) ? bad(k + " فارغ") : ok(k));
if (!empty(C.firebaseDatabaseURL) && !/^https:\/\/.+\.(firebasedatabase\.app|firebaseio\.com)\/?$/.test(C.firebaseDatabaseURL)) bad("firebaseDatabaseURL غير مطابق للصيغة https://PROJECT-default-rtdb.REGION.firebasedatabase.app/");
if (!empty(C.firebaseProjectId) && !empty(C.firebaseAuthDomain) && C.firebaseAuthDomain.indexOf(C.firebaseProjectId) !== 0) warn("firebaseAuthDomain لا يطابق firebaseProjectId — تأكد أنهما من نفس المشروع");
if (!empty(C.firebaseProjectId) && !empty(C.firebaseDatabaseURL) && C.firebaseDatabaseURL.indexOf(C.firebaseProjectId) === -1) warn("firebaseDatabaseURL لا يحوي firebaseProjectId — تأكد أنه من نفس المشروع");
Array.isArray(C.adminEmails) && C.adminEmails.length && C.adminEmails.every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
  ? ok("adminEmails: " + C.adminEmails.join(", ")) : bad("adminEmails يجب أن تكون قائمة إيميلات صالحة");
if ((C.adminEmails || []).some(e => /^a@email\.com$/i.test(e))) warn("adminEmails يحوي الإيميل التجريبي a@email.com");

console.log("\n4) الصور");
empty(C.imgbbApiKey) ? bad("imgbbApiKey فارغ (لن يعمل رفع الصور)") : ok("imgbbApiKey");
if (empty(C.imageKitEndpoint)) warn("imageKitEndpoint فارغ: الصور تعمل من ImgBB مباشرة بدون ضغط/تسريع");
else if (!/^https:\/\/[^/]+\/[^/]+$/.test(C.imageKitEndpoint)) bad("imageKitEndpoint يجب أن يكون https://ik.imagekit.io/YOUR_ID بدون / في النهاية");
else ok("imageKitEndpoint");

console.log("\n5) Google Analytics و Algolia");
if (empty(C.googleAnalyticsId)) warn("googleAnalyticsId فارغ: التتبع معطّل");
else /^G-[A-Z0-9]{4,}$/i.test(C.googleAnalyticsId) ? ok("googleAnalyticsId = " + C.googleAnalyticsId) : bad("googleAnalyticsId يجب أن يبدأ بـ G-");
if (!empty(C.algoliaAdminKey)) bad("algoliaAdminKey معبّأ! الملف عام ويراه كل زائر — احذفه وبدّل المفتاح من لوحة Algolia");
if (C.useAlgolia === true && (empty(C.algoliaAppId) || empty(C.algoliaSearchKey))) bad("useAlgolia=true لكن algoliaAppId/algoliaSearchKey ناقصان");
else ok("Algolia: " + (C.useAlgolia ? "مفعّل" : "معطّل"));

console.log("\n6) الثيم");
const T = C.theme || {};
presets.includes(T.preset) ? ok("preset = " + T.preset) : bad("theme.preset غير معروف. المتاح: " + presets.join(" | "));
Object.keys(T.colors || {}).forEach(k => { const v = T.colors[k]; if (!empty(v) && !hex(v)) bad("theme.colors." + k + " ليس لوناً صالحاً (#RRGGBB): " + v); });
empty(T.fontFamily) ? ok("الخط من الثيم") : ok("الخط مخصص: " + T.fontFamily + (empty(T.fontWeights) ? "" : " (" + T.fontWeights + ")"));
if (!empty(T.fontFamily) && !empty(T.fontWeights) && /almarai/i.test(T.fontFamily) && /500|600/.test(T.fontWeights)) bad("Almarai لا يدعم الوزن 500/600 (المتاح 300;400;700;800) — سيفشل تحميل الخط");
if (!empty(T.cardImageRatio) && !/^\d+\s*\/\s*\d+$/.test(String(T.cardImageRatio))) bad('cardImageRatio يجب أن يكون مثل "1/1" أو "4/5" أو فارغاً');
if (!empty(T.cardImageFit) && !["cover", "contain"].includes(T.cardImageFit)) bad('cardImageFit يجب أن يكون "cover" أو "contain" أو فارغاً');
["radiusCard", "radiusControl"].forEach(k => { if (!empty(T[k]) && !(Number(T[k]) >= 0 && Number(T[k]) <= 60)) bad(k + " يجب أن يكون رقماً بين 0 و60 أو فارغاً"); });
if (T.cardSizes && typeof T.cardSizes === "object") {
  Object.keys(T.cardSizes).forEach(pl => {
    if (["homeProducts", "homeCategories", "productsPage", "categoriesPage"].indexOf(pl) < 0) return bad("theme.cardSizes." + pl + " موضع غير معروف");
    Object.keys(T.cardSizes[pl] || {}).forEach(f => {
      if (["width", "height", "mobileWidth", "mobileHeight"].indexOf(f) < 0) return bad("theme.cardSizes." + pl + "." + f + " حقل غير معروف");
      const v = T.cardSizes[pl][f], lim = /height/i.test(f) ? [100, 900] : [80, 700];
      if (!empty(v) && !(Number(v) >= lim[0] && Number(v) <= lim[1])) bad("theme.cardSizes." + pl + "." + f + " يجب أن يكون رقماً بين " + lim[0] + " و" + lim[1] + " أو فارغاً");
    });
  });
}
if (!empty(T.containerWidth) && !(Number(T.containerWidth) >= 900 && Number(T.containerWidth) <= 2000)) bad("containerWidth يجب أن يكون بين 900 و2000 أو فارغاً");
if (T.allowPreview === true) warn("theme.allowPreview = true: عطّله قبل النشر النهائي");

console.log("\n7) SEO وإصدارات");
if (empty(C.siteUrl)) warn("siteUrl فارغ: روابط المشاركة (og:url/og:image) تُؤخذ من نطاق الزائر تلقائياً");
else if (!/^https:\/\/[^/]+$/.test(C.siteUrl)) bad("siteUrl يجب أن يكون https://domain بدون / في النهاية");
else ok("siteUrl");
Number.isInteger(C.dataVersion) && C.dataVersion >= 1 ? ok("dataVersion = " + C.dataVersion) : bad("dataVersion يجب أن يكون عدداً صحيحاً ≥ 1");
if (C.assetVersion) {
  const html = fs.readdirSync(root).filter(f => f.endsWith(".html"));
  const mism = html.filter(f => Array.from(fs.readFileSync(path.join(root, f), "utf8").matchAll(/\?v=(\d+)/g)).some(m => Number(m[1]) !== Number(C.assetVersion)));
  mism.length ? warn("assetVersion=" + C.assetVersion + " لا يطابق ?v= في: " + mism.join(", ") + " — شغّل: node tools/set-version.js " + C.assetVersion) : ok("assetVersion متطابق مع كل صفحات HTML");
}

console.log("\n" + (errors ? "✗ " + errors + " خطأ" : "✓ لا أخطاء") + " — " + warns + " تحذير");
process.exit(errors ? 1 : 0);
