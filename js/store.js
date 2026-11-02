/* ==========================================================================
   store.js — طبقة البيانات المركزية للقالب (localStorage + Firebase Realtime DB)
   مع دعم الفهرس المصغر (Mini-Index) لمتاجر حتى 10,000 منتج + المزامنة السحابية:
   • الفهرس في IndexedDB (احتياطي localStorage/الذاكرة) بسجلات مصغّرة ومزامنة تفاضلية (تغييرات فقط).
   • ws_products/{id}: كل منتج عقدة مستقلة؛ الحفظ يكتب العقدة المتغيّرة فقط (انظر commitProductNodes).
   • فحص إصدار الفهرس والأقسام كل 5 دقائق (حماية حصة Firebase Spark).
   ========================================================================== */

const META_CACHE_MS = 60 * 1000;       // فحص خفيف دوري
const QUERY_CACHE_MS = 15 * 1000;
const REFRESH_MS = 60 * 1000;
const INDEX_CHECK_MS = 300 * 1000;     // فحص إصدار الفهرس كل 5 دقائق (يحمي حصة Firebase Spark)
const META_PULL_MS = 300 * 1000;       // فحص إصدار الأقسام والإعلانات كل 5 دقائق
const PRODUCT_CACHE_LIMIT = 400;       // الزائر: آخر 400 منتج فُتح فقط (الفهرس الخفيف يغطي الباقي)
const ADMIN_PRODUCT_CACHE_LIMIT = 50000; // جلسة الأدمن: كل الكتالوج في الذاكرة
const FETCH_TIMEOUT_MS = 15000;

const DB_KEYS = {
  categories: "ws_categories",
  products: "ws_products",
  miniIndex: "ws_mini_index",
  settings: "ws_settings",
  cart: "ws_cart",
  orders: "ws_orders",
  session: "ws_admin_session",
  seeded: "ws_seeded_v1",
  ads: "ws_ads",
  productsCount: "ws_products_count_meta",
  index: "ws_index"          // عقدة Firebase: { v: رقم النسخة, items: [سجلات خفيفة لكل المنتجات] }
};
const IDX_ITEMS = "ws_index_items";      // احتياطي localStorage فقط (النسخة الأساسية في IndexedDB)
const IDX_V = "ws_index_v";              // رقم نسخة الفهرس المحلي (يبقى في localStorage للفحص المتزامن السريع)
const IDX_CHECKED = "ws_index_checked";  // آخر وقت فُحص فيه رقم النسخة من الخادم (localStorage)
const IDX_U = "ws_index_u";              // أحدث وقت خادم (u) وصلنا إليه — أساس المزامنة التفاضلية
const IDX_E = "ws_index_e";              // "حقبة" الفهرس: تتغير عند إعادة بنائه كاملاً فيُنزَّل من جديد

const LS = (function () {
  let ok = true;
  const mem = {};
  try {
    localStorage.setItem("__ws_t", "1");
    localStorage.removeItem("__ws_t");
  } catch (e) { ok = false; }

  function evictProductCaches() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.indexOf("ws_products_") === 0 || k === DB_KEYS.miniIndex)) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) { /* ignore */ }
  }

  return {
    get(key) {
      try { return ok ? localStorage.getItem(key) : (key in mem ? mem[key] : null); }
      catch (e) { return null; }
    },
    set(key, value) {
      if (!ok) { mem[key] = String(value); return true; }
      try { localStorage.setItem(key, value); return true; }
      catch (e) {
        evictProductCaches();
        try { localStorage.setItem(key, value); return true; }
        catch (e2) { return false; }
      }
    },
    remove(key) {
      try { if (ok) localStorage.removeItem(key); else delete mem[key]; } catch (e) { /* ignore */ }
    },
    keys() {
      const out = [];
      try {
        if (!ok) return Object.keys(mem);
        for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
      } catch (e) { /* ignore */ }
      return out;
    }
  };
})();

/* مخزن الفهرس: IndexedDB خفيف (key-value) بلا مكتبات خارجية.
   عند تعذّره (تصفح خاص/متصفح قديم/ممتلئ) يعود المتجر تلقائياً إلى localStorage ثم الذاكرة — يرفض الوعد فيتصرّف المستدعي. */
const IdxStore = (function () {
  const DB_NAME = "ws_store", STORE = "kv";
  let dbp = null;
  let broken = (typeof indexedDB === "undefined" || !indexedDB);

  function open() {
    if (broken) return Promise.reject(new Error("IndexedDB unavailable"));
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { broken = true; return reject(e); }
      req.onupgradeneeded = function () {
        try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); } catch (e) { /* ignore */ }
      };
      req.onsuccess = function () {
        const db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (e) {} dbp = null; };
        db.onclose = function () { dbp = null; };
        resolve(db);
      };
      req.onerror = function () { broken = true; reject(req.error || new Error("IndexedDB error")); };
      req.onblocked = function () { reject(new Error("IndexedDB blocked")); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        let tx, req;
        try { tx = db.transaction(STORE, mode); req = fn(tx.objectStore(STORE)); }
        catch (e) { dbp = null; return reject(e); }
        tx.oncomplete = function () { resolve(req && "result" in req ? req.result : undefined); };
        tx.onerror = function () { reject(tx.error || new Error("IndexedDB tx error")); };
        tx.onabort = function () { reject(tx.error || new Error("IndexedDB tx aborted")); };
      });
    });
  }

  return {
    available() { return !broken; },
    get(key) { return run("readonly", function (st) { return st.get(key); }); },
    // عدّة مفاتيح في معاملة واحدة (ذرّية): العناصر + بيانات النسخة معاً
    setMany(obj) {
      return run("readwrite", function (st) { Object.keys(obj).forEach(function (k) { st.put(obj[k], k); }); }).then(function () { return true; });
    },
    del(keys) {
      return run("readwrite", function (st) { keys.forEach(function (k) { st.delete(k); }); }).then(function () { return true; });
    }
  };
})();
let _idxResetP = Promise.resolve();   // يُنتظر قبل تحميل الفهرس (يُضبط عند تغيّر dataVersion)

function parseJSON(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) { return fallback; }
}

const _memo = {};
function memoParse(key, fallback) {
  const raw = LS.get(key);
  const m = _memo[key];
  if (m && m.raw === raw) return m.val;
  const val = parseJSON(raw, fallback);
  _memo[key] = { raw: raw, val: val };
  return val;
}

const DB_URL = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.firebaseDatabaseURL) || "")
  .trim().replace(/\/+$/, "");

let firebaseEnabled = !!DB_URL;
let database = null;
let firebaseAuth = null;

(function initFirebaseSdkIfLoaded() {
  if (!DB_URL) return;
  if (typeof firebase === "undefined") return;
  try {
    const cfg = STORE_CONFIG || {};
    const authReady = [cfg.firebaseApiKey, cfg.firebaseAuthDomain, cfg.firebaseProjectId, cfg.firebaseAppId]
      .every(v => String(v || "").trim());
    const appConfig = { databaseURL: DB_URL };
    if (authReady) {
      Object.assign(appConfig, {
        apiKey: String(cfg.firebaseApiKey).trim(),
        authDomain: String(cfg.firebaseAuthDomain).trim(),
        projectId: String(cfg.firebaseProjectId).trim(),
        storageBucket: String(cfg.firebaseStorageBucket || "").trim(),
        messagingSenderId: String(cfg.firebaseMessagingSenderId || "").trim(),
        appId: String(cfg.firebaseAppId).trim()
      });
    }
    firebase.initializeApp(appConfig);
    database = firebase.database();
    if (authReady && typeof firebase.auth === "function") firebaseAuth = firebase.auth();
  } catch (e) {
    console.error("Firebase init error:", e);
    database = null;
  }
})();

function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function buildCartItemKey(productId, meta) {
  meta = meta || {};
  const parts = [productId];
  if (meta.color) parts.push("c:" + meta.color);
  if (meta.size) parts.push("s:" + meta.size);
  if (meta.variant) parts.push("v:" + meta.variant);
  return parts.join("|");
}

function takeEarly(url) {
  const e = window.__early;
  if (e && e[url]) { const p = e[url]; delete e[url]; return p; }
  return null;
}

function productQuery(field, value, limit) {
  let qs = "?orderBy=" + encodeURIComponent(JSON.stringify(field)) +
           "&equalTo=" + encodeURIComponent(JSON.stringify(value));
  if (limit) qs += "&limitToFirst=" + limit;
  return qs;
}

