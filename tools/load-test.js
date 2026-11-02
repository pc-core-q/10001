#!/usr/bin/env node
/* اختبار حمل لمتجرك: يحاكي زواراً يقرؤون من Firebase بنفس طلبات المتجر الفعلية (REST).
   الاستعمال:   node tools/load-test.js --dry                       (تقدير فقط، بلا أي طلب)
                node tools/load-test.js --visitors 200 --concurrency 10
   خيارات: --visitors N (افتراضي 20، أقصى 5000) | --concurrency C (افتراضي 5، أقصى 50) | --new-ratio 0.3 (نسبة الزوار الجدد)
           --think MS (متوسط التوقف بين خطوات الزائر، افتراضي 800) | --config PATH | --yes (يلزم عند تقدير تنزيل > 100MB)
   قيود أمان: الأداة تستهدف فقط قاعدة Firebase المكتوبة في js/config.js (نطاق firebaseio.com / firebasedatabase.app، أو localhost للاختبار).
   تنبيه: كل زائر «جديد» يحمّل الفهرس كاملاً ويُحسب من حصة التنزيل الشهرية (Spark = 10GB). لا تشغّلها على قاعدة غيرك. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const argv = process.argv.slice(2);
function opt(name, def) { const i = argv.indexOf("--" + name); if (i < 0) return def; const v = argv[i + 1]; return (v === undefined || v.startsWith("--")) ? true : v; }
const DRY = argv.includes("--dry"), YES = argv.includes("--yes");
const VISITORS = Math.max(1, Math.min(5000, parseInt(opt("visitors", 20), 10) || 20));
const CONC = Math.max(1, Math.min(50, parseInt(opt("concurrency", 5), 10) || 5));
const NEW_RATIO = Math.max(0, Math.min(1, parseFloat(opt("new-ratio", 0.3))));
const THINK = Math.max(0, parseInt(opt("think", 800), 10) || 0);
const CONFIG = path.resolve(String(opt("config", path.join(__dirname, "..", "js", "config.js"))));
const SPARK_DOWNLOAD = 10 * 1024 * 1024 * 1024;

function fail(msg) { console.error("✗ " + msg); process.exit(1); }
const mb = (b) => (b / 1048576).toFixed(2) + " MB";

let cfg;
try { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync(CONFIG, "utf8") + "\n;this.__C = STORE_CONFIG;", ctx); cfg = ctx.__C; }
catch (e) { fail("تعذّرت قراءة " + CONFIG + ": " + e.message); }
const DB = String(cfg.firebaseDatabaseURL || "").trim().replace(/\/+$/, "");
if (!DB) fail("firebaseDatabaseURL فارغ في config.js");
let host; try { host = new URL(DB).hostname; } catch (e) { fail("firebaseDatabaseURL غير صالح"); }
if (!(/(\.|^)firebaseio\.com$/.test(host) || /(\.|^)firebasedatabase\.app$/.test(host) || host === "localhost" || host === "127.0.0.1"))
  fail("النطاق «" + host + "» غير مسموح: الأداة تعمل فقط على قاعدة Firebase الخاصة بمتجرك.");

const stats = { reqs: 0, ok: 0, fail: 0, bytes: 0, lat: [], codes: {}, errors: {} };
async function get(p, qs) {
  const t0 = Date.now(); stats.reqs++;
  try {
    const res = await fetch(DB + "/" + p + ".json" + (qs || ""), { headers: { "accept-encoding": "gzip" } });
    const buf = Buffer.from(await res.arrayBuffer());
    stats.bytes += buf.length; stats.lat.push(Date.now() - t0); stats.codes[res.status] = (stats.codes[res.status] || 0) + 1;
    if (res.ok) stats.ok++; else stats.fail++;
    return res.ok ? buf : null;
  } catch (e) { stats.fail++; stats.errors[e.cause && e.cause.code || e.message] = (stats.errors[e.cause && e.cause.code || e.message] || 0) + 1; return null; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK ? THINK * (0.4 + Math.random() * 1.2) : 0);
let productIds = [];
function learnIds(buf) {
  try { const v = JSON.parse(buf.toString("utf8")); const ids = Array.isArray(v) ? v.map((r) => r && (r.id || r.i)).filter(Boolean) : Object.keys(v || {}); if (ids.length) productIds = ids; } catch (e) { /* ignore */ }
}
async function viewProducts() {
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n && productIds.length; i++) { await think(); await get("ws_products/" + encodeURIComponent(productIds[Math.floor(Math.random() * productIds.length)])); }
}
// زائر جديد (بلا كاش): كل ما تطلبه أول زيارة. زائر عائد: فحص رقمي خفيف فقط.
async function visitor(isNew) {
  if (isNew) {
    await get("ws_meta_v"); await get("ws_index/v"); await get("ws_index/e");
    const idx = await get("ws_index/items"); if (idx) learnIds(idx);
    await get("ws_categories"); await get("ws_settings"); await get("ws_ads");
  } else { await get("ws_meta_v"); await get("ws_index/v"); }
  await viewProducts();
}

