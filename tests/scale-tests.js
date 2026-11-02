/* اختبارات بنية التوسّع (حتى 10,000 منتج): node tests/scale-tests.js
   تغطي: الفهرس المصغّر، IndexedDB + الاحتياطي، المزامنة التفاضلية، الكتابة الجزئية ws_products/{id}، الترحيل غير المدمِّر،
   قراءة المنتج بالمعرّف، والخروج المبكر في البحث/القوائم. بلا اعتماديات (قاعدة Firebase وIndexedDB وهميتان).
   ليست جزءاً من الموقع. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const DBURL = "https://test-default-rtdb.firebasedatabase.app";
const FB_CFG = { firebaseDatabaseURL: DBURL, firebaseApiKey: "k", firebaseAuthDomain: "d", firebaseProjectId: "p", firebaseAppId: "a" };

function makeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); },
    key: i => Array.from(m.keys())[i] || null, get length() { return m.size; }, clear: () => m.clear() };
}

/* IndexedDB وهمي صغير: يكفي لـ open/createObjectStore/transaction/get/put/delete (غير متزامن كالحقيقي) */
function makeFakeIDB() {
  const stores = {};
  return {
    _stores: stores,
    open() {
      const req = {};
      setTimeout(function () {
        const db = {
          objectStoreNames: { contains: n => !!stores[n] },
          createObjectStore(n) { stores[n] = stores[n] || new Map(); },
          transaction(n) {
            const tx = {}, data = stores[n];
            tx.objectStore = () => ({
              get(k) { return { result: data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : undefined }; },
              put(v, k) { data.set(k, JSON.parse(JSON.stringify(v))); return {}; },
              delete(k) { data.delete(k); return {}; }
            });
            setTimeout(function () { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
          },
          close() {}
        };
        req.result = db;
        if (!stores.kv && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    }
  };
}

/* Firebase Realtime Database وهمي: شجرة + REST (shallow/orderBy/equalTo) + update متعدد المسارات + ServerValue */
/*RTDB-BEGIN*/function makeRtdb(initial) {
  const db = { tree: initial || {}, clock: 1700000000000, updates: [], sets: [], requests: [], bytes: 0, failIndexQuery: false };
  const getPath = (p) => { let cur = db.tree; for (const k of String(p).split("/").filter(Boolean)) { if (cur == null || typeof cur !== "object") return null; cur = cur[k]; } return cur === undefined ? null : cur; };
  function setPath(p, val) {
    const ks = String(p).split("/").filter(Boolean); let cur = db.tree;
    for (let i = 0; i < ks.length - 1; i++) {
      let nx = cur[ks[i]];
      if (nx == null || typeof nx !== "object") { nx = {}; cur[ks[i]] = nx; }
      else if (Array.isArray(nx)) { nx = Object.assign({}, nx); cur[ks[i]] = nx; }
      cur = nx;
    }
    const last = ks[ks.length - 1];
    if (val === null) delete cur[last]; else cur[last] = val;
  }
  function resolveSv(v, existing) {
    if (v && typeof v === "object") {
      if (v[".sv"] === "timestamp") return ++db.clock;
      if (v[".sv"] && v[".sv"].increment !== undefined) return (Number(existing) || 0) + v[".sv"].increment;
      if (Array.isArray(v)) return v.map(x => resolveSv(x, undefined));
      const out = {}; Object.keys(v).forEach(k => { out[k] = resolveSv(v[k], undefined); }); return out;
    }
    return v;
  }
  const toRest = (v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const ks = Object.keys(v); if (ks.length && ks.every((k, i) => String(i) === k)) return ks.map(k => v[k]);
    }
    return v;
  };
  db.sdk = {
    ref(p) {
      const base = p ? String(p).replace(/\/$/, "") + "/" : "";
      return {
        update(upd) { db.updates.push(JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(upd).map(k => [base + k, upd[k]]))))); Object.keys(upd).forEach(k => setPath(base + k, resolveSv(upd[k], getPath(base + k)))); return Promise.resolve(); },
        set(val) { db.sets.push({ path: p, value: JSON.parse(JSON.stringify(val)) }); setPath(p, resolveSv(val, getPath(p))); return Promise.resolve(); },
        remove() { setPath(p, null); return Promise.resolve(); },
        once() { return Promise.resolve({ val: () => getPath(p) }); }
      };
    }
  };
  db.fetch = function (url) {
    db.requests.push(String(url));
    const rest = String(url).replace(DBURL + "/", "");
    const q = rest.indexOf("?");
    const pathPart = decodeURIComponent((q < 0 ? rest : rest.slice(0, q)).replace(/\.json$/, ""));
    const params = new URLSearchParams(q < 0 ? "" : rest.slice(q + 1));
    let node = getPath(pathPart), status = 200;
    if (params.get("shallow") === "true") node = node && typeof node === "object" ? Object.fromEntries(Object.keys(node).map(k => [k, true])) : node;
    else if (params.get("orderBy")) {
      const field = JSON.parse(params.get("orderBy"));
      if (db.failIndexQuery && field !== "$key") { status = 400; node = { error: "Index not defined" }; }
      else if (node && typeof node === "object") {
        const entries = Object.entries(node);
        if (field === "$key") entries.sort(([a], [b]) => { const na = /^\d+$/.test(a), nb = /^\d+$/.test(b); return na && nb ? a - b : na ? -1 : nb ? 1 : (a < b ? -1 : a > b ? 1 : 0); });
        let sel = entries;
        if (params.get("equalTo") !== null) { const eq = JSON.parse(params.get("equalTo")); sel = entries.filter(([, v]) => v && v[field] === eq); }
        else if (params.get("startAt") !== null && field !== "$key") { const st = Number(params.get("startAt")); sel = entries.filter(([, v]) => v && Number(v[field]) >= st); }
        const lim = Number(params.get("limitToFirst") || 0); if (lim) sel = sel.slice(0, lim);
        node = Object.fromEntries(sel);
      }
    } else node = toRest(node);
    const text = JSON.stringify(node === undefined ? null : node);
    db.bytes += text.length;
    return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(JSON.parse(text)) });
  };
  return db;
}/*RTDB-END*/