async function restGet(path, qs, timeoutMs) {
  const url = DB_URL + "/" + path + ".json" + (qs || "");
  const early = takeEarly(url);
  if (early) {
    try {
      const r = await early;
      if (r !== undefined) return r;
    } catch (e) {}
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || FETCH_TIMEOUT_MS) : null;
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal, cache: "no-store" } : { cache: "no-store" });
      if (!res.ok) {
        const err = new Error("Firebase HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      if ((e && e.status && e.status < 500) || attempt === 1) throw e;
      await new Promise(function (r) { setTimeout(r, 400); });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function firebaseValueToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.keys(value).map(function (key) { return value[key]; }).filter(Boolean);
}

function compareKeys(a, b) {
  const ai = /^(0|[1-9]\d*)$/.test(a), bi = /^(0|[1-9]\d*)$/.test(b);
  if (ai && bi) return Number(a) - Number(b);
  if (ai) return -1;
  if (bi) return 1;
  return a < b ? -1 : (a > b ? 1 : 0);
}

function entriesFromValue(val) {
  if (!val) return [];
  let out = [];
  if (Array.isArray(val)) {
    val.forEach(function (v, i) { if (v) out.push([String(i), v]); });
  } else {
    Object.keys(val).forEach(function (k) { if (val[k]) out.push([k, val[k]]); });
  }
  return out.sort(function (x, y) { return compareKeys(x[0], y[0]); });
}

function buildPage(entries, pageSize, cursorKey) {
  if (cursorKey !== null && cursorKey !== undefined && cursorKey !== "") {
    entries = entries.filter(function (e) { return compareKeys(e[0], String(cursorKey)) > 0; });
  }
  const hasMore = entries.length > pageSize;
  const pageEntries = entries.slice(0, pageSize);
  const last = pageEntries.length ? pageEntries[pageEntries.length - 1][0] : null;
  return {
    products: pageEntries.map(function (e) { return e[1]; }),
    nextCursor: hasMore ? last : null,
    done: !hasMore
  };
}

let _wholeProducts = null;
async function wholeProductsEntries() {
  if (_wholeProducts && Date.now() - _wholeProducts.t < QUERY_CACHE_MS) return _wholeProducts.entries;
  const val = await restGet(DB_KEYS.products, "", 30000);
  const entries = entriesFromValue(val);
  _wholeProducts = { t: Date.now(), entries: entries };
  return entries;
}

let _warnedIndex = {};
async function matchEntries(field, value, limit) {
  try {
    return entriesFromValue(await restGet(DB_KEYS.products, productQuery(field, value, limit)));
  } catch (e) {
    if (!e || e.status !== 400) throw e;
    if (!_warnedIndex[field]) {
      _warnedIndex[field] = true;
      console.warn('Firebase Rules: أضف "' + field + '" إلى .indexOn تحت ws_products.');
    }
    return (await wholeProductsEntries()).filter(function (en) { return en[1] && en[1][field] === value; });
  }
}

const _matchCache = {};
async function matchAll(field, value) {
  const k = field + "|" + JSON.stringify(value);
  const c = _matchCache[k];
  if (c && Date.now() - c.t < QUERY_CACHE_MS) return c.entries;
  const entries = await matchEntries(field, value, 0);
  _matchCache[k] = { t: Date.now(), entries: entries };
  return entries;
}

function syncNodeToFirebase(nodeKey, data) {
  if (!firebaseEnabled) return Promise.resolve(true);
  if (!database) { console.warn("Firebase SDK غير محمّل — لا يمكن الكتابة إلى " + nodeKey); return Promise.resolve(false); }
  return database.ref(nodeKey).set(data).then(function () { return true; }).catch(function (error) {
    console.error("Firebase Sync Error for " + nodeKey + ":", error);
    return false;
  });
}

async function fetchNode(nodeKey) {
  if (!firebaseEnabled) return null;
  if (nodeKey === DB_KEYS.orders) {
    if (!database) throw new Error("Firebase SDK مطلوب لقراءة الطلبات");
    const snapshot = await database.ref(nodeKey).get();
    return snapshot.exists() ? snapshot.val() : null;
  }
  const v = await restGet(nodeKey, "");
  return v === undefined ? null : v;
}

async function fetchProductsByFieldFromFirebase(field, value) {
  if (!firebaseEnabled) return [];
  return (await matchEntries(field, value, 0)).map(function (e) { return e[1]; });
}

async function fetchProductsPageByCategoryFromFirebase(categoryId, pageSize, cursorKey) {
  if (!firebaseEnabled || !categoryId || categoryId === "all") return { products: [], nextCursor: null, done: true };
  return fetchProductsPageByFieldFromFirebase("categoryId", categoryId, pageSize, cursorKey);
}

async function fetchProductsPageByCategoriesFromFirebase(categoryIds, pageSize, cursorKey) {
  if (!firebaseEnabled || !categoryIds || !categoryIds.length) return { products: [], nextCursor: null, done: true };
  const lists = await Promise.all(categoryIds.map(function (id) {
    return cursorKey ? matchAll("categoryId", id) : matchEntries("categoryId", id, pageSize + 1);
  }));
  const byKey = new Map();
  lists.forEach(function (entries) { entries.forEach(function (e) { byKey.set(e[0], e); }); });
  const merged = Array.from(byKey.values()).sort(function (a, b) { return compareKeys(a[0], b[0]); });
  return buildPage(merged, pageSize, cursorKey);
}

async function fetchProductsPageByFieldFromFirebase(field, value, pageSize, cursorKey) {
  if (!firebaseEnabled) return { products: [], nextCursor: null, done: true };
  if (!cursorKey && value === true && (field === "featured" || field === "isOffer" || field === "isNew")) {
    // علامات قليلة العدد عادةً: نجلبها كلها ثم نرتّب بالأحدث (المفاتيح الآن معرّفات لا ترتيب زمني)
    const all = (await matchAll(field, value)).map(function (e) { return e[1]; })
      .sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
    return { products: all.slice(0, pageSize), nextCursor: null, done: true };
  }
  const entries = cursorKey
    ? await matchAll(field, value)
    : await matchEntries(field, value, pageSize + 1);
  return buildPage(entries, pageSize, cursorKey);
}

async function fetchProductsPageFromFirebase(pageSize, cursorKey) {
  if (!firebaseEnabled) return { products: [], nextCursor: null, done: true };
  let entries;
  try {
    let qs = "?orderBy=" + encodeURIComponent('"$key"');
    if (cursorKey) qs += "&startAt=" + encodeURIComponent(JSON.stringify(String(cursorKey)));
    qs += "&limitToFirst=" + (pageSize + (cursorKey ? 2 : 1));
    entries = entriesFromValue(await restGet(DB_KEYS.products, qs));
  } catch (e) {
    if (!e || e.status !== 400) throw e;
    entries = await wholeProductsEntries();
  }
  return buildPage(entries, pageSize, cursorKey);
}

async function fetchProductByIdFromFirebase(productId) {
  if (!firebaseEnabled || !productId) return null;
  const pid = String(productId);
  if (/^[^.$#\[\]\/]+$/.test(pid)) {
    try {
      const direct = await restGet(DB_KEYS.products + "/" + encodeURIComponent(pid), "", 10000);
      if (direct && typeof direct === "object" && !Array.isArray(direct) && String(direct.id || direct.objectID || pid) === pid) return direct;
    } catch (e) { if (!e || e.status !== 400) throw e; }
  }
  // بنية قديمة (مفاتيح أرقام): استعلام بالحقل id
  const entries = await matchEntries("id", productId, 1);
  return entries.length ? entries[0][1] : null;
}

async function fetchAllProductsFromFirebase() {
  if (!firebaseEnabled) return null;
  const value = await restGet(DB_KEYS.products, "", 30000);
  analyzeProductsStructure(value);
  return value === null || value === undefined ? [] : firebaseValueToArray(value);
}

let _pullPromise = null;
function pullFromFirebase(force) {
  if (_pullPromise) return _pullPromise;
  _pullPromise = _pullFromFirebase(force).finally(function () { _pullPromise = null; });
  return _pullPromise;
}

async function _pullFromFirebase(force) {
  if (!firebaseEnabled) return;
  const lastSync = Number(LS.get("last_meta_pull_time") || 0);
  const now = Date.now();
  if (!force && lastSync && (now - lastSync) < META_PULL_MS) return;

  try {
    let remoteMetaV = null;
    try {
      remoteMetaV = await restGet("ws_meta_v", "", 8000);
    } catch (e) {}

    const localMetaV = LS.get("ws_meta_v");
    const hasLocalCats = !!LS.get(DB_KEYS.categories);

    // إذا لم يكن الفحص إجبارياً، والبيانات موجودة محلياً، ولم يتغير رقم النسخة:
    // نحدث وقت الفحص ونخرج فوراً بدون تنزيل أي بايت إضافي
    if (!force && hasLocalCats && remoteMetaV !== null && remoteMetaV !== undefined && String(localMetaV) === String(remoteMetaV)) {
      LS.set("last_meta_pull_time", String(now));
      return;
    }

    const snapshotBefore = [DB_KEYS.categories, DB_KEYS.settings, DB_KEYS.ads].map(function (k) { return LS.get(k); }).join("\u0001");

    const results = await Promise.all([
      fetchNode(DB_KEYS.categories),
      fetchNode(DB_KEYS.settings),
      fetchNode(DB_KEYS.ads)
    ]);
    const rawCategories = results[0], settings = results[1], rawAds = results[2];

    LS.set(DB_KEYS.categories, JSON.stringify(firebaseValueToArray(rawCategories)));
    LS.set(DB_KEYS.ads, JSON.stringify(firebaseValueToArray(rawAds)));
    if (settings !== null) LS.set(DB_KEYS.settings, JSON.stringify(settings || {}));

    if (remoteMetaV !== null && remoteMetaV !== undefined) {
      LS.set("ws_meta_v", String(remoteMetaV));
    }
    LS.set("last_meta_pull_time", String(now));

    const snapshotAfter = [DB_KEYS.categories, DB_KEYS.settings, DB_KEYS.ads].map(function (k) { return LS.get(k); }).join("\u0001");
    if (snapshotAfter !== snapshotBefore || !lastSync) emitStoreEvent("store:synced");
  } catch (e) {
    console.error("Firebase metadata pull error:", e);
    emitStoreEvent("store:sync-error");
  }
}

let _domReady = document.readyState === "complete";
const _queuedEvents = [];
if (!_domReady) {
  document.addEventListener("DOMContentLoaded", function () {
    _domReady = true;
    _queuedEvents.splice(0).forEach(function (n) { document.dispatchEvent(new CustomEvent(n)); });
  });
}
function emitStoreEvent(name) {
  if (_domReady) document.dispatchEvent(new CustomEvent(name));
  else if (_queuedEvents.indexOf(name) === -1) _queuedEvents.push(name);
}

function seedIfNeeded() {
  const currentVersion = String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.dataVersion) || "1");
  const storedVersion = LS.get("ws_data_version");

  if (storedVersion !== currentVersion) {
    const keysToRemove = [
      DB_KEYS.categories,
      DB_KEYS.products,
      DB_KEYS.miniIndex,
      DB_KEYS.ads,
      "last_meta_pull_time",
      "ws_products_all_time",
      DB_KEYS.productsCount,
      IDX_ITEMS, IDX_V, IDX_CHECKED, IDX_U, IDX_E,
      "ws_meta_v"
    ];
    _idxResetP = IdxStore.del(["items", "meta"]).catch(function () { /* IndexedDB غير متاح: لا شيء لمسحه */ });
    LS.keys().forEach(function (key) {
      if (key && (key.indexOf("ws_products_") === 0 || keysToRemove.indexOf(key) !== -1)) LS.remove(key);
    });
    LS.set("ws_data_version", currentVersion);
    LS.remove(DB_KEYS.seeded);
  }

  if (LS.get(DB_KEYS.seeded)) return;

  LS.set(DB_KEYS.categories, JSON.stringify([]));
  LS.set(DB_KEYS.products, JSON.stringify([]));
  LS.set(DB_KEYS.miniIndex, JSON.stringify([]));

  const cfg = (typeof STORE_CONFIG !== "undefined") ? STORE_CONFIG : {};
  LS.set(DB_KEYS.settings, JSON.stringify({
    storeName: cfg.storeName || "",
    storeTagline: cfg.storeTagline || "",
    storeDescription: cfg.storeDescription || "",
    whatsapp: cfg.whatsappNumber || "",
    instagram: cfg.instagram || "",
    tiktok: cfg.tiktok || "",
    phone: cfg.phone || "",
    phone2: cfg.phone2 || "",
    mapUrl: cfg.mapUrl || "",
    address: cfg.address || "",
    workingHours: cfg.workingHours || "",
    deliveryInfo: cfg.deliveryInfo || "",
    currencySymbol: cfg.currencySymbol || "د.ع"
  }));

  LS.set(DB_KEYS.cart, JSON.stringify([]));
  LS.set(DB_KEYS.orders, JSON.stringify([]));
  LS.set(DB_KEYS.ads, JSON.stringify([]));
  LS.set(DB_KEYS.productsCount, "0");
  LS.set(DB_KEYS.seeded, "1");
}