(async function main() {
  console.log("الهدف: " + host + "  |  زوار: " + VISITORS + "  |  تزامن: " + CONC + "  |  نسبة الجدد: " + Math.round(NEW_RATIO * 100) + "%\n");
  // قياس حجم الفهرس الفعلي بطلب واحد (يُحتسب ضمن الاستهلاك)
  const probe = await get("ws_index/items");
  if (!probe) fail("تعذّر قراءة ws_index/items (تحقق من الاتصال والقواعد: يجب أن تكون القراءة عامة).");
  learnIds(probe);
  const indexBytes = probe.length, newCost = indexBytes + 60 * 1024, retCost = 6 * 1024, prodCost = 2 * 1024 * 2;
  const estTotal = VISITORS * (NEW_RATIO * newCost + (1 - NEW_RATIO) * retCost + prodCost);
  const perUnique = NEW_RATIO * newCost + (1 - NEW_RATIO) * 5 * retCost + 2 * prodCost;   // زائر فريد شهرياً: 5 زيارات للعائد
  console.log("حجم الفهرس الفعلي: " + mb(indexBytes) + " (" + productIds.length + " منتج)");
  console.log("تقدير تنزيل هذه التجربة: " + mb(estTotal) + " ≈ " + (estTotal / SPARK_DOWNLOAD * 100).toFixed(2) + "% من حصة Spark الشهرية (10GB)");
  console.log("بهذا النمط تتّسع حصة 8GB لنحو " + Math.floor(0.8 * SPARK_DOWNLOAD / perUnique).toLocaleString("en") + " زائر فريد شهرياً (تقدير)\n");
  if (DRY) { console.log("وضع --dry: لم يُرسل أي حمل."); return; }
  if (estTotal > 100 * 1048576 && !YES) fail("التجربة ستستهلك أكثر من 100MB من حصتك. أضف --yes للمتابعة أو خفّض --visitors.");

  const queue = Array.from({ length: VISITORS }, (_, i) => i < Math.round(VISITORS * NEW_RATIO));
  for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
  const t0 = Date.now(); let done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) { await visitor(queue.pop()); done++; if (done % 25 === 0) process.stdout.write("  …" + done + "/" + VISITORS + "\r"); } }));
  const sec = (Date.now() - t0) / 1000, lat = stats.lat.slice().sort((a, b) => a - b), q = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0;
  console.log("\n──────── النتيجة ────────");
  console.log("المدة: " + sec.toFixed(1) + " ث  |  الطلبات: " + stats.reqs + " (نجح " + stats.ok + "، فشل " + stats.fail + ")  |  " + (stats.reqs / sec).toFixed(1) + " طلب/ث");
  console.log("زمن الاستجابة: متوسط " + Math.round(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)) + "ms  |  p50 " + q(0.5) + "ms  |  p95 " + q(0.95) + "ms  |  أقصى " + (lat[lat.length - 1] || 0) + "ms");
  console.log("التنزيل الفعلي (بعد فكّ الضغط): " + mb(stats.bytes) + " ≈ " + (stats.bytes / SPARK_DOWNLOAD * 100).toFixed(2) + "% من حصة الشهر");
  console.log("رموز الاستجابة: " + JSON.stringify(stats.codes) + (Object.keys(stats.errors).length ? "  أخطاء شبكة: " + JSON.stringify(stats.errors) : ""));
  if (stats.codes[429] || stats.codes[503]) console.log("⚠️ ظهرت 429/503: ضغط أو حدّ على الخادم — خفّض التزامن.");
  process.exit(stats.fail > stats.reqs * 0.05 ? 2 : 0);
})();