function loadEnv(config, extraFiles, extra) {
  const listeners = {};
  const ctx = Object.assign({
    console, setTimeout, clearTimeout, setInterval: function () { return 0; }, Promise, JSON, Math, Date, Object, Array, Map, Set, Number, String, RegExp, Error,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    location: { search: "", href: "http://localhost/", pathname: "/" }, navigator: { userAgent: "node" },
    fetch: () => Promise.reject(new Error("offline")), AbortController, URLSearchParams, encodeURIComponent, decodeURIComponent,
    CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
    STORE_CONFIG: config || {}
  }, extra || {});
  ctx.document = {
    readyState: "complete", head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } },
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    dispatchEvent: e => { (listeners[e.type] || []).forEach(f => f(e)); return true; },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {} })
  };
  ctx.window = ctx; ctx.addEventListener = ctx.document.addEventListener; ctx.dispatchEvent = ctx.document.dispatchEvent;
  vm.createContext(ctx);
  ["store.js"].concat(extraFiles || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f }));
  return ctx;
}
function firebaseStub(rtdb) {
  const f = { initializeApp() {}, database: Object.assign(() => rtdb.sdk, { ServerValue: { TIMESTAMP: { ".sv": "timestamp" }, increment: n => ({ ".sv": { increment: n } }) } }), auth: () => ({}) };
  return f;
}
function adminEnv(rtdb, extra, files) {
  const e = loadEnv(FB_CFG, files, Object.assign({ firebase: firebaseStub(rtdb), fetch: rtdb.fetch }, extra || {}));
  e.sessionStorage.setItem("ws_admin_session", "1");
  return e;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = (ms) => new Promise(r => setTimeout(r, ms || 20));

let passed = 0, failed = 0;
async function atest(name, fn) { try { await fn(); passed++; console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n      " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n      ") : e)); } }

function sample(i, extra) {
  return Object.assign({ id: "prd_" + String(i).padStart(5, "0"), objectID: "prd_" + String(i).padStart(5, "0"), name: "منتج " + i + (i % 7 === 0 ? " أحمر" : ""), price: ((i * 7919) % 100000) + 500,
    categoryId: "cat_" + (i % 5), stock: i % 9 === 0 ? 0 : 5, available: true, barcode: "B" + (100000 + i), description: "وصف طويل ".repeat(30),
    image: "https://ik.imagekit.io/store/img_" + i + ".webp", images: ["https://i.ibb.co/a/" + i + "-1.jpg", "https://i.ibb.co/a/" + i + "-2.jpg"],
    colors: [], sizes: [], inventory: {}, featured: i % 50 === 0, isNew: i % 40 === 0, isOffer: false }, extra || {});
}