seedIfNeeded();
pullFromFirebase();

function inventoryKey(color, size) {
  return (color || "_") + "||" + (size || "_");
}

function sumInventory(inventory) {
  if (!inventory) return 0;
  return Object.values(inventory).reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
}

let _productsMem = null;
let _catalogReady = false;      // فهرس الأدمن جاهز (يكفي لكتابة منتج واحد)
let _productsFullyLoaded = false;
let _lastProductsWrite = Promise.resolve(true);
const _inflight = {};
function dedupe(key, fn) {
  if (_inflight[key]) return _inflight[key];
  const p = Promise.resolve().then(fn).finally(function () { delete _inflight[key]; });
  _inflight[key] = p;
  return p;
}

function totalStockOf(p) {
  if (!p) return 0;
  const hasMatrix = (Array.isArray(p.colors) && p.colors.length > 0) || (Array.isArray(p.sizes) && p.sizes.length > 0);
  return hasMatrix && p.inventory ? sumInventory(p.inventory) : (Number(p.stock) || 0);
}

function writeProductsLocal(list, isFullSnapshot) {
  if (Array.isArray(list)) {
    if (isFullSnapshot) {
      LS.set(DB_KEYS.productsCount, String(list.length));
      LS.set("ws_products_count_time", String(Date.now()));
    }
  }
  // القوائم الكبيرة (جلسة الأدمن) تبقى في الذاكرة: لا نرمّزها JSON كل مرة ولا نتجاوز حصة localStorage
  if (Array.isArray(list) && list.length > LS_PRODUCTS_MAX_ITEMS) { _productsMem = list; LS.remove(DB_KEYS.products); return; }
  if (LS.set(DB_KEYS.products, JSON.stringify(list))) _productsMem = null;
  else _productsMem = list;
}
const LS_PRODUCTS_MAX_ITEMS = 600;

const AR_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
function normalizeSearch(str) {
  return String(str === null || str === undefined ? "" : str).toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\u0660-\u0669]/g, function (d) { return String(AR_DIGITS.indexOf(d)); })
    .replace(/\s+/g, " ").trim();
}

/* ==========================================================================
   الفهرس الخفيف (ws_index): سجلات مصغّرة بمفاتيح من حرف واحد + تخزين محلي في IndexedDB
     i=id n=name p=price c=categoryId s=stock(المتوفر فقط) m=image b=barcode a=0(غير متاح)
     f=مميز o=عرض d=السعر القديم w=جديد cl=الألوان [[اسم,hex]] z=المقاسات vc=عدد التركيبات
     t=تاريخ الإنشاء (للترتيب: الأحدث أولاً) u=وقت الخادم لآخر تعديل (للمزامنة التفاضلية) x=1 قبر (محذوف)
   كل قيمة افتراضية/فارغة تُحذف من السجل. ويُقبل أيضاً الشكل القديم (id,name,price,...) عند القراءة.
   ========================================================================== */
function rid(r) { return r ? String(r.i || r.id || r.objectID || "") : ""; }

function minifyColors(colors) {
  return colors.map(function (c) { return [(c && c.name) || "", (c && c.hex) || ""]; });
}

function buildIndexRecord(p) {
  if (!p) return null;
  const id = String(p.id || p.objectID || "");
  if (!id) return null;
  const r = { i: id };
  if (p.name) r.n = String(p.name);
  const price = Number(p.price) || 0;
  if (price) r.p = price;
  if (p.categoryId) r.c = p.categoryId;
  const stock = totalStockOf(p);
  if (stock > 0) r.s = stock;
  if (p.image) r.m = p.image;
  if (p.barcode || p.sku) r.b = String(p.barcode || p.sku);   // الباركود أو SKU (للعرض والبحث)
  if (p.available === false) r.a = 0;
  if (p.featured) r.f = 1;
  if (p.isOffer) { r.o = 1; if (Number(p.oldPrice) > price) r.d = Number(p.oldPrice); }
  if (p.isNew) r.w = 1;
  if (Array.isArray(p.colors) && p.colors.length) r.cl = minifyColors(p.colors);
  if (Array.isArray(p.sizes) && p.sizes.length) r.z = p.sizes;
  if (Array.isArray(p.variants) && p.variants.length) r.vc = p.variants.length;
  const t = Number(p.createdAt) || 0;
  if (t) r.t = t;
  return r;
}

// يحوّل أي سجل (قديم بالمفاتيح الكاملة أو مصغّر) إلى الشكل المصغّر؛ القبور (x) والسجلات بلا id تُرجع null
function toMinimalRecord(r) {
  if (!r || typeof r !== "object" || r.x) return null;
  if (r.i) return r;
  if (!r.id) return null;
  const m = buildIndexRecord({ id: r.id, name: r.name, price: r.price, categoryId: r.categoryId, image: r.image, barcode: r.barcode,
    available: r.available, featured: r.featured, isOffer: r.isOffer, oldPrice: r.oldPrice, isNew: r.isNew,
    colors: r.colors, sizes: r.sizes, stock: r.stock, createdAt: r.createdAt });
  if (m && Number(r.vc)) m.vc = Number(r.vc);
  if (m && r.u) m.u = r.u;
  return m;
}

function buildIndexPayload(list) {
  return { v: Date.now(), items: (list || []).map(buildIndexRecord).filter(Boolean) };
}

function hydrateIndexRecord(raw) {
  const r = toMinimalRecord(raw);
  if (!r) return null;
  const vc = Number(r.vc) || 0;
  const name = r.n || "", barcode = r.b || "";
  return {
    id: r.i, objectID: r.i, name: name, price: Number(r.p) || 0, oldPrice: Number(r.d) || 0,
    categoryId: r.c || "", image: r.m || null, barcode: barcode,
    available: r.a !== 0 && r.a !== false, stock: Number(r.s) || 0,
    featured: !!r.f, isOffer: !!r.o, isNew: !!r.w,
    colors: Array.isArray(r.cl) ? r.cl.map(function (c) {
      return Array.isArray(c) ? { name: c[0] || "", hex: c[1] || "" } : { name: (c && c.name) || "", hex: (c && c.hex) || "" };
    }) : [],
    sizes: Array.isArray(r.z) ? r.z : [],
    variants: vc ? new Array(vc).fill(0) : [],
    createdAt: Number(r.t) || 0,
    _k: normalizeSearch(name + " " + barcode),
    _n: normalizeSearch(name)
  };
}

/* ---------- الحالة المحلية للفهرس ---------- */
let _idxRaw = null;     // Map(id → سجل مصغّر): النسخة المحلية الكاملة
let _idxHyd = null;     // Map(id → سجل مُهيَّأ للبحث)
let _indexMem = null;   // مصفوفة مرتبة (الأحدث أولاً) تُرجعها getIndexItems()
let _idxMeta = null;    // { v, u, e } للنسخة المخزّنة
let _idxLoadP = null;
let _idxPersistT = null;

function sortHydrated(arr) {
  let hasT = false;
  for (let i = 0; i < arr.length; i++) { if (arr[i].createdAt) { hasT = true; break; } }
  // بلا t (فهرس قديم) نُبقي ترتيب الخادم؛ ومعه نرتّب الأحدث أولاً (ثابت: المتساوي يحتفظ بترتيبه)
  return hasT ? arr.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }) : arr;
}
function reorderIndexMem() { _indexMem = sortHydrated(Array.from(_idxHyd.values())); }
function setIndexRaw(map) {
  _idxRaw = map;
  _idxHyd = new Map();
  map.forEach(function (r, id) { const h = hydrateIndexRecord(r); if (h) _idxHyd.set(id, h); });
  reorderIndexMem();
}
function putIndexRecord(raw) {
  const r = toMinimalRecord(raw);
  if (!r) return;
  _idxRaw.set(r.i, r);
  const h = hydrateIndexRecord(r);
  if (h) _idxHyd.set(r.i, h);
}
function dropIndexRecord(id) { _idxRaw.delete(id); _idxHyd.delete(id); }
function indexMapFromList(list) {
  const m = new Map();
  (list || []).forEach(function (raw) { const r = toMinimalRecord(raw); if (r) m.set(r.i, r); });
  return m;
}

// الكتابة: عناصر + بيانات النسخة في معاملة IndexedDB واحدة؛ وعند تعذّرها نسخة JSON في localStorage (الشكل القديم)
async function persistIndexNow() {
  if (!_idxRaw) return;
  const items = Array.from(_idxRaw.values());
  let ok = false;
  try { ok = await IdxStore.setMany({ items: items, meta: _idxMeta || null }); } catch (e) { ok = false; }
  if (ok) LS.remove(IDX_ITEMS);
  else LS.set(IDX_ITEMS, JSON.stringify(items));   // ممتلئ؟ يبقى الفهرس في الذاكرة فقط لهذه الجلسة
}
function persistIndexSoon() {
  if (_idxPersistT) return;
  _idxPersistT = setTimeout(function () { _idxPersistT = null; persistIndexNow(); }, 400);
}

// تحميل الفهرس المحلي مرة واحدة: IndexedDB أولاً، ثم نسخة localStorage القديمة/الاحتياطية (وتُرحَّل تلقائياً)
function loadIndexLocal() {
  if (_idxLoadP) return _idxLoadP;
  _idxLoadP = (async function () {
    await _idxResetP;
    let items, meta;
    try { items = await IdxStore.get("items"); meta = await IdxStore.get("meta"); } catch (e) { items = undefined; }
    if (Array.isArray(items) && items.length) {
      if (meta) {   // IndexedDB هو المرجع: نُصلح أرقام localStorage إن لم تتطابق (مثلاً بعد انقطاع الكتابة)
        LS.set(IDX_V, String(meta.v)); LS.set(IDX_U, String(meta.u || 0)); LS.set(IDX_E, String(meta.e == null ? 0 : meta.e));
        _idxMeta = meta;
      }
    } else {
      const raw = LS.get(IDX_ITEMS);
      const parsed = raw ? parseJSON(raw, null) : null;
      items = Array.isArray(parsed) ? parsed : undefined;
    }
    if (_idxRaw === null && Array.isArray(items) && items.length) {
      setIndexRaw(indexMapFromList(items));
      if (!_idxMeta) _idxMeta = { v: LS.get(IDX_V), u: Number(LS.get(IDX_U) || 0), e: LS.get(IDX_E) || 0 };
      if (LS.get(IDX_ITEMS)) persistIndexNow();   // ترحيل نسخة localStorage الكبيرة إلى IndexedDB وتفريغ المساحة
    }
  })().catch(function (e) { console.warn("Index load error:", e); });
  return _idxLoadP;
}

// تخزين فهرس كامل (تنزيل كامل من الخادم): meta = { v, u, e }
function storeIndexLocal(list, meta) {
  setIndexRaw(indexMapFromList(list));
  _idxMeta = meta ? { v: meta.v, u: meta.u || 0, e: meta.e == null ? 0 : meta.e } : null;
  if (_idxMeta) {
    LS.set(IDX_V, String(_idxMeta.v)); LS.set(IDX_U, String(_idxMeta.u)); LS.set(IDX_E, String(_idxMeta.e));
    LS.set(IDX_CHECKED, String(Date.now()));
  }
  return persistIndexNow();
}

function indexListFromRemote(val) {
  const out = [];
  if (!val) return out;
  if (Array.isArray(val)) { val.forEach(function (r) { if (r && !r.x) out.push(r); }); return out; }
  Object.keys(val).forEach(function (k) {
    const r = val[k];
    if (!r || typeof r !== "object" || r.x) return;
    if (!r.i && !r.id) r.i = k;
    out.push(r);
  });
  return out;
}
function maxIndexU(list) {
  let m = 0;
  list.forEach(function (r) { const u = Number(r && r.u) || 0; if (u > m) m = u; });
  return m;
}

// تطبيق التغييرات فقط (سجلات u ≥ آخر ما وصلنا إليه): المحدَّث يُستبدل والقبر يُحذف
function applyIndexDelta(part, remoteV, prevU, remoteE) {
  let maxU = prevU;
  const keys = part ? Object.keys(part) : [];
  keys.forEach(function (k) {
    const r = part[k];
    if (!r || typeof r !== "object") return;
    const u = Number(r.u) || 0;
    if (u > maxU) maxU = u;
    const id = String(r.i || r.id || k);
    if (r.x) dropIndexRecord(id);
    else { if (!r.i && !r.id) r.i = id; putIndexRecord(r); }
  });
  reorderIndexMem();
  _idxMeta = { v: remoteV, u: maxU, e: remoteE == null ? 0 : remoteE };
  LS.set(IDX_V, String(remoteV)); LS.set(IDX_U, String(maxU)); LS.set(IDX_E, String(_idxMeta.e));
  LS.set(IDX_CHECKED, String(Date.now()));
  persistIndexNow();
  return keys.length;
}

// الأدمن: تعديل سجل واحد فقط داخل الفهرس المحلي (بدون إعادة بنائه كاملاً)
function applyLocalIndexChange(upsert, removed, fullList) {
  if (!_idxRaw) {
    if (!fullList) return;                       // لا فهرس محلي: يُبنى من المنتجات عند القراءة
    setIndexRaw(indexMapFromList(fullList.map(buildIndexRecord)));
    persistIndexSoon();
    return;
  }
  upsert.forEach(function (p) { const r = buildIndexRecord(p); if (r) putIndexRecord(r); });
  removed.forEach(function (id) { dropIndexRecord(String(id)); });
  reorderIndexMem();
  persistIndexSoon();
}