(async function main() {
  console.log("١) السجل المصغّر: مفاتيح بحرف واحد وحذف القيم الافتراضية");
  const base = loadEnv({});
  const build = vm.runInContext("buildIndexRecord", base), hyd = vm.runInContext("hydrateIndexRecord", base);
  await atest("المفاتيح المصغّرة + حذف الافتراضي/الفارغ", async () => {
    const r = build({ id: "a", name: "عطر", price: 5000, categoryId: "c1", stock: 3, image: "u.webp", barcode: "123", available: true, featured: false, isOffer: false, isNew: false, description: "x".repeat(500), images: ["1", "2"], colors: [], sizes: [] });
    assert.deepStrictEqual(plain(r), { i: "a", n: "عطر", p: 5000, c: "c1", s: 3, m: "u.webp", b: "123" });
    const z = build({ id: "z", name: "z", price: 0, stock: 0, available: false });
    assert.deepStrictEqual(plain(z), { i: "z", n: "z", a: 0 }, "price/stock الصفر وغير المتاح فقط a:0");
    const o = build({ id: "o", name: "o", price: 100, stock: 1, isOffer: true, oldPrice: 150, featured: true, isNew: true, colors: [{ name: "أحمر", hex: "#f00", image: "big.jpg" }], sizes: ["S"], createdAt: 5 });
    assert.deepStrictEqual(plain(o), { i: "o", n: "o", p: 100, s: 1, f: 1, o: 1, d: 150, w: 1, cl: [["أحمر", "#f00"]], z: ["S"], t: 5 });
    assert.strictEqual(build({ name: "no id" }), null);
  });
  await atest("التهيئة تعيد الحقول الكاملة و _k/_n والقيم الافتراضية، وتقبل الشكل القديم", async () => {
    const h = hyd({ i: "a", n: "أحمر", p: 5000, c: "c1", s: 3, m: "u.webp", b: "123" });
    assert.strictEqual(h.id, "a"); assert.strictEqual(h.price, 5000); assert.strictEqual(h.stock, 3); assert.strictEqual(h.available, true);
    assert.strictEqual(h.featured, false); assert.strictEqual(h.colors.length, 0); assert.strictEqual(h.image, "u.webp");
    assert.ok(h._k.indexOf("احمر") > -1 && h._n === "احمر" && h._k.indexOf("123") > -1, "_k/_n للبحث العربي");
    assert.strictEqual(hyd({ i: "z", n: "z", a: 0 }).available, false);
    const legacy = hyd({ id: "old", name: "قديم", price: 7, categoryId: "c", stock: 0, available: true, featured: true, vc: 2 });
    assert.strictEqual(legacy.id, "old"); assert.strictEqual(legacy.featured, true); assert.strictEqual(legacy.variants.length, 2);
    const x = hyd({ i: "o", n: "o", p: 100, d: 150, o: 1, cl: [["أحمر", "#f00"]] });
    assert.strictEqual(x.oldPrice, 150); assert.strictEqual(x.colors[0].name, "أحمر"); assert.strictEqual(x.colors[0].hex, "#f00");
  });
  const prods = Array.from({ length: 3000 }, (_, i) => sample(i));
  const recs = prods.map(build);
  const bytes = JSON.stringify(recs).length;
  console.log("      حجم السجل المصغّر الفعلي لمنتج بصورة ImageKit: " + Math.round(bytes / recs.length) + " بايت/منتج (≈ " + (bytes / 1048576 * 10000 / 3000).toFixed(2) + " MB لكل 10,000)");
  await atest("حجم السجل أقل من 200 بايت/منتج (يعتمد أساساً على طول رابط الصورة)", async () => { assert.ok(bytes / recs.length < 200); });

  console.log("\n٢) التخزين المحلي: IndexedDB + احتياطي localStorage/الذاكرة");
  await atest("مع IndexedDB: الفهرس يُحفظ هناك (لا JSON ضخم في localStorage) ويُقرأ بعد إعادة التحميل", async () => {
    const idb = makeFakeIDB(), ls = makeStorage();
    const rt = makeRtdb({ ws_index: { v: 10, e: 1, items: Object.fromEntries(recs.map(r => [r.i, Object.assign({ u: 100 }, r)])) } });
    const e1 = loadEnv(FB_CFG, [], { indexedDB: idb, localStorage: ls, fetch: rt.fetch }), S1 = vm.runInContext("Store", e1);
    await S1.ensureIndexFresh(); await tick(60);
    assert.strictEqual(S1.getIndexItems().length, 3000);
    assert.strictEqual(ls.getItem("ws_index_items"), null, "لا نسخة JSON كبيرة في localStorage");
    assert.ok(idb._stores.kv && idb._stores.kv.get("items").length === 3000, "العناصر في IndexedDB");
    assert.strictEqual(ls.getItem("ws_index_v"), "10"); assert.ok(Number(ls.getItem("ws_index_checked")) > 0);
    // إعادة تحميل الصفحة: نفس التخزين، بلا شبكة
    const e2 = loadEnv(FB_CFG, [], { indexedDB: idb, localStorage: ls, fetch: () => Promise.reject(new Error("offline")) }), S2 = vm.runInContext("Store", e2);
    await S2.indexReady();
    assert.strictEqual(S2.getIndexItems().length, 3000);
    assert.strictEqual(S2.hasIndexLocal(), true);
  });
  await atest("بلا IndexedDB (تصفح خاص/قديم): احتياطي localStorage تلقائياً ويعمل كاملاً", async () => {
    const ls = makeStorage();
    const rt = makeRtdb({ ws_index: { v: 10, items: recs.slice(0, 200).map(r => Object.assign({ u: 1 }, r)) } });
    const e1 = loadEnv(FB_CFG, [], { localStorage: ls, fetch: rt.fetch }), S1 = vm.runInContext("Store", e1);
    await S1.ensureIndexFresh(); await tick(30);
    assert.strictEqual(S1.getIndexItems().length, 200);
    assert.ok(ls.getItem("ws_index_items") && JSON.parse(ls.getItem("ws_index_items")).length === 200, "نسخة احتياطية في localStorage");
    const e2 = loadEnv(FB_CFG, [], { localStorage: ls, fetch: () => Promise.reject(new Error("offline")) }), S2 = vm.runInContext("Store", e2);
    assert.strictEqual(S2.getIndexItems().length, 200, "قراءة متزامنة فورية من الاحتياطي");
  });
  await atest("IndexedDB يرفض الفتح (خطأ): نعود للاحتياطي دون كسر المتجر", async () => {
    const bad = { open() { const req = {}; setTimeout(() => req.onerror && req.onerror(), 0); return req; } };
    const rt = makeRtdb({ ws_index: { v: 3, items: recs.slice(0, 20).map(r => Object.assign({ u: 1 }, r)) } });
    const ls = makeStorage();
    const e = loadEnv(FB_CFG, [], { indexedDB: bad, localStorage: ls, fetch: rt.fetch }), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh(); await tick(30);
    assert.strictEqual(S.getIndexItems().length, 20);
    assert.ok(ls.getItem("ws_index_items"));
  });
  await atest("ترحيل نسخة localStorage القديمة (مفاتيح كاملة) إلى IndexedDB وتفريغ المساحة", async () => {
    const idb = makeFakeIDB(), ls = makeStorage();
    loadEnv(FB_CFG, [], { indexedDB: idb, localStorage: ls });   // يهيّئ إصدار البيانات كي لا يمسح seedIfNeeded ما نكتبه بعده
    ls.setItem("ws_index_items", JSON.stringify(prods.slice(0, 50).map(p => ({ id: p.id, name: p.name, price: p.price, categoryId: p.categoryId, available: true, stock: p.stock }))));
    ls.setItem("ws_index_v", "7");
    const e = loadEnv(FB_CFG, [], { indexedDB: idb, localStorage: ls }), S = vm.runInContext("Store", e);
    await S.indexReady(); await tick(60);
    assert.strictEqual(S.getIndexItems().length, 50);
    assert.strictEqual(ls.getItem("ws_index_items"), null, "أُفرغ localStorage");
    assert.strictEqual(idb._stores.kv.get("items").length, 50);
    assert.ok(idb._stores.kv.get("items")[0].i, "خُزّن بالشكل المصغّر");
  });

  console.log("\n٣) المزامنة التفاضلية للزوار");
  function indexTree(list, v, e) { return { ws_index: { v: v, e: e, items: Object.fromEntries(list.map((p, i) => { const r = build(p); r.u = 1000 + i; return [r.i, r]; })) } }; }
  const small = prods.slice(0, 500);
  await atest("بعد التنزيل الأول: تعديل + حذف + إضافة ⇒ يُنزَّل التغيير فقط (لا الفهرس كله)", async () => {
    const rt = makeRtdb(indexTree(small, 5, 100)), idb = makeFakeIDB();
    const e = loadEnv(FB_CFG, [], { indexedDB: idb, fetch: rt.fetch }), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh(); await tick(40);
    const firstBytes = rt.bytes; assert.strictEqual(S.getIndexItems().length, 500);
    // الأدمن: يعدّل منتجاً ويحذف آخر ويضيف ثالثاً (بوقت خادم أحدث)
    rt.tree.ws_index.items[small[3].id] = Object.assign(build(Object.assign({}, small[3], { price: 123456 })), { u: 5000 });
    rt.tree.ws_index.items[small[4].id] = { x: 1, u: 5001 };
    const added = sample(9999, { createdAt: Date.now() }); rt.tree.ws_index.items[added.id] = Object.assign(build(added), { u: 5002 });
    rt.tree.ws_index.v = 8;
    e.localStorage.setItem("ws_index_checked", String(Date.now() - 6 * 60 * 1000));
    rt.requests.length = 0; rt.bytes = 0;
    await S.ensureIndexFresh(); await tick(40);
    const items = S.getIndexItems(), byId = Object.fromEntries(items.map(i => [i.id, i]));
    assert.strictEqual(items.length, 500, "500 - 1 حذف + 1 إضافة");
    assert.strictEqual(byId[small[3].id].price, 123456, "التعديل وصل");
    assert.ok(!byId[small[4].id], "المحذوف اختفى");
    assert.ok(byId[added.id], "الإضافة وصلت");
    assert.strictEqual(items[0].id, added.id, "الأحدث (createdAt) أولاً");
    assert.ok(rt.requests.some(u => /orderBy/.test(u) && /startAt=1499|startAt=1\d{3}/.test(u)), "استعلام تفاضلي: " + rt.requests.join(" | "));
    assert.ok(rt.bytes < firstBytes / 20, "حجم التحديث (" + rt.bytes + "B) ≪ التنزيل الأول (" + firstBytes + "B)");
    console.log("      تنزيل أول: " + firstBytes + "B — تحديث بعد 3 تغييرات: " + rt.bytes + "B (" + rt.requests.length + " طلبات)");
  });
  await atest("تغيّر «الحقبة» e (إعادة بناء كاملة) ⇒ تنزيل كامل ليُسقط المحذوفات القديمة", async () => {
    const rt = makeRtdb(indexTree(small, 5, 100)), idb = makeFakeIDB();
    const e = loadEnv(FB_CFG, [], { indexedDB: idb, fetch: rt.fetch }), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh(); await tick(40);
    delete rt.tree.ws_index.items[small[0].id];            // حُذف ولا قبر (إعادة بناء)
    rt.tree.ws_index.v = 6; rt.tree.ws_index.e = 200;
    e.localStorage.setItem("ws_index_checked", "0"); rt.requests.length = 0;
    await S.ensureIndexFresh(); await tick(40);
    assert.strictEqual(S.getIndexItems().length, 499);
    assert.ok(rt.requests.some(u => /ws_index\/items\.json$/.test(u)), "تنزيل كامل");
  });
  await atest("بلا .indexOn على u (HTTP 400): يعود تلقائياً للتنزيل الكامل", async () => {
    const rt = makeRtdb(indexTree(small, 5, 100)), idb = makeFakeIDB();
    const e = loadEnv(FB_CFG, [], { indexedDB: idb, fetch: rt.fetch }), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh(); await tick(40);
    rt.failIndexQuery = true; rt.tree.ws_index.v = 6;
    delete rt.tree.ws_index.items[small[1].id];
    e.localStorage.setItem("ws_index_checked", "0");
    await S.ensureIndexFresh(); await tick(40);
    assert.strictEqual(S.getIndexItems().length, 499);
  });
  await atest("فهرس قديم على الخادم (مصفوفة بمفاتيح كاملة وبلا u): يعمل كما كان", async () => {
    const legacy = small.slice(0, 40).map(p => ({ id: p.id, name: p.name, price: p.price, categoryId: p.categoryId, available: true, stock: 5 }));
    const rt = makeRtdb({ ws_index: { v: 1699999999999, items: legacy } });
    const e = loadEnv(FB_CFG, [], { indexedDB: makeFakeIDB(), fetch: rt.fetch }), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh(); await tick(30);
    assert.strictEqual(S.getIndexItems().length, 40);
    assert.strictEqual(S.getIndexItems()[0].id, small[0].id, "ترتيب المصفوفة محفوظ");
  });
  await atest("الفحص كل 5 دقائق: خلالها صفر طلبات؛ بعدها رقم النسخة فقط (بايتات قليلة)", async () => {
    const rt = makeRtdb(indexTree(small, 5, 100));
    const e = loadEnv(FB_CFG, [], { indexedDB: makeFakeIDB(), fetch: rt.fetch }), S = vm.runInContext("Store", e);
    await S.ensureIndexFresh(); await tick(30);
    rt.requests.length = 0; rt.bytes = 0;
    await S.ensureIndexFresh(); assert.strictEqual(rt.requests.length, 0, "خلال 5 دقائق لا طلبات");
    e.localStorage.setItem("ws_index_checked", String(Date.now() - 4 * 60 * 1000)); await S.ensureIndexFresh();
    assert.strictEqual(rt.requests.length, 0, "بعد 4 دقائق ما زلنا ضمن التهدئة");
    e.localStorage.setItem("ws_index_checked", String(Date.now() - 5.1 * 60 * 1000)); await S.ensureIndexFresh();
    assert.strictEqual(rt.requests.length, 1); assert.ok(rt.bytes < 20, "رقم النسخة فقط: " + rt.bytes + "B");
    assert.ok(vm.runInContext("INDEX_CHECK_MS === 300000 && META_PULL_MS === 300000", e));
  });

  console.log("\n٤) الأدمن: كتابة جزئية ws_products/{id} (بنية مفتاحية)");
  const keyedTree = () => ({ ws_products: Object.fromEntries(small.slice(0, 5).map((p, i) => [p.id, Object.assign({}, p, { createdAt: 2000 - i })])) });
  async function loadedAdmin(tree) {
    const rt = makeRtdb(tree), e = adminEnv(rt, { indexedDB: makeFakeIDB() }), S = vm.runInContext("Store", e);
    await S.loadAllProductsFromFirebase(true);
    return { rt, e, S };
  }
  await atest("تعديل منتج: update واحد يمسّ ws_products/{id} و ws_index/items/{id} و ws_index/v فقط", async () => {
    const { rt, S } = await loadedAdmin(keyedTree());
    assert.strictEqual(S.canWriteProducts(), true); assert.strictEqual(S.needsKeyedMigration(), false);
    const id = small[2].id;
    const ok = await S.updateProduct(id, { price: 777 });
    assert.strictEqual(ok, true);
    assert.strictEqual(rt.updates.length, 1); assert.strictEqual(rt.sets.length, 0, "لا set لكامل المصفوفة");
    assert.deepStrictEqual(plain(Object.keys(rt.updates[0]).sort()), ["ws_index/items/" + id, "ws_index/v", "ws_products/" + id].sort());
    assert.strictEqual(rt.updates[0]["ws_products/" + id].price, 777);
    assert.deepStrictEqual(rt.updates[0]["ws_index/v"], { ".sv": { increment: 1 } }, "رفع v ذرّياً");
    const rec = rt.updates[0]["ws_index/items/" + id];
    assert.strictEqual(rec.p, 777); assert.deepStrictEqual(rec.u, { ".sv": "timestamp" }); assert.strictEqual(rec.t, 2000 - 2, "createdAt محفوظ في t");
    assert.strictEqual(rt.tree.ws_products[small[3].id].price, small[3].price, "بقية المنتجات لم تُمسّ");
    assert.strictEqual(S.getProduct(id).price, 777);
  });
  await atest("إضافة منتج: عقدة جديدة بـ createdAt الحالي، وفي الفهرس المحلي أولاً", async () => {
    const { rt, S } = await loadedAdmin(keyedTree());
    const item = S.addProduct({ name: "جديد كلياً", price: 10, stock: 2 });
    assert.strictEqual(await S.whenProductsSaved(), true);
    assert.strictEqual(rt.updates.length, 1);
    assert.ok(rt.updates[0]["ws_products/" + item.id] && rt.updates[0]["ws_products/" + item.id].createdAt >= 1700000000000);
    assert.ok(rt.tree.ws_index.items[item.id].t > 0);
    assert.strictEqual(S.getIndexItems()[0].id, item.id, "الأحدث أولاً محلياً");
  });
  await atest("حذف منتج: null على العقدة + قبر x في الفهرس + رفع v", async () => {
    const { rt, S } = await loadedAdmin(keyedTree());
    const id = small[1].id;
    assert.strictEqual(await S.deleteProduct(id), true);
    assert.strictEqual(rt.updates[0]["ws_products/" + id], null);
    assert.strictEqual(rt.updates[0]["ws_index/items/" + id].x, 1);
    assert.ok(!rt.tree.ws_products[id]); assert.ok(rt.tree.ws_index.items[id].x === 1);
    assert.ok(!S.getProducts().some(p => p.id === id));
  });
  await atest("تعديل كائنات في مكانها ثم saveProducts(list) (استيراد/خصم مخزون): يُكتب المتغيّر + الجديد فقط", async () => {
    const { rt, S } = await loadedAdmin(keyedTree());
    const list = S.getProducts();
    list[0].stock = 1;                         // تعديل في المكان كما يفعل admin.js
    list[3].price = 4242;
    list.push({ id: "prd_new1", name: "مضاف", price: 5, stock: 1, available: true });
    assert.strictEqual(await S.saveProducts(list), true);
    const written = rt.updates.flatMap(u => Object.keys(u).filter(k => k.indexOf("ws_products/") === 0));
    assert.deepStrictEqual(written.sort(), ["ws_products/" + list[0].id, "ws_products/" + list[3].id, "ws_products/prd_new1"].sort());
    assert.ok(rt.tree.ws_products.prd_new1.createdAt > 0);
    // مرة ثانية بلا تغيير: لا كتابة
    rt.updates.length = 0; assert.strictEqual(await S.saveProducts(S.getProducts()), true); assert.strictEqual(rt.updates.length, 0);
    // حذف عبر القائمة
    const l2 = S.getProducts().filter(p => p.id !== "prd_new1"); await S.saveProducts(l2);
    assert.strictEqual(rt.updates[0]["ws_products/prd_new1"], null);
  });
  await atest("دفعات كتابة: 400 منتج ⇒ عدة update (≤150 منتج لكل طلب) و v يرتفع لكل دفعة", async () => {
    const { rt, S } = await loadedAdmin(keyedTree());
    const list = S.getProducts(); for (let i = 0; i < 400; i++) list.push(sample(20000 + i));
    await S.saveProducts(list);
    assert.strictEqual(rt.updates.length, 3);
    rt.updates.forEach(u => assert.ok(Object.keys(u).filter(k => /^ws_products\//.test(k)).length <= 150));
    assert.strictEqual(rt.tree.ws_index.v, 3);
  });
  await atest("ترتيب الأدمن: الأحدث أولاً حتى لو رجعت المفاتيح مرتّبة بالمعرّف", async () => {
    const { S } = await loadedAdmin(keyedTree());
    assert.deepStrictEqual(plain(S.getProducts().map(p => p.id)), small.slice(0, 5).map(p => p.id));
  });
  await atest("قراءة منتج بالمعرّف: عقدة مباشرة (بلا استعلام ولا .indexOn)", async () => {
    const rt = makeRtdb(keyedTree()), e = loadEnv(FB_CFG, [], { fetch: rt.fetch }), S = vm.runInContext("Store", e);
    const p = await S.loadProductById(small[2].id);
    assert.strictEqual(p && p.id, small[2].id);
    assert.ok(rt.requests.every(u => !/orderBy/.test(u)), rt.requests.join(" | "));
    assert.strictEqual(await S.loadProductById("nope"), null);
  });

  console.log("\n٥) الترحيل غير المدمِّر من المصفوفة إلى ws_products/{id}");
  const legacyProducts = small.slice(0, 7).map(p => Object.assign({}, p));         // [0] الأحدث
  const legacyTree = () => ({ ws_products: legacyProducts.map(p => Object.assign({}, p)), ws_index: { v: 1699999999999, items: legacyProducts.map(p => ({ id: p.id, name: p.name, price: p.price, categoryId: p.categoryId, available: true, stock: 5 })) } });
  await atest("اكتشاف البنية القديمة ثم الترحيل عند أول حفظ: لا فقد منتجات ولا تغيّر في الترتيب", async () => {
    const { rt, S, e } = await loadedAdmin(legacyTree());
    assert.strictEqual(S.needsKeyedMigration(), true);
    const events = []; e.document.addEventListener("store:migration-start", () => events.push("start")); e.document.addEventListener("store:migration-done", () => events.push("done"));
    const id = legacyProducts[2].id;
    assert.strictEqual(await S.updateProduct(id, { price: 31337 }), true);
    assert.strictEqual(S.needsKeyedMigration(), false);
    const tree = rt.tree.ws_products;
    assert.ok(!Array.isArray(tree));
    assert.deepStrictEqual(Object.keys(tree).sort(), legacyProducts.map(p => p.id).sort(), "كل المنتجات مفتاحها معرّفها ولا بقايا أرقام");
    legacyProducts.forEach(p => { const t = tree[p.id]; assert.ok(t, "منتج مفقود " + p.id); assert.strictEqual(t.name, p.name); assert.strictEqual(t.id, p.id); });
    assert.strictEqual(tree[id].price, 31337, "التعديل المعلّق كُتب بعد الترحيل");
    const order = Object.values(tree).sort((a, b) => b.createdAt - a.createdAt).map(p => p.id);
    assert.deepStrictEqual(order, legacyProducts.map(p => p.id), "ترتيب (الأحدث أولاً) كما كان في المصفوفة");
    const items = rt.tree.ws_index.items;
    assert.ok(!Array.isArray(items) && Object.keys(items).length === 7 && items[id].p === 31337 && items[id].u > 0, "الفهرس أُعيد بالبنية الجديدة");
    assert.ok(rt.tree.ws_index.e > 0, "الحقبة رُفعت");
    assert.deepStrictEqual(events, ["start", "done"]);
    assert.ok(rt.updates.every(u => Object.keys(u).every(k => /^ws_(products|index)\//.test(k))), "كل الكتابات ضمن المسارات المتوقعة");
  });
  await atest("الترحيل دفعات ذرّية (حذف القديم + كتابة الجديد معاً) لعدد كبير", async () => {
    const many = Array.from({ length: 460 }, (_, i) => sample(i));
    const { rt, S } = await loadedAdmin({ ws_products: many.map(p => Object.assign({}, p)) });
    await S.updateProduct(many[10].id, { stock: 9 });
    const migrationUpdates = rt.updates.filter(u => Object.keys(u).some(k => u[k] === null && /^ws_products\/\d+$/.test(k)));
    assert.strictEqual(migrationUpdates.length, 4, "460/150 ⇒ 4 دفعات");
    migrationUpdates.forEach(u => { const nulls = Object.keys(u).filter(k => u[k] === null).length, sets = Object.keys(u).filter(k => u[k] !== null).length; assert.strictEqual(nulls, sets, "كل دفعة متوازنة"); });
    assert.strictEqual(Object.keys(rt.tree.ws_products).length, 460);
  });
  await atest("معرّفات مكررة أو غير صالحة تُحفظ بلا ضياع (اسم فريد جديد)", async () => {
    const dup = [sample(1), Object.assign(sample(2), { id: "dup", objectID: "dup" }), Object.assign(sample(3), { id: "dup", objectID: "dup" }), Object.assign(sample(4), { id: "a.b#c", objectID: "a.b#c" })];
    const { rt, S } = await loadedAdmin({ ws_products: dup });
    const old = console.warn; console.warn = () => {};
    try { await S.updateProduct(dup[0].id, { price: 1 }); } finally { console.warn = old; }
    const keys = Object.keys(rt.tree.ws_products);
    assert.strictEqual(keys.length, 4, "لا فقد: " + keys.join(","));
    assert.ok(keys.includes("dup") && keys.includes("dup-2") && keys.includes("a_b_c"));
  });
  await atest("تغيّر الخادم منذ التحميل (عقدة غريبة): يتوقف الترحيل ولا يُكتب شيء", async () => {
    const { rt, S, e } = await loadedAdmin(legacyTree());
    rt.tree.ws_products = Object.assign({}, rt.tree.ws_products, { stranger: { id: "stranger", name: "مدير آخر" } });
    const old = console.error; console.error = () => {};
    let failed = 0; e.document.addEventListener("store:migration-failed", () => failed++);
    let ok; try { ok = await S.updateProduct(legacyProducts[0].id, { price: 5 }); } finally { console.error = old; }
    assert.strictEqual(ok, false); assert.strictEqual(rt.updates.length, 0, "لا كتابة"); assert.strictEqual(failed, 1);
    assert.strictEqual(rt.tree.ws_products["0"].id, legacyProducts[0].id, "البيانات القديمة كما هي");
  });
  await atest("انقطاع في منتصف الترحيل ثم إعادة المحاولة: يُستأنف دون تكرار ولا فقد", async () => {
    const many = Array.from({ length: 320 }, (_, i) => sample(i));
    const { rt, S } = await loadedAdmin({ ws_products: many.map(p => Object.assign({}, p)) });
    const realUpdate = rt.sdk.ref; let n = 0;
    rt.sdk.ref = function (p) { const r = realUpdate.call(rt.sdk, p); const u = r.update; r.update = (x) => (++n === 2 ? Promise.reject(new Error("network")) : u(x)); return r; };
    const old = console.error; console.error = () => {};
    let r1; try { r1 = await S.updateProduct(many[0].id, { stock: 8 }); } finally { console.error = old; }
    assert.strictEqual(r1, false);
    assert.ok(Object.keys(rt.tree.ws_products).length === 320, "حتى منتصف الترحيل لا منتج مفقود");
    // الجلسة التالية: تحميل جديد ثم حفظ ⇒ يكمل ما تبقّى
    rt.sdk.ref = realUpdate;
    const e2 = adminEnv(rt, { indexedDB: makeFakeIDB() }), S2 = vm.runInContext("Store", e2);
    await S2.loadAllProductsFromFirebase(true);
    assert.strictEqual(S2.needsKeyedMigration(), true, "ما زالت بقايا قديمة");
    assert.strictEqual(await S2.updateProduct(many[1].id, { stock: 4 }), true);
    assert.deepStrictEqual(Object.keys(rt.tree.ws_products).sort(), many.map(p => p.id).sort());
    assert.strictEqual(S2.needsKeyedMigration(), false);
  });

  console.log("\n٦-أ) وضع الأدمن الخفيف: الفهرس بدل كل المنتجات");
  const lightTree = (n, keyed) => {
    const list = Array.from({ length: n }, (_, i) => Object.assign(sample(i), { createdAt: 5000 - i }));
    return { ws_products: keyed === false ? list.map(p => Object.assign({}, p)) : Object.fromEntries(list.map(p => [p.id, p])),
      ws_index: { v: 4, e: 9, items: Object.fromEntries(list.map((p, i) => { const r = build(p); delete r.i; r.u = 100 + i; return [p.id, r]; })) } };
  };
  async function lightAdmin(tree) {
    const rt = makeRtdb(tree), e = adminEnv(rt, { indexedDB: makeFakeIDB() }), S = vm.runInContext("Store", e);
    await S.loadAdminCatalog();
    return { rt, e, S };
  }
  await atest("فتح الأدمن: لا تحميل لـ ws_products كلها، والقائمة من الفهرس", async () => {
    const { rt, S } = await lightAdmin(lightTree(400));
    assert.ok(!rt.requests.some(u => /ws_products\.json$/.test(u)), "لا GET كامل: " + rt.requests.join(" | "));
    assert.strictEqual(S.canWriteNode(), true); assert.strictEqual(S.canWriteProducts(), false);
    const list = S.getAdminProducts();
    assert.strictEqual(list.length, 400); assert.strictEqual(list[0].id, "prd_00000", "الأحدث أولاً");
    assert.ok(list[1].name && list[1].barcode && list[1].price >= 0 && typeof list[1].stock === "number", "حقول الجدول موجودة");
    assert.strictEqual(S.needsKeyedMigration(), false);
    const full = makeRtdb(lightTree(400)); await vm.runInContext("Store", adminEnv(full, { indexedDB: makeFakeIDB() })).loadAllProductsFromFirebase(true);
    console.log("      فتح الأدمن (400 منتج): خفيف " + rt.bytes + "B مقابل تحميل كامل " + full.bytes + "B");
    assert.ok(rt.bytes < full.bytes / 3, "الخفيف أصغر بكثير (" + (full.bytes / rt.bytes).toFixed(1) + "×)");
  });
  await atest("تعديل منتج غير محمّل: يجلب عقدته الكاملة ثم يكتب عقدة واحدة ولا يفقد الحقول غير الموجودة في الفهرس", async () => {
    const { rt, S } = await lightAdmin(lightTree(50));
    const id = "prd_00007";
    assert.strictEqual(S.getProduct(id), null, "ليس في الكاش");
    const ok = await S.updateProduct(id, { price: 4242 });
    assert.strictEqual(ok, true);
    assert.ok(rt.requests.some(u => /ws_products\/prd_00007\.json$/.test(u)), "جلب العقدة الواحدة");
    assert.strictEqual(rt.updates.length, 1);
    assert.deepStrictEqual(plain(Object.keys(rt.updates[0]).sort()), ["ws_index/items/" + id, "ws_index/v", "ws_products/" + id].sort());
    const doc = rt.tree.ws_products[id];
    assert.strictEqual(doc.price, 4242);
    assert.ok(doc.description && doc.description.length > 100, "الوصف الكامل محفوظ"); assert.strictEqual(doc.images.length, 2, "الصور محفوظة");
    assert.strictEqual(S.getAdminProducts().find(p => p.id === id).price, 4242, "الجدول تحدّث");
  });
  await atest("loadProductFresh يجلب النسخة الطازجة من الخادم (تعديل جهاز آخر)", async () => {
    const { rt, S } = await lightAdmin(lightTree(20));
    const id = "prd_00003";
    const a = await S.loadProductFresh(id); assert.strictEqual(a.price, sample(3).price);
    rt.tree.ws_products[id].price = 999;
    const b = await S.loadProductFresh(id); assert.strictEqual(b.price, 999);
  });
  await atest("حذف وإضافة في الوضع الخفيف: عقدة واحدة + قبر، والجدول يتحدث", async () => {
    const { rt, S } = await lightAdmin(lightTree(30));
    assert.strictEqual(await S.deleteProduct("prd_00002"), true);
    assert.strictEqual(rt.updates[0]["ws_products/prd_00002"], null); assert.strictEqual(rt.updates[0]["ws_index/items/prd_00002"].x, 1);
    assert.strictEqual(S.getAdminProducts().length, 29);
    const item = S.addProduct({ name: "جديد", price: 5, stock: 1 }); assert.strictEqual(await S.whenProductsSaved(), true);
    assert.strictEqual(S.getAdminProducts().length, 30); assert.strictEqual(S.getAdminProducts()[0].id, item.id);
    assert.strictEqual(Object.keys(rt.tree.ws_products).length, 30);
  });
  await atest("saveProducts الجماعية مرفوضة في الوضع الخفيف حتى تحميل الكتالوج كاملاً (حماية الحذف)", async () => {
    const { rt, S } = await lightAdmin(lightTree(30));
    const res = await S.saveProducts([sample(1)]);   // قائمة جزئية: كانت ستحذف الباقي لو سُمح بها
    assert.strictEqual(res, false); assert.strictEqual(rt.updates.length, 0);
    await S.ensureAllProductsFresh(); assert.strictEqual(S.canWriteProducts(), true);
    assert.strictEqual(S.getAdminProducts().length, 30);
  });
  await atest("بنية قديمة في الوضع الخفيف: تُكتشف بطلب خفيف ثم تُرحَّل عند أول حفظ (تحميل كامل مرة واحدة)", async () => {
    const { rt, S } = await lightAdmin(lightTree(25, false));
    assert.strictEqual(S.needsKeyedMigration(), true, "اكتُشفت البنية القديمة");
    assert.ok(!rt.requests.some(u => /ws_products\.json$/.test(u)), "الكشف لم يحمّل الكتالوج");
    assert.strictEqual(await S.updateProduct("prd_00004", { price: 77 }), true);
    assert.strictEqual(S.needsKeyedMigration(), false);
    assert.strictEqual(Object.keys(rt.tree.ws_products).length, 25); assert.ok(Object.keys(rt.tree.ws_products).every(k => /^prd_/.test(k)));
    assert.strictEqual(rt.tree.ws_products.prd_00004.price, 77);
  });

  console.log("\n٦) الخروج المبكر: بحث عام وقائمة المتجر");
  await atest("قائمة المتجر الافتراضية تتوقف عند الشريحة المطلوبة وتطابق المسح الكامل", async () => {
    const rt = makeRtdb(indexTree(prods, 9, 1)), e = loadEnv(FB_CFG, ["icons.js", "whatsapp.js", "app.js", "products.js"], { indexedDB: makeFakeIDB(), fetch: rt.fetch });
    const S = vm.runInContext("Store", e); await S.ensureIndexFresh(); await tick(40);
    const pool = S.getIndexItems(), buildShopList = vm.runInContext("buildShopList", e), SIZE = vm.runInContext("SHOP_PAGE_SIZE", e);
    const set = (o) => vm.runInContext("Object.assign(shopState, " + JSON.stringify(o) + ")", e);
    set({ sort: "default", search: "", categoryId: "all", filterMode: "" });
    vm.runInContext("_listMemo = null", e);
    const limited = buildShopList(pool, SIZE + 1);
    const limitedComplete = vm.runInContext("_listMemo.complete", e);
    vm.runInContext("_listMemo = null", e);
    const full = buildShopList(pool);
    assert.ok(limited.length <= SIZE + 1 + 5 && limited.length < full.length / 10, "توقف مبكراً: " + limited.length + " من " + full.length);
    assert.deepStrictEqual(plain(limited.slice(0, SIZE).map(p => p.id)), plain(full.slice(0, SIZE).map(p => p.id)));
    assert.strictEqual(limitedComplete, false);
    vm.runInContext("_listMemo = null", e);
    const q = vm.runInContext("queryFallbackStore", e);
    const p0 = await q(0); assert.strictEqual(p0.products.length, SIZE); assert.ok(p0.nbPages >= 2, "يوجد المزيد");
    // الصفحات المتتالية تطابق المسح الكامل
    const all = []; for (let pg = 0; pg < 400; pg++) { const r = await q(pg); all.push.apply(all, r.products); if (pg + 1 >= r.nbPages) break; }
    assert.deepStrictEqual(plain(all.map(p => p.id)), plain(full.map(p => p.id)), "نفس النتيجة والترتيب عبر كل الصفحات");
    // بحث: الترتيب (يبدأ بالكلمة أولاً) مطابق للمسح الكامل
    set({ search: "منتج 12" });
    vm.runInContext("_listMemo = null", e); const limS = buildShopList(pool, SIZE + 1);
    vm.runInContext("_listMemo = null", e); const fullS = buildShopList(pool);
    assert.deepStrictEqual(plain(limS.slice(0, SIZE).map(p => p.id)), plain(fullS.slice(0, SIZE).map(p => p.id)));
    // الفرز بالسعر يحتاج كل النتائج: قائمة كاملة
    set({ search: "", sort: "price-asc" }); const ps = buildShopList(pool, SIZE + 1);
    assert.strictEqual(vm.runInContext("_listMemo.complete", e), true); for (let i = 1; i < ps.length; i++) assert.ok(ps[i - 1].price <= ps[i].price);
  });
  await atest("المنتجات الأقل من شريحة: القائمة كاملة وعدد الصفحات صحيح", async () => {
    const rt = makeRtdb(indexTree(prods.slice(0, 30), 9, 1)), e = loadEnv(FB_CFG, ["icons.js", "whatsapp.js", "app.js", "products.js"], { indexedDB: makeFakeIDB(), fetch: rt.fetch });
    const S = vm.runInContext("Store", e); await S.ensureIndexFresh(); await tick(30);
    vm.runInContext("Object.assign(shopState,{sort:'default',search:'',categoryId:'all',filterMode:''})", e);
    const r = await vm.runInContext("queryFallbackStore", e)(0);
    const avail = prods.slice(0, 30).filter(p => S.isProductAvailable(p)).length;
    assert.strictEqual(r.products.length, Math.min(avail, vm.runInContext("SHOP_PAGE_SIZE", e)));
    assert.strictEqual(r.nbPages, Math.ceil(avail / vm.runInContext("SHOP_PAGE_SIZE", e)));
  });

  console.log("\nالنتيجة: " + passed + " نجح، " + failed + " فشل");
  process.exit(failed ? 1 : 0);
})();