/* ---------- كتابة Firebase الجزئية (الأدمن عبر SDK) ---------- */
function serverValue() {
  const sv = (typeof firebase !== "undefined" && firebase.database && firebase.database.ServerValue) || null;
  return {
    TIMESTAMP: sv ? sv.TIMESTAMP : Date.now(),
    increment: function (n) { return (sv && typeof sv.increment === "function") ? sv.increment(n) : Date.now(); }
  };
}
function safeKey(id) {
  return String(id == null ? "" : id).trim().replace(/[.$#\[\]\/\s]+/g, "_").replace(/[\u0000-\u001f\u007f]/g, "") || uid("prd");
}

let _lastWriteError = null;   // آخر سبب لفشل كتابة المنتجات: {kind, message} (يعرضه الأدمن بنص مفهوم)
// يصنّف خطأ Firebase: PERMISSION (قواعد/حساب)، KEY (رمز غير مسموح في اسم لون/مقاس)، NETWORK، وإلا OTHER
function classifyWriteError(err) {
  const msg = String((err && (err.message || err.code)) || err || "");
  const code = String((err && err.code) || "");
  let kind = "OTHER";
  if (/permission[_ ]denied/i.test(msg + " " + code)) kind = "PERMISSION";
  else if (/invalid key|illegal.*key|not a valid key|can't contain/i.test(msg)) kind = "KEY";
  else if (/network|offline|timeout|failed to fetch|disconnected/i.test(msg + " " + code)) kind = "NETWORK";
  return { kind: kind, message: msg.slice(0, 200) };
}

const WRITE_CHUNK = 150;            // منتج لكل طلب كتابة (≈ 200–400KB)، تفادياً لحدّ 16MB للطلب الواحد
const MIGRATION_BASE_TS = 1700000000000;   // أساس ثابت لترتيب المنتجات القديمة (يسمح باستئناف الترحيل)
const _createdAtById = new Map();

let _productsStructure = "unknown";   // "keyed" (ws_products/{id}) | "legacy" (مصفوفة أو مفاتيح ≠ id) | "unknown"
let _legacyEntries = [];
let _loadedEntries = [];
let _remoteKeys = [];

function analyzeProductsStructure(value) {
  const entries = entriesFromValue(value);
  _remoteKeys = entries.map(function (e) { return e[0]; });
  _legacyEntries = [];
  entries.forEach(function (e, pos) {
    const p = e[1];
    if (!p.id || String(p.id) !== e[0]) _legacyEntries.push({ key: e[0], pos: pos, product: p });
  });
  _productsStructure = _legacyEntries.length ? "legacy" : "keyed";
  _loadedEntries = _legacyEntries.length ? entries : [];   // الذاكرة: نحتفظ بالقائمة كاملة فقط لو احتجنا ترحيلاً
}

/* كشف خفيف للبنية (بدون تحميل الكتالوج): أول عقدة بترتيب المفاتيح. المفاتيح الرقمية (0,1,2…) تسبق النصية في Firebase،
   فبقايا المصفوفة القديمة تظهر دائماً أولاً. نتيجتها "keyed" | "legacy" | تبقى "unknown" عند فشل الشبكة. */
async function detectProductsStructure() {
  if (_productsStructure !== "unknown") return _productsStructure;
  if (!firebaseEnabled) { _productsStructure = "keyed"; return _productsStructure; }
  try {
    const v = await restGet(DB_KEYS.products, "?orderBy=" + encodeURIComponent('"$key"') + "&limitToFirst=1", 15000);
    const first = v ? entriesFromValue(v)[0] : null;
    if (!first) _productsStructure = "keyed";                      // لا منتجات بعد
    else _productsStructure = (first[1] && first[1].id && String(first[1].id) === String(first[0])) ? "keyed" : "legacy";
  } catch (e) { console.warn("detectProductsStructure:", e); }
  return _productsStructure;
}

/* بصمة كل منتج عند آخر مزامنة مع الخادم. نقارن بها (لا بالكائنات المحلية) لأن الأدمن يعدّل كائنات المنتجات في
   مكانها (الاستيراد/خصم المخزون) ثم يستدعي saveProducts(list) — المقارنة بالنسخة المحلية كانت ستراها "بلا تغيير". */
const _syncedHash = new Map();
function hashJson(str) {   // cyrb53: بصمة 53 بت سريعة (ليست للتشفير)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function productHash(p) { return hashJson(JSON.stringify(p)); }
function resetSyncedHashes(list) {
  _syncedHash.clear();
  list.forEach(function (p) { if (p && p.id) _syncedHash.set(String(p.id), productHash(p)); });
}
function markSynced(upsert, removed) {
  upsert.forEach(function (p) { _syncedHash.set(String(p.id), productHash(stampCreatedAt(p))); });
  removed.forEach(function (id) { _syncedHash.delete(String(id)); });
}
function afterCommit(promise, upsert, removed) {
  return promise.then(function (ok) { if (ok) markSynced(upsert, removed); return ok; });
}

function createdAtFor(id) {
  if (_createdAtById.has(id)) return _createdAtById.get(id);
  const r = _idxRaw && _idxRaw.get(id);
  return r && r.t ? r.t : 0;
}
function stampCreatedAt(p) {
  if (!p || p.createdAt) return p;
  const t = createdAtFor(String(p.id));
  return t ? Object.assign({}, p, { createdAt: t }) : p;
}

async function writeFullIndex(list) {
  const sv = serverValue();
  const items = {};
  list.forEach(function (p) {
    const r = buildIndexRecord(p);
    if (r) { const id = r.i; delete r.i; r.u = sv.TIMESTAMP; items[id] = r; }   // المعرّف هو المفتاح: لا نكرره داخل السجل (يوفّر ~20 بايت/منتج)
  });
  await database.ref(DB_KEYS.index).set({ v: sv.TIMESTAMP, e: sv.TIMESTAMP, items: items });
  // أرقام الخادم (v/e/u) غير معروفة محلياً → نجبر تنزيلاً كاملاً عند أول ensureIndexFresh
  LS.remove(IDX_V); LS.remove(IDX_U); LS.remove(IDX_E);
  _idxMeta = null;
  setIndexRaw(indexMapFromList(list.map(buildIndexRecord)));
  persistIndexSoon();
}

/* ترحيل غير مدمِّر: مصفوفة ws_products (أو مفاتيح ≠ id) → ws_products/{id}.
   - دفعات ذرّية (كل دفعة: حذف المفتاح القديم + كتابة المفتاح الجديد معاً) فلا ضياع إن انقطع الاتصال، ويُستأنف عند الحفظ التالي.
   - يتحقق قبل البدء أن الخادم لم يتغيّر منذ التحميل (مفاتيح غريبة = إيقاف).
   - يعيد بناء الفهرس كاملاً بالشكل الجديد (مفتاح لكل منتج + وقت خادم u) ويرفع الحقبة e فيُنزّله الزوار من جديد مرة واحدة. */
async function migrateToKeyed() {
  if (_productsStructure !== "legacy") return _productsStructure === "keyed";
  const sv = serverValue();
  emitStoreEvent("store:migration-start");
  const legacyKeys = new Set(_legacyEntries.map(function (e) { return e.key; }));
  const used = new Set(_remoteKeys.filter(function (k) { return !legacyKeys.has(k); }));
  const moves = _legacyEntries.map(function (e) {
    const p = e.product;
    const base = safeKey(p.id || p.objectID || uid("prd"));
    let id = base, n = 1;
    while (used.has(id) || (legacyKeys.has(id) && id !== e.key)) id = base + "-" + (++n);   // فريد دائماً، بلا دهس أي عقدة
    used.add(id);
    if (id !== base) console.warn("ترحيل المنتجات: المعرّف المكرر/غير الآمن «" + (p.id || "") + "» صار «" + id + "».");
    const numeric = /^\d+$/.test(e.key) ? Number(e.key) : e.pos;
    const createdAt = Number(p.createdAt) || (MIGRATION_BASE_TS - numeric);   // المفتاح 0 = الأحدث (كما كان unshift)
    const doc = JSON.parse(JSON.stringify(Object.assign({}, p, { id: id, objectID: id, createdAt: createdAt })));
    return { key: e.key, id: id, oldId: String(p.id || p.objectID || ""), createdAt: createdAt, doc: doc };
  });

  const shallow = await restGet(DB_KEYS.products, "?shallow=true", 20000);
  const known = new Set(_remoteKeys.concat(moves.map(function (m) { return m.id; })));
  const foreign = Object.keys(shallow || {}).filter(function (k) { return !known.has(k); });
  if (foreign.length) {
    console.error("إيقاف ترحيل المنتجات: تغيّرت بيانات الخادم منذ تحميل الصفحة (" + foreign.length + " عقدة جديدة). حدّث الصفحة ثم احفظ.");
    emitStoreEvent("store:migration-failed");
    return false;
  }

  for (let i = 0; i < moves.length; i += WRITE_CHUNK) {
    const upd = {};
    const part = moves.slice(i, i + WRITE_CHUNK);
    part.forEach(function (m) { if (m.key !== m.id) upd[DB_KEYS.products + "/" + m.key] = null; });
    part.forEach(function (m) { upd[DB_KEYS.products + "/" + m.id] = m.doc; });
    await database.ref().update(upd);
  }

  const byKey = new Map(moves.map(function (m) { return [m.key, m]; }));
  const finalList = _loadedEntries.map(function (e) { const m = byKey.get(e[0]); return m ? m.doc : e[1]; });
  await writeFullIndex(finalList);

  // المحلي: نصحّح id/createdAt فقط (لا نستبدل القائمة فقد تحوي تعديلاً معلّقاً)
  const byOld = new Map();
  moves.forEach(function (m) {
    byOld.set(m.oldId, m); _createdAtById.set(m.id, m.createdAt);
    _syncedHash.delete(m.oldId); _syncedHash.set(m.id, productHash(m.doc));
  });
  const cur = Store.getProducts().map(function (p) {
    const m = p && byOld.get(String(p.id));
    return m ? Object.assign({}, p, { id: m.id, objectID: m.id, createdAt: p.createdAt || m.createdAt }) : p;
  });
  writeProductsLocal(cur, true);
  _productsStructure = "keyed"; _legacyEntries = []; _loadedEntries = []; _remoteKeys = finalList.map(function (p) { return p.id; });
  console.info("تم ترحيل " + moves.length + " منتج إلى البنية الجديدة ws_products/{id}.");
  emitStoreEvent("store:migration-done");
  return true;
}
let _migrating = null;
async function ensureKeyedStructure() {
  if (_productsStructure === "unknown") await detectProductsStructure();
  if (_productsStructure === "keyed") return true;
  if (_productsStructure !== "legacy") return false;
  // الترحيل يحتاج كل المنتجات (مرة واحدة فقط): نحمّلها الآن إن لم تكن محمّلة
  if (!_loadedEntries.length) {
    await Store.loadAllProductsFromFirebase(true);
    if (_productsStructure === "keyed") return true;
    if (_productsStructure !== "legacy") return false;
  }
  if (!_migrating) _migrating = migrateToKeyed().catch(function (e) { console.error("Products migration error:", e); emitStoreEvent("store:migration-failed"); return false; })
    .then(function (ok) { _migrating = null; return ok; });
  return _migrating;
}

// كتابة المنتجات المتغيّرة فقط: ws_products/{id} + سجلها في ws_index/items/{id} + رفع ws_index/v ذرّياً
async function commitProductNodes(upsert, removeIds) {
  if (!firebaseEnabled) return true;
  if (!database) { console.warn("Firebase SDK غير محمّل — لا يمكن حفظ المنتجات."); _lastWriteError = { kind: "NOT_READY", message: "Firebase SDK غير محمّل" }; return false; }
  if (!upsert.length && !removeIds.length) return true;
  _lastWriteError = null;
  try {
    if (!(await ensureKeyedStructure())) { _lastWriteError = { kind: "STRUCTURE", message: "تعذّر التحقق من بنية المنتجات" }; return false; }
    const sv = serverValue();
    const ops = upsert.map(function (p) { return { p: p }; }).concat(removeIds.map(function (id) { return { rm: String(id) }; }));
    for (let i = 0; i < ops.length; i += WRITE_CHUNK) {
      const upd = {};
      ops.slice(i, i + WRITE_CHUNK).forEach(function (op) {
        if (op.p) {
          const id = String(op.p.id);
          const doc = JSON.parse(JSON.stringify(stampCreatedAt(op.p)));   // يُسقط undefined (ترفضها Firebase)
          const rec = buildIndexRecord(doc);
          delete rec.i;                       // المعرّف هو مفتاح العقدة (يُعاد ملؤه عند القراءة)
          rec.u = sv.TIMESTAMP;
          upd[DB_KEYS.products + "/" + id] = doc;
          upd[DB_KEYS.index + "/items/" + id] = rec;
        } else {
          upd[DB_KEYS.products + "/" + op.rm] = null;
          upd[DB_KEYS.index + "/items/" + op.rm] = { x: 1, u: sv.TIMESTAMP };   // قبر: يحذفه الزوار عند المزامنة التفاضلية
        }
      });
      upd[DB_KEYS.index + "/v"] = sv.increment(1);
      await database.ref().update(upd);
    }
    return true;
  } catch (error) {
    console.error("Firebase products sync error:", error);
    _lastWriteError = classifyWriteError(error);
    return false;
  }
}

function pruneStaleCaches(indexItems) {
  try {
    if (sessionStorage.getItem(DB_KEYS.session) === "1") return;
    const ids = new Set((indexItems || []).map(rid).filter(Boolean));
    LS.keys().forEach(function (k) {
      if (k && (k.indexOf("ws_products_category_") === 0 || k.indexOf("ws_products_filter_") === 0)) LS.remove(k);
    });
    _wholeProducts = null;
    Object.keys(_matchCache).forEach(function (k) { delete _matchCache[k]; });
    const cur = Store.getProducts();
    const kept = cur.filter(function (p) { return p && ids.has(String(p.id || p.objectID || "")); });
    if (kept.length !== cur.length) writeProductsLocal(kept);
    LS.set(DB_KEYS.productsCount, String(ids.size));
  } catch (e) { console.error("pruneStaleCaches error:", e); }
}

const Store = {
  getProductsCount() {
    const metaCount = LS.get(DB_KEYS.productsCount);
    if (metaCount !== null && metaCount !== undefined) {
      const parsed = parseInt(metaCount, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const currentProducts = this.getProducts();
    if (currentProducts && currentProducts.length > 0) {
      LS.set(DB_KEYS.productsCount, String(currentProducts.length));
      return currentProducts.length;
    }
    return 0;
  },

  isProductsCountStale() {
    const t = Number(LS.get("ws_products_count_time") || 0);
    return !t || (Date.now() - t) >= META_CACHE_MS || !Number(LS.get(DB_KEYS.productsCount));
  },

  async fetchRemoteProductsCount() {
    if (!firebaseEnabled) return this.getProductsCount();
    try {
      const shallowKeys = await restGet(DB_KEYS.products, "?shallow=true", 5000);
      if (shallowKeys && typeof shallowKeys === "object") {
        const count = Object.keys(shallowKeys).length;
        LS.set(DB_KEYS.productsCount, String(count));
        LS.set("ws_products_count_time", String(Date.now()));
        return count;
      }
      if (shallowKeys === null) {
        LS.set(DB_KEYS.productsCount, "0");
        LS.set("ws_products_count_time", String(Date.now()));
        return 0;
      }
    } catch (e) {}
    return this.getProductsCount();
  },

  getIndexItems() {
    if (_indexMem) return _indexMem;
    // احتياطي متزامن قبل اكتمال قراءة IndexedDB: نسخة localStorage القديمة أو الاحتياطية إن وُجدت
    const raw = LS.get(IDX_ITEMS);
    if (raw) {
      const parsed = parseJSON(raw, null);
      if (Array.isArray(parsed) && parsed.length) { setIndexRaw(indexMapFromList(parsed)); return _indexMem; }
    }
    const prods = this.getProducts();
    if (prods && prods.length) return sortHydrated(prods.map(buildIndexRecord).filter(Boolean).map(hydrateIndexRecord).filter(Boolean));
    return [];
  },
  getMiniIndex() { return this.getIndexItems(); },

  hasIndexLocal() { return !!(_indexMem || LS.get(IDX_ITEMS)); },

  // يُحمَّل الفهرس المحلي من IndexedDB (مرة واحدة) — يُنتظر قبل أي قراءة تعتمد عليه
  indexReady() { return loadIndexLocal(); },

  async ensureIndexFresh(force, opts) {
    if (!firebaseEnabled) return;
    const skipThrottle = !!(opts && opts.skipThrottle);
    return dedupe("indexFresh", async () => {
      await loadIndexLocal();
      const now = Date.now();
      const lastCheck = Number(LS.get(IDX_CHECKED) || 0);

      // الكاش موجود وفحصنا خلال فترة التهدئة (5 دقائق): لا طلبات إطلاقاً
      if (!force && !skipThrottle && this.hasIndexLocal() && (now - lastCheck) < INDEX_CHECK_MS) return;

      let remoteV;
      try { remoteV = await restGet(DB_KEYS.index + "/v", "", 8000); }
      catch (e) { if (this.hasIndexLocal()) return; throw e; }

      if (remoteV === null || remoteV === undefined) {
        // لا فهرس على الخادم بعد: نعمل مؤقتاً من المنتجات الكاملة بدل أن ينكسر المتجر
        await this.ensureAllProductsFresh();
        setIndexRaw(indexMapFromList(this.getProducts().map(buildIndexRecord)));
        return;
      }

      // النسخة مطابقة: نحدّث وقت الفحص ونخرج (≈ 8 بايت فقط)
      if (!force && this.hasIndexLocal() && String(LS.get(IDX_V)) === String(remoteV)) {
        LS.set(IDX_CHECKED, String(now));
        return;
      }

      // مزامنة تفاضلية: نجلب السجلات المتغيّرة فقط (u ≥ آخر ما وصلنا إليه) بدل تنزيل الفهرس كاملاً.
      // تتطلب .indexOn: ["u"] تحت ws_index/items؛ وإن غابت (400) أو تغيّرت "الحقبة" e نعود للتنزيل الكامل.
      const localU = Number(LS.get(IDX_U) || 0);
      let remoteE = null;
      if (!force && this.hasIndexLocal() && localU > 0) {
        try {
          remoteE = await restGet(DB_KEYS.index + "/e", "", 8000);
          if (String(remoteE == null ? 0 : remoteE) === String(LS.get(IDX_E) || 0)) {
            const part = await restGet(DB_KEYS.index + "/items", "?orderBy=" + encodeURIComponent('"u"') + "&startAt=" + localU, 30000);
            applyIndexDelta(part, remoteV, localU, remoteE);
            pruneStaleCaches(Array.from(_idxRaw.values()));
            emitStoreEvent("store:synced");
            return;
          }
        } catch (e) {
          if (!e || e.status !== 400) return;   // خطأ شبكة: نبقى على النسخة المحلية ونعيد المحاولة لاحقاً
        }
      }

      // تنزيل كامل (أول زيارة / فهرس قديم / تغيّر الحقبة)
      const items = await restGet(DB_KEYS.index + "/items", "", 30000);
      const list = indexListFromRemote(items);
      const maxU = maxIndexU(list);
      if (remoteE === null && maxU > 0) { try { remoteE = await restGet(DB_KEYS.index + "/e", "", 8000); } catch (e) { remoteE = null; } }
      await storeIndexLocal(list, { v: remoteV, u: maxU, e: remoteE == null ? 0 : remoteE });
      pruneStaleCaches(list);
      emitStoreEvent("store:synced");
    });
  },

  // الأدمن: بناء الفهرس كاملاً على الخادم (بالشكل الجديد). force=true يُعيد بناءه ويُسقط القبور ويرفع الحقبة
  async rebuildIndex(force) {
    if (!firebaseEnabled || !database) return false;
    if (!force) {
      try {
        const v = await restGet(DB_KEYS.index + "/v", "", 8000);
        if (v !== null && v !== undefined) return true;
      } catch (e) { return false; }
    }
    try {
      // البناء الكامل يحتاج كل المنتجات (مرة واحدة: أول إنشاء أو صيانة يدوية)
      if (!this.canWriteProducts()) await this.ensureAllProductsFresh();
      if (!this.canWriteProducts()) return false;
      await writeFullIndex(this.getProducts());
      return true;
    } catch (e) { console.error("rebuildIndex error:", e); return false; }
  },

  // الأدمن: هل ما زالت بنية ws_products القديمة (مصفوفة)؟ سيُرحَّل تلقائياً عند أول حفظ
  needsKeyedMigration() { return _productsStructure === "legacy"; },

  getCategories() {
    return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.categories), []));
  },
  saveCategories(list) {
    LS.set(DB_KEYS.categories, JSON.stringify(list));
    syncNodeToFirebase(DB_KEYS.categories, list);
  },
  addCategory(cat) {
    const list = this.getCategories();
    list.push(Object.assign({ id: uid("cat"), icon: "box" }, cat));
    this.saveCategories(list);
  },
  updateCategory(id, patch) {
    const list = this.getCategories().map(c => c.id === id ? Object.assign({}, c, patch) : c);
    this.saveCategories(list);
  },
  deleteCategory(id) { this.saveCategories(this.getCategories().filter(c => c.id !== id)); },
  getCategoryName(id) {
    const raw = LS.get(DB_KEYS.categories);
    if (!this._catMap || this._catMapRaw !== raw) {
      const map = {};
      firebaseValueToArray(parseJSON(raw, [])).forEach(function (c) { if (c && c.id) map[c.id] = c.name; });
      this._catMap = map;
      this._catMapRaw = raw;
    }
    return this._catMap[id] || "";
  },

  getProducts() {
    let prods = [];
    if (_productsMem) prods = firebaseValueToArray(_productsMem);
    else prods = firebaseValueToArray(parseJSON(LS.get(DB_KEYS.products), []));

    return prods.map(p => {
      if (!p) return p;
      const realId = String(p.id || p.objectID || "");
      if (!p.id || !p.objectID) {
        return Object.assign({}, p, { id: realId, objectID: realId });
      }
      return p;
    });
  },

  // saveProducts(list) الجماعية تتطلب الكتالوج كاملاً (لاكتشاف المحذوف)؛ أما كتابة منتج واحد فيكفيها فهرس الأدمن
  canWriteProducts() { return !firebaseEnabled || _productsFullyLoaded; },
  canWriteNode() { return !firebaseEnabled || _productsFullyLoaded || _catalogReady; },

  /* وضع الأدمن الخفيف: بدل تحميل كل ws_products (10–20MB لكل جلسة عند 10,000 منتج) نحمّل الفهرس الخفيف فقط
     (تفاضلياً بعد أول مرة)، والمنتج الكامل يُجلب عند فتح تعديله. الاستيراد يطلب الكتالوج كاملاً عند الحاجة. */
  async loadAdminCatalog() {
    if (!firebaseEnabled) { _catalogReady = true; return true; }
    try {
      await detectProductsStructure();
      await this.ensureIndexFresh(false, { skipThrottle: true });
      _catalogReady = this.hasIndexLocal() || _productsFullyLoaded;
    } catch (e) { console.warn("loadAdminCatalog: الفهرس غير متاح، تحميل كل المنتجات (الوضع القديم):", e); _catalogReady = false; }
    if (!_catalogReady) { await this.loadAllProductsFromFirebase(true); _catalogReady = _productsFullyLoaded; }
    return _catalogReady;
  },
  // قائمة جدول الأدمن/الإحصاءات: المنتجات الكاملة إن حُمّلت كلها، وإلا سجلات الفهرس الخفيفة (نفس الحقول المعروضة)
  getAdminProducts() { return (!firebaseEnabled || _productsFullyLoaded) ? this.getProducts() : this.getIndexItems(); },
  getAdminProduct(id) {
    const full = this.getProduct(id);
    if (full) return full;
    const t = String(id).trim();
    return (_idxHyd && _idxHyd.get(t)) || (this.getIndexItems().find(function (p) { return p && p.id === t; })) || null;
  },
  // منتج كامل طازج من الخادم (عقدة واحدة) قبل التعديل؛ بلا Firebase يُرجع النسخة المحلية
  async loadProductFresh(id) {
    if (!firebaseEnabled) return this.getProduct(id);
    return this.loadProductById(id, true);
  },

  whenProductsSaved() { return _lastProductsWrite; },

  getLastWriteError() { return _lastWriteError; },

  _rejectWrite() {
    console.error("تم رفض حفظ المنتجات: لم يجهز فهرس/كتالوج المنتجات من Firebase في هذه الجلسة.");
    _lastWriteError = { kind: "NOT_READY", message: "لم يجهز الفهرس/الكتالوج" };
    _lastProductsWrite = Promise.resolve(false);
    return _lastProductsWrite;
  },

  // حفظ قائمة كاملة (استيراد/عمليات جماعية): نقارن بالنسخة المحلية ونكتب المنتجات المتغيّرة/المضافة/المحذوفة فقط
  saveProducts(list) {
    if (!this.canWriteProducts()) return this._rejectWrite();
    const now = Date.now();
    const normalized = [];
    (list || []).forEach(function (p, i) {
      if (!p) return;
      const realId = safeKey(p.id || p.objectID || uid("prd"));
      let np = Object.assign({}, p, { id: realId, objectID: realId });
      if (!_syncedHash.has(realId) && !np.createdAt) np.createdAt = now - i;   // الجديد: ترتيب القائمة = الأحدث أولاً
      np = stampCreatedAt(np);
      normalized.push(np);
    });
    const upsert = [], seen = new Set();
    normalized.forEach(function (p) { seen.add(p.id); if (_syncedHash.get(p.id) !== productHash(p)) upsert.push(p); });
    const removed = [];
    _syncedHash.forEach(function (_, id) { if (!seen.has(id)) removed.push(id); });

    writeProductsLocal(normalized, true);
    applyLocalIndexChange(upsert, removed, normalized);
    _lastProductsWrite = afterCommit(commitProductNodes(upsert, removed), upsert, removed);
    return _lastProductsWrite;
  },

  getProduct(id) { 
    if (id === null || id === undefined) return null;
    const targetId = String(id).trim();
    return this.getProducts().find(p => p && String(p.id || p.objectID).trim() === targetId) || null; 
  },

  // تعديل منتج واحد: يكتب عقدته وسجل فهرسه فقط (لا إعادة رفع الكتالوج).
  // في وضع الأدمن الخفيف إن لم يكن المنتج في الكاش المحلي نجلبه طازجاً من الخادم أولاً.
  updateProduct(id, patch) {
    if (id === null || id === undefined) return;
    if (!this.canWriteNode()) return this._rejectWrite();
    const targetId = String(id).trim();
    if (firebaseEnabled && !_productsFullyLoaded && !this.getProduct(targetId)) {
      _lastProductsWrite = this.loadProductFresh(targetId).then(function (p) { return p ? Store._applyProductUpdate(targetId, patch) : false; });
      return _lastProductsWrite;
    }
    return this._applyProductUpdate(targetId, patch);
  },

  _applyProductUpdate(targetId, patch) {
    let updated = null;
    const list = this.getProducts().map(p => {
      if (!p) return p;
      if (String(p.id || p.objectID).trim() === targetId) {
        updated = stampCreatedAt(Object.assign({}, p, patch, { id: targetId, objectID: targetId }));
        return updated;
      }
      return p;
    });
    if (!updated) { _lastProductsWrite = Promise.resolve(false); return _lastProductsWrite; }
    writeProductsLocal(list, !firebaseEnabled || _productsFullyLoaded);
    applyLocalIndexChange([updated], []);
    _lastProductsWrite = afterCommit(commitProductNodes([updated], []), [updated], []);
    return _lastProductsWrite;
  },

  // حذف منتج واحد: يحذف عقدته ويكتب قبراً في الفهرس (يحذفه الزوار تلقائياً)
  deleteProduct(id) {
    if (id === null || id === undefined) return Promise.resolve(false);
    if (!this.canWriteNode()) return this._rejectWrite();
    const targetId = String(id).trim();
    const list = this.getProducts().filter(p => p && String(p.id || p.objectID).trim() !== targetId);
    writeProductsLocal(list, !firebaseEnabled || _productsFullyLoaded);
    applyLocalIndexChange([], [targetId]);
    _lastProductsWrite = afterCommit(commitProductNodes([], [targetId]), [], [targetId]);
    return _lastProductsWrite;
  },

  _removeFromLocalCache(id) {
    const targetId = String(id).trim();
    writeProductsLocal(this.getProducts().filter(p => p && String(p.id || p.objectID).trim() !== targetId));
  },

  getFieldCache(name) {
    return firebaseValueToArray(parseJSON(LS.get("ws_products_filter_" + name), []));
  },
  setFieldCache(name, list) {
    LS.set("ws_products_filter_" + name, JSON.stringify(list || []));
  },

  async loadProductsByField(field, value, cacheName, forceRefresh) {
    const cacheKey = "ws_products_filter_" + cacheName;
    const cacheTimeKey = cacheKey + "_time";
    const now = Date.now();
    const cached = this.getFieldCache(cacheName);
    const cachedAt = Number(LS.get(cacheTimeKey) || 0);

    if (!forceRefresh && cached.length > 0) {
      if (now - cachedAt < 30000 || !firebaseEnabled) return cached;
    }
    if (!firebaseEnabled) return this.getProducts().filter(function (p) { return p[field] === value; });

    const products = await fetchProductsByFieldFromFirebase(field, value);
    this.setFieldCache(cacheName, products);
    LS.set(cacheTimeKey, String(now));
    this._cacheLoadedProducts(products);
    return products;
  },

  async loadProductsPageByCategory(categoryId, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!categoryId || categoryId === "all") return { products: [], nextCursor: null, done: true };
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function (p) { return p.categoryId === categoryId; });
      return this._localPage(all, pageSize, cursorKey);
    }
    const result = await fetchProductsPageByCategoryFromFirebase(categoryId, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPageByCategories(ids, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return { products: [], nextCursor: null, done: true };
    if (ids.length === 1) return this.loadProductsPageByCategory(ids[0], pageSize, cursorKey);
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function (p) { return ids.indexOf(p.categoryId) !== -1; });
      return this._localPage(all, pageSize, cursorKey);
    }
    const result = await fetchProductsPageByCategoriesFromFirebase(ids, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPageByField(field, value, pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!firebaseEnabled) {
      const all = this.getProducts().filter(function (p) { return p[field] === value; });
      return this._localPage(all, pageSize, cursorKey);
    }
    const result = await fetchProductsPageByFieldFromFirebase(field, value, pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  async loadProductsPage(pageSize, cursorKey) {
    pageSize = Number(pageSize) || 20;
    if (!firebaseEnabled) return this._localPage(this.getProducts(), pageSize, cursorKey);
    const result = await fetchProductsPageFromFirebase(pageSize, cursorKey);
    this._cacheLoadedProducts(result.products);
    return result;
  },

  _localPage(all, pageSize, cursorKey) {
    const start = cursorKey ? Math.max(0, all.findIndex(function (p) { return String(p.id || p.objectID) === String(cursorKey); }) + 1) : 0;
    const products = all.slice(start, start + pageSize);
    const done = start + products.length >= all.length;
    const last = products.length ? (products[products.length - 1].id || products[products.length - 1].objectID) : null;
    return { products: products, nextCursor: done || !products.length ? null : last, done: done };
  },

  _cacheLoadedProducts(newProducts) {
    if (!newProducts || !newProducts.length) return;
    const byId = new Map();
    this.getProducts().forEach(p => { 
      if (p) {
        const idKey = String(p.id || p.objectID || "");
        if (idKey) byId.set(idKey, p);
      }
    });
    newProducts.forEach(p => {
      if (p) {
        const idKey = String(p.id || p.objectID || "");
        if (idKey) { byId.delete(idKey); byId.set(idKey, p); }
      }
    });
    let list = Array.from(byId.values());
    let isAdmin = false;
    try { isAdmin = sessionStorage.getItem(DB_KEYS.session) === "1"; } catch (e) { /* ignore */ }
    const limit = isAdmin ? ADMIN_PRODUCT_CACHE_LIMIT : PRODUCT_CACHE_LIMIT;
    if (list.length > limit) {
      list = list.slice(-limit);
      LS.remove("ws_products_all_time");
    }
    writeProductsLocal(list);
  },

  async loadProductsByCategory(categoryId, forceRefresh) {
    if (!categoryId || categoryId === "all") return this.getProducts();
    const cacheKey = "ws_products_category_" + categoryId;
    const cacheTimeKey = cacheKey + "_time";
    const now = Date.now();
    const cached = firebaseValueToArray(parseJSON(LS.get(cacheKey), []));
    const cachedAt = Number(LS.get(cacheTimeKey) || 0);

    if (!forceRefresh && cached.length > 0) {
      if (now - cachedAt < 30000 || !firebaseEnabled) return cached;
    }
    if (!firebaseEnabled) return this.getProducts().filter(function (p) { return p.categoryId === categoryId; });

    const products = await fetchProductsByFieldFromFirebase("categoryId", categoryId);
    LS.set(cacheKey, JSON.stringify(products));
    LS.set(cacheTimeKey, String(now));
    this._cacheLoadedProducts(products);
    return products;
  },

  async loadProductById(id, forceRefresh) {
    if (!id) return null;
    const targetId = String(id).trim();
    if (forceRefresh) _wholeProducts = null;
    const local = this.getProduct(targetId);
    if (local && !forceRefresh) return local;
    let fetched = null;
    try {
      fetched = await dedupe("prod:" + targetId, function () { return fetchProductByIdFromFirebase(targetId); });
    } catch (error) {
      console.error("Firebase product fetch error:", error);
      return local || null;
    }
    if (!fetched) {
      if (local && forceRefresh) this._removeFromLocalCache(targetId);
      return null;
    }
    this._cacheLoadedProducts([fetched]);
    return fetched;
  },

  async loadAllProductsFromFirebase(forceRefresh) {
    if (!firebaseEnabled) return this.getProducts();
    let products;
    try { products = await fetchAllProductsFromFirebase(); }
    catch (error) { console.error("Firebase all-products fetch error:", error); return this.getProducts(); }
    if (products === null) return this.getProducts();
    const normalized = products.map(function (p) {
      const realId = String(p.id || p.objectID || "");
      return Object.assign({}, p, { id: realId, objectID: realId });
    });
    if (normalized.some(function (p) { return p.createdAt; })) {
      normalized.sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
    }
    resetSyncedHashes(normalized);
    writeProductsLocal(normalized, true);
    LS.set("ws_products_all_time", String(Date.now()));
    _productsFullyLoaded = true;
    return normalized;
  },

  async ensureAllProductsFresh() {
    if (!firebaseEnabled) return;
    await dedupe("allProducts", () => this.loadAllProductsFromFirebase(true));
  },

  addProduct(prod) {
    const list = this.getProducts();
    const generatedId = uid("prd");
    const item = Object.assign({
      id: generatedId,
      objectID: generatedId,
      barcode: "",
      sku: "",
      description: "",
      images: [],
      stock: 0,
      available: true,
      featured: false,
      isNew: false,
      isOffer: false,
      oldPrice: 0,
      image: null,
      variants: [],
      variantImages: {},
      colors: [],
      sizes: [],
      inventory: {}
    }, prod);

    if (!item.id) item.id = generatedId;
    item.id = safeKey(item.id);
    item.objectID = item.id;
    if (!item.createdAt) item.createdAt = Date.now();   // الترتيب: الأحدث أولاً

    if (!this.canWriteNode()) { this._rejectWrite(); return item; }
    list.unshift(item);
    writeProductsLocal(list, !firebaseEnabled || _productsFullyLoaded);
    applyLocalIndexChange([item], []);
    _lastProductsWrite = afterCommit(commitProductNodes([item], []), [item], []);
    return item;
  },

  hasVariantMatrix(product) {
    return !!(product && ((product.colors && product.colors.length) || (product.sizes && product.sizes.length)));
  },
  getTotalStock(product) {
    if (!product) return 0;
    return this.hasVariantMatrix(product) ? sumInventory(product.inventory) : (Number(product.stock) || 0);
  },
  getVariantStock(product, color, size) {
    if (!product) return 0;
    if (!this.hasVariantMatrix(product)) return Number(product.stock) || 0;
    const key = inventoryKey(color, size);
    return Number((product.inventory || {})[key]) || 0;
  },
  isProductAvailable(product) {
    if (!product || product.available === false) return false;
    if (this.hasVariantMatrix(product) && product.inventory) return sumInventory(product.inventory) > 0;
    return (Number(product.stock) || 0) > 0;
  },

  // الإعدادات = قيم config.js الافتراضية، تتغلب عليها أي قيمة غير فارغة محفوظة من لوحة التحكم
  getSettings() {
    const c = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG) || {};
    const defaults = {
      storeName: c.storeName, storeTagline: c.storeTagline, storeDescription: c.storeDescription,
      whatsapp: c.whatsappNumber, phone: c.phone, phone2: c.phone2,
      instagram: c.instagram, tiktok: c.tiktok, address: c.address, mapUrl: c.mapUrl,
      workingHours: c.workingHours, deliveryInfo: c.deliveryInfo, currencySymbol: c.currencySymbol
    };
    const out = {};
    Object.keys(defaults).forEach(function (k) { if (defaults[k] != null && String(defaults[k]).trim() !== "") out[k] = defaults[k]; });
    const stored = memoParse(DB_KEYS.settings, {}) || {};
    Object.keys(stored).forEach(function (k) {
      const v = stored[k];
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) { if (!(k in out)) out[k] = v; return; }
      out[k] = v;
    });
    return out;
  },
  saveSettings(patch) {
    const updated = Object.assign({}, memoParse(DB_KEYS.settings, {}), patch);
    LS.set(DB_KEYS.settings, JSON.stringify(updated));
    syncNodeToFirebase(DB_KEYS.settings, updated);
  },

  getAds() { return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.ads), [])); },
  saveAds(list) {
    LS.set(DB_KEYS.ads, JSON.stringify(list));
    syncNodeToFirebase(DB_KEYS.ads, list);
  },
  addAd(adData) {
    const list = this.getAds();
    list.push(Object.assign({ id: uid("ad") }, adData));
    this.saveAds(list);
  },
  deleteAd(id) { this.saveAds(this.getAds().filter(a => a.id !== id)); },

  getCart() {
    const cart = parseJSON(LS.get(DB_KEYS.cart), []);
    return Array.isArray(cart) ? cart.filter(function (l) { return l && l.itemKey && Number(l.qty) > 0; }) : [];
  },
  saveCart(cart) {
    LS.set(DB_KEYS.cart, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent("cart:updated"));
  },
  addToCart(itemKey, qty, meta) {
    meta = meta || {};
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    const cart = this.getCart();
    const productId = String(itemKey).split("|")[0];
    const product = this.getProduct(productId);
    const knownStock = product ? this.getVariantStock(product, meta.color, meta.size) : null;
    if (product && (knownStock <= 0 || product.available === false)) return { capped: true, blocked: true };
    const max = product ? Math.max(1, knownStock) : 99;
    let capped = false;

    const line = cart.find(l => l.itemKey === itemKey);
    if (line) {
      const next = line.qty + qty;
      if (next > max) { line.qty = max; capped = true; } else line.qty = next;
    } else {
      const q = Math.min(qty, max);
      if (q < qty) capped = true;
      cart.push({
        itemKey: itemKey,
        productId: productId,
        qty: q,
        color: meta.color || null,
        size: meta.size || null,
        variant: meta.variant || null
      });
    }
    this.saveCart(cart);
    return { capped: capped };
  },
  setQty(itemKey, qty) {
    let cart = this.getCart();
    if (qty <= 0) cart = cart.filter(l => l.itemKey !== itemKey);
    else cart.forEach(l => { if (l.itemKey === itemKey) l.qty = qty; });
    this.saveCart(cart);
  },
  removeFromCart(itemKey) { this.saveCart(this.getCart().filter(l => l.itemKey !== itemKey)); },
  clearCart() { this.saveCart([]); },
  cartCount() { return this.getCart().reduce((sum, l) => sum + l.qty, 0); },

  getOrders() { return firebaseValueToArray(parseJSON(LS.get(DB_KEYS.orders), [])); },

  async loadOrdersFromFirebase(limitCount = 300) {
    if (!firebaseEnabled || !database) return this.getOrders();
    try {
      const snapshot = await database.ref(DB_KEYS.orders).orderByKey().limitToLast(limitCount).once("value");
      if (snapshot.exists()) {
        const ordersList = firebaseValueToArray(snapshot.val());
        ordersList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        LS.set(DB_KEYS.orders, JSON.stringify(ordersList));
        return ordersList;
      }
    } catch (e) {
      console.error("Firebase Orders Fetch Error:", e);
    }
    return this.getOrders();
  },

  logOrder(order) {
    const list = this.getOrders();
    const newOrder = Object.assign({ id: uid("ord"), date: new Date().toISOString() }, order);
    list.unshift(newOrder);
    LS.set(DB_KEYS.orders, JSON.stringify(list.slice(0, 200)));
    if (!firebaseEnabled) return;

    if (database) {
      database.ref(DB_KEYS.orders).push(newOrder).catch(error => {
        console.error("Firebase Log Order Error:", error);
      });
    } else {
      postOrderRest(newOrder).catch(function () { queuePendingOrder(newOrder); });
    }
  },

  async login(email, password) {
    if (!firebaseAuth) throw new Error("Firebase Authentication غير مهيأ.");
    const result = await firebaseAuth.signInWithEmailAndPassword(email.trim(), password);
    const allowed = Array.isArray(STORE_CONFIG.adminEmails) && STORE_CONFIG.adminEmails.length > 0
      ? STORE_CONFIG.adminEmails.map(e => String(e).trim().toLowerCase()).includes((result.user.email || "").toLowerCase())
      : false;
    if (!allowed) {
      await firebaseAuth.signOut();
      throw new Error("هذا الحساب ليس ضمن حسابات الأدمن المسموح بها.");
    }
    sessionStorage.setItem(DB_KEYS.session, "1");
    return result.user;
  },
  isLoggedIn() { return !!(firebaseAuth && firebaseAuth.currentUser); },
  logout() {
    sessionStorage.removeItem(DB_KEYS.session);
    return firebaseAuth ? firebaseAuth.signOut() : Promise.resolve();
  }
};

function postOrderRest(order) {
  return fetch(DB_URL + "/" + DB_KEYS.orders + ".json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
    keepalive: true
  }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
  });
}

function queuePendingOrder(order) {
  const q = parseJSON(LS.get("ws_pending_orders"), []);
  q.push(order);
  LS.set("ws_pending_orders", JSON.stringify(q.slice(-20)));
}

function flushPendingOrders() {
  if (!firebaseEnabled || database) return;
  const q = parseJSON(LS.get("ws_pending_orders"), []);
  if (!Array.isArray(q) || !q.length) return;
  LS.remove("ws_pending_orders");
  q.forEach(function (o) { postOrderRest(o).catch(function () { queuePendingOrder(o); }); });
}
window.addEventListener("load", function () { setTimeout(flushPendingOrders, 3000); });

(function () {
  let busy = false;
  function recheck() {
    if (!firebaseEnabled || busy || typeof Store === "undefined") return;
    busy = true;
    Promise.all([
      Store.ensureIndexFresh().catch(function () {}),
      pullFromFirebase().catch(function () {})
    ]).then(function () { busy = false; }, function () { busy = false; });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) recheck(); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) recheck(); });
  window.addEventListener("online", recheck);
  setInterval(function () { if (!document.hidden) recheck(); }, Math.min(INDEX_CHECK_MS, META_PULL_MS));
})();

// ابدأ قراءة الفهرس المحلي من IndexedDB فوراً (بالتوازي مع تحميل الصفحة)
loadIndexLocal();
