/* ==========================================================================
   admin.js
   منطق لوحة تحكم الأدمن بالكامل (admin.html). 
   تم التحديث: 
   1) توحيد شاشة المعاينة التفاعلية (إكسل، فواتير ورقية، مسح الرفوف).
   2) دمج أدوات الإدخال إلى: "رفع صورة" (كاميرا أو معرض) و"رفع ملف" (PDF أو إكسل).
   3) معالجة الألوان بدقة عالية واستبعاد الأوصاف الشفافة والمائية تلقائياً.
   4) إرسال ملفات الإكسل مباشرة للذكاء الاصطناعي دون قيود على مسميات الأعمدة.
   5) مطابقة الاسم التجاري الأساسي وإضافة الكميات الجديدة للرصيد الحالي تلقائياً (+).
   6) المطابقة والإنشاء السريع للأقسام المفقودة في المعاينة (Auto-Category Match & Create).
   7) شاشة انتظار محايدة ومتوافقة كلياً مع نظام التصميم ومتغيرات الثيمات (CSS Variables).
   ========================================================================== */

let editingProductId = null;
let editingCategoryId = null;
let editingAdId = null; 
let pendingProductImage = null; 
let pendingCategoryImage = null; 
let pendingAdImage = null; 
let pendingColors = [];        // [{ name, hex, image }]
let pendingSizes = [];         // ["S", "M", ...]
let pendingInventory = {};     // { "لون||مقاس": qty }

// جدول الألوان الشامل ودرجاتها الدقيقة
const COLOR_PALETTE = [
  { match: ["سماوي", "ازرق فاتح", "أزرق فاتح", "sky", "cyan", "baby blue"], hex: "#38bdf8" },
  { match: ["كحلي", "ازرق داكن", "أزرق داكن", "نيلي", "navy"], hex: "#1e3a8a" },
  { match: ["أزرق", "ازرق", "blue"], hex: "#2563eb" },
  { match: ["أحمر", "احمر", "red", "عنابي", "ماروني", "خمري"], hex: "#ef4444" },
  { match: ["وردي", "زهري", "بينك", "pink", "فوشي", "فوشيا"], hex: "#ec4899" },
  { match: ["بنفسجي", "موف", "ارجواني", "أرجواني", "purple", "violet", "لافندر"], hex: "#8b5cf6" },
  { match: ["أخضر فاتح", "اخضر فاتح", "ليموني", "فسفوري", "lime"], hex: "#84cc16" },
  { match: ["زيتي", "زيتوني", "olive"], hex: "#65a30d" },
  { match: ["أخضر", "اخضر", "green"], hex: "#16a34a" },
  { match: ["أصفر", "اصفر", "yellow"], hex: "#eab308" },
  { match: ["برتقالي", "مشمشي", "orange", "اورنج"], hex: "#f97316" },
  { match: ["بيج", "كريمي", "سكري", "اوف وايت", "beige", "offwhite", "off-white"], hex: "#f5f5dc" },
  { match: ["بني", "جوزي", "قهوائي", "شوكولاته", "brown"], hex: "#78350f" },
  { match: ["عسلي", "كراميل", "خردلي"], hex: "#b45309" },
  { match: ["رمادي", "رصاصي", "سيلفر", "فضي", "gray", "grey", "silver"], hex: "#94a3b8" },
  { match: ["ذهبي", "gold"], hex: "#d97706" },
  { match: ["أسود", "اسود", "black"], hex: "#0f172a" },
  { match: ["أبيض", "ابيض", "white"], hex: "#ffffff" }
];

// فحص واستبعاد الأوصاف الشفافة أو الفيزيائية
function isTransparentOrInvalidColor(name) {
  if (!name) return true;
  const clean = name.trim().toLowerCase();
  const transparentTokens = ["شفاف", "شفافة", "شفافه", "مائي", "مائيه", "مائية", "عديم اللون", "عديمة اللون", "clear", "transparent", "سائل", "جيل", "جل"];
  const words = clean.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length > 0 && words.every(w => transparentTokens.includes(w))) {
    return true;
  }
  return false;
}

// تنقية اسم اللون من الأوصاف الهامشية (مثل: "أزرق فاتح مائي شفاف" -> "أزرق فاتح")
// Firebase يرفض أي مفتاح يحوي . $ # [ ] / — واسم اللون/المقاس يصير مفتاحاً داخل inventory («لون||مقاس») فيفشل حفظ **الدفعة كلها**.
// نستبدل الرمز بما يشبهه (النقطة العشرية ← «٫»، والباقي ← «-») في مصدر واحد تستعمله كل المسارات.
function safeVariantName(v) {
  return String(v == null ? "" : v)
    .replace(/\./g, "٫").replace(/[$#\[\]\/|]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ").trim();
}

// سبب فشل حفظ المنتجات بنص عربي مفهوم (من Store.getLastWriteError)
function writeFailureMessage(prefix) {
  const e = (typeof Store !== "undefined" && Store.getLastWriteError) ? Store.getLastWriteError() : null;
  const reasons = {
    PERMISSION: "رفض Firebase الكتابة (PERMISSION_DENIED): تأكد أنك مسجّل بحساب الأدمن وأن قواعد Firebase تحوي UID حسابك بدل ADMIN_UID (Firebase ← Realtime Database ← Rules).",
    KEY: "اسم لون أو مقاس يحوي رمزاً غير مسموح في Firebase (. $ # [ ] /). عدّل الاسم وأعد المحاولة.",
    NETWORK: "انقطع الاتصال بـ Firebase. تحقق من الإنترنت وأعد المحاولة.",
    NOT_READY: "لم يكتمل تحميل المنتجات من الخادم. حدّث الصفحة ثم أعد المحاولة.",
    STRUCTURE: "تعذّر التحقق من بنية المنتجات على الخادم. حدّث الصفحة وأعد المحاولة."
  };
  const why = e ? (reasons[e.kind] || ("السبب: " + e.message)) : "حدّث الصفحة وأعد المحاولة.";
  return prefix + " " + why;
}

function cleanColorName(colorName) {
  if (!colorName) return "";
  // ⚠️ \b في JavaScript يعمل مع الحروف اللاتينية فقط فلا يطابق الكلمات العربية؛ لذلك نستعمل حدوداً صريحة (مسافة/فاصل/بداية/نهاية).
  let cleaned = (" " + colorName + " ")
    .replace(/(?<=[\s\-_/،,])(عديم اللون|عديمة اللون|شفافة|شفافه|شفاف|مائية|مائيه|مائي|clear|transparent)(?=[\s\-_/،,])/gi, " ")
    .replace(/[\s\-_/]+/g, " ")
    .trim();
  return safeVariantName(cleaned || colorName.trim());
}

// كلمة لاتينية تُطابق ككلمة كاملة (حتى لا تُطابق red داخل Colored أو lime داخل Sublime)؛ العربية بالاحتواء.
function colorKeywordMatches(clean, keyword) {
  const k = String(keyword).toLowerCase();
  if (/^[a-z][a-z \-]*$/.test(k)) return new RegExp("(^|[^a-z])" + k.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "($|[^a-z])").test(clean);
  return clean.includes(k);
}

// دالة فحص اللون واستخراج الدرجة المناسبة بدقة
// الترتيب: كود صريح ← قاموس الأسماء (إنجليزي/عربي/تسويقي: Obsidian، Porcelain، Titanium Gray…) ← جدول COLOR_PALETTE ← رمادي محايد.
// (القديم كان يرجع الأزرق لأي اسم غير معروف فتظهر كل الألوان زرقاء في المتجر.)
function getColorHex(colorName) {
  if (!colorName) return "#9ca3af";
  const ai = (typeof window !== "undefined") ? window.StoreAI : null;
  const asCode = (ai && ai.parseHexColor) ? ai.parseHexColor(colorName) : null;
  if (asCode) return asCode;
  const byName = (ai && ai.colorHexFromName) ? ai.colorHexFromName(colorName) : "";
  if (byName) return byName.toLowerCase();
  const clean = colorName.trim().toLowerCase();

  for (const item of COLOR_PALETTE) {
    if (item.match.some(keyword => colorKeywordMatches(clean, keyword))) {
      return item.hex;
    }
  }

  return "#9ca3af"; // لون غير معروف: رمادي محايد (وليس أزرق مضلِّلاً) — يعدّله المدير من منتقي اللون
}

// ألوان مخزَّنة باسم كود (E07A5F) من استيراد سابق/إدخال يدوي: تتحول لاسم عربي ودرجتها الفعلية، وتُعاد تسمية مفاتيح المخزون معها
function repairHexColorNames(colors, inventory) {
  const ai = (typeof window !== "undefined") ? window.StoreAI : null;
  const inv = Object.assign({}, inventory || {});
  if (!ai || !ai.splitColorEntry) return { colors: colors, inventory: inv };
  const used = new Set((colors || []).map(c => String((c && c.name) || "").toLowerCase()));
  const out = (colors || []).map(c => {
    const e = c && c.name ? ai.splitColorEntry(c.name) : null;
    if (!e) return c;
    let name = e.name, n = 2;
    while (used.has(name.toLowerCase())) name = e.name + " " + (n++);
    used.add(name.toLowerCase());
    Object.keys(inv).forEach(k => { if (k.indexOf(c.name + "||") === 0) { inv[name + "||" + k.slice(c.name.length + 2)] = inv[k]; delete inv[k]; } });
    return Object.assign({}, c, { name: name, hex: e.hex });
  });
  return { colors: out, inventory: inv };
}

// دالة توحيد الحروف للمطابقة الذكية النظيفة
function cleanNameForMatch(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s\-_/]+/g, " ");
}

// مسار القسم «الأب › الفرعي» (يميّز قسمين بنفس الاسم تحت أبوين مختلفين) — يُرسَل للذكاء الاصطناعي ويُطابَق به
function categoryPath(c, categories) {
  const parent = c && c.parentId ? (categories || []).find(x => x.id === c.parentId) : null;
  return parent ? parent.name + " › " + c.name : c.name;
}
function categoryLabels() {
  const cats = Store.getCategories();
  return cats.map(c => categoryPath(c, cats));
}

// مطابقة قسم مقترح (اسم أو مسار «أب › فرعي») مع أقسام المتجر: تطابق تام أولاً (وبالأب إن ذُكر)، ثم جزئي **وحيد** فقط.
// التكرار (نفس الاسم تحت أكثر من أب بلا ذكر الأب) = التباس ← null (لا تخمين).
function matchCategory(name, categories) {
  const parts = String(name || "").split(/[›»>]/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const leaf = cleanNameForMatch(parts[parts.length - 1]);
  const parentKey = parts.length > 1 ? cleanNameForMatch(parts[parts.length - 2]) : null;
  if (!leaf) return null;
  const list = (categories || []).map(c => {
    const par = c.parentId ? (categories || []).find(x => x.id === c.parentId) : null;
    return { c, k: cleanNameForMatch(c.name), pk: par ? cleanNameForMatch(par.name) : "" };
  }).filter(x => x.k);
  let exact = list.filter(x => x.k === leaf && (!parentKey || x.pk === parentKey));
  if (!exact.length && parentKey) exact = list.filter(x => x.k === leaf);   // الأب المذكور لا يطابق ← نكتفي بالاسم
  if (exact.length === 1) return exact[0].c;
  if (exact.length > 1) return null;
  if (leaf.length < 3) return null;
  const partial = list.filter(x => x.k.includes(leaf) || (x.k.length >= 3 && leaf.includes(x.k)));
  return partial.length === 1 ? partial[0].c : null;
}

/* ---------------------------------------------------------------------- */
/* دالة الإنشاء السريع للقسم وتحديث القوائم في الكروت                      */
/* ---------------------------------------------------------------------- */
function fastAddCategory(catName) {
  if (!catName || !catName.trim()) return null;
  const clean = cleanNameForMatch(catName);
  const categories = Store.getCategories();
  const existing = categories.find(c => cleanNameForMatch(c.name) === clean);
  if (existing) return existing.id;

  const newCat = Store.addCategory({
    name: catName.trim(),
    image: null,
    icon: "box",
    parentId: ""
  });

  if (newCat) {
    bumpMetaVersion();
    populateCategorySelect();
    renderCategoriesTable();
    showToast(`تمت إضافة قسم "${catName.trim()}" بنجاح!`, "success");
    return newCat.id;
  }
  return null;
}

function refreshAllBatchCategorySelects(targetCard = null, selectId = null) {
  const container = document.getElementById("shelfDetectedList");
  if (!container) return;
  const categories = Store.getCategories();
  const catOptions = '<option value="">-- بدون قسم --</option>' + categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  const cards = container.querySelectorAll(".shelf-item-card");
  cards.forEach(card => {
    const sel = card.querySelector(".shelf-item-category");
    if (!sel) return;
    const currentVal = (card === targetCard && selectId) ? selectId : sel.value;
    sel.innerHTML = catOptions;
    sel.value = currentVal;
  });
}

/* ---------------------------------------------------------------------- */
/* شاشة التحميل المتوافقة مع دليل التصميم ونظام الثيمات                   */
/* ---------------------------------------------------------------------- */
let _processLoaderTimer = null;
let _processLoaderShowTimer = null;   // مؤقت إظهار الطبقة: يُلغى عند الإخفاء كي لا تعود الطبقة بعد hide مباشرة وتبتلع النقرات

function showProcessLoader(title = "جارٍ معالجة البيانات...", customSteps = []) {
  let overlay = document.getElementById("processLoadingOverlay");

  if (!overlay) {
    const style = document.createElement("style");
    style.id = "processLoaderStyles";
    style.textContent = `
      #processLoadingOverlay {
        position: fixed;
        inset: 0;
        background: var(--overlay, rgba(15, 23, 42, 0.65));
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        transition: opacity 0.25s ease;
        font-family: var(--font-body, inherit);
      }
      #processLoadingOverlay.active { opacity: 1; }
      .process-loader-card {
        background: var(--surface);
        border: 1px solid var(--border);
        width: 100%;
        max-width: 400px;
        border-radius: var(--r-card, 14px);
        padding: 28px 24px;
        text-align: center;
        box-shadow: var(--shadow-card, 0 10px 25px -5px rgba(0, 0, 0, 0.1));
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        transform: scale(0.95);
        transition: transform 0.25s ease;
      }
      #processLoadingOverlay.active .process-loader-card { transform: scale(1); }
      .process-spinner {
        width: 44px;
        height: 44px;
        border: 3px solid var(--border-soft, rgba(var(--text-rgb, 15, 23, 42), 0.1));
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: processSpin 0.85s linear infinite;
      }
      @keyframes processSpin {
        to { transform: rotate(360deg); }
      }
      .process-loader-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--heading-color, var(--primary));
        margin: 0;
      }
      .process-loader-step {
        font-size: 0.85rem;
        color: var(--text-2);
        min-height: 20px;
        margin: 0;
        transition: opacity 0.2s ease;
      }
      .process-progress-track {
        width: 100%;
        height: 5px;
        background: var(--surface-2, rgba(var(--text-rgb, 15, 23, 42), 0.05));
        border-radius: var(--r-ctl, 999px);
        overflow: hidden;
        position: relative;
        margin-top: 4px;
      }
      .process-progress-bar {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 35%;
        background: var(--primary);
        border-radius: var(--r-ctl, 999px);
        animation: processProgressLoop 1.6s infinite ease-in-out;
      }
      @keyframes processProgressLoop {
        0% { left: -35%; width: 25%; }
        50% { width: 55%; }
        100% { left: 100%; width: 25%; }
      }
    `;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "processLoadingOverlay";
    overlay.innerHTML = `
      <div class="process-loader-card">
        <div class="process-spinner"></div>
        <h3 class="process-loader-title" id="processLoaderTitle">${title}</h3>
        <p class="process-loader-step" id="processLoaderStep">جارٍ فحص الملف...</p>
        <div class="process-progress-track">
          <div class="process-progress-bar"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const titleEl = document.getElementById("processLoaderTitle");
  const stepEl = document.getElementById("processLoaderStep");
  if (titleEl) titleEl.textContent = title;

  const defaultSteps = [
    "جارٍ قراءة البيانات واستخراج السطور...",
    "جارٍ مطابقة الأسماء والأسعار والكميات...",
    "جارٍ فرز المتغيرات وبناء جدول المخزون...",
    "جارٍ تجهيز شاشة المراجعة..."
  ];

  const steps = customSteps.length ? customSteps : defaultSteps;
  let currentStepIdx = 0;
  if (stepEl) stepEl.textContent = steps[0];

  clearInterval(_processLoaderTimer);
  _processLoaderTimer = setInterval(() => {
    currentStepIdx = (currentStepIdx + 1) % steps.length;
    if (stepEl) {
      stepEl.style.opacity = "0";
      setTimeout(() => {
        stepEl.textContent = steps[currentStepIdx];
        stepEl.style.opacity = "1";
      }, 150);
    }
  }, 2200);

  overlay.style.display = "flex";
  clearTimeout(_processLoaderShowTimer);
  _processLoaderShowTimer = setTimeout(() => overlay.classList.add("active"), 10);
}

function hideProcessLoader() {
  clearInterval(_processLoaderTimer);
  clearTimeout(_processLoaderShowTimer);
  const overlay = document.getElementById("processLoadingOverlay");
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 250);
  }
}

/* ---------------------------------------------------------------------- */
/* دالة مساعدة لرفع رقم نسخة الأقسام والإعلانات والإعدادات لحظياً         */
/* ---------------------------------------------------------------------- */
function bumpMetaVersion() {
  try {
    if (typeof firebase !== "undefined" && firebase.database) {
      firebase.database().ref("ws_meta_v").set(Date.now());
    }
  } catch (err) {
    console.warn("Failed to bump ws_meta_v:", err);
  }
}

/* ---------------------------------------------------------------------- */
/* مساعدة لتحويل DataURL إلى كائن Blob لرفعه إلى ImgBB                     */
/* ---------------------------------------------------------------------- */
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/* ---------------------------------------------------------------------- */
/* بدء تشغيل الصفحة والتهيئة                                              */
/* ---------------------------------------------------------------------- */
// aiEnabled:false في config.js ← إخفاء كل أدوات الذكاء الاصطناعي (تشمل استيراد الإكسل لأنه يعتمد عليها)
function applyAiAvailability() {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (cfg.aiEnabled !== false) return;
  const hide = el => { if (el) el.style.display = "none"; };
  hide(document.querySelector(".ai-toolkit-bar"));
  hide(document.getElementById("btnAiGenDesc"));
  const xl = document.getElementById("excelSyncInput");
  hide(xl && (xl.closest("label") || xl));
}

async function initAdminPage() {
  const app = document.getElementById("adminApp");
  if (!app) return;
  if (typeof requireAdminAuth === "function") {
    const isAuthed = await requireAdminAuth();
    if (!isAuthed) return;
  }

  await pullFromFirebase(true);
  await Store.loadAdminCatalog();
  await Store.loadOrdersFromFirebase(300);

  Store.rebuildIndex(false).then(function (ok) {
    if (!ok) showAdminBanner("تعذّر إنشاء/قراءة فهرس المتجر ws_index. أضف قاعدة ws_index إلى Firebase Rules ثم حدّث الصفحة.");
  });

  if (Store.needsKeyedMigration && Store.needsKeyedMigration()) {
    showAdminBanner("بنية المنتجات على الخادم ما زالت القديمة (مصفوفة). سيُرحَّلها المتجر تلقائياً إلى ws_products/{id} عند أول حفظ (مرة واحدة، دفعات آمنة). لا تغلق الصفحة أثناء الترحيل.");
  }
  document.addEventListener("store:migration-start", function () { showToast("جارٍ ترحيل بنية المنتجات (مرة واحدة)… لا تغلق الصفحة.", "success"); });
  document.addEventListener("store:migration-done", function () { showToast("اكتمل ترحيل المنتجات إلى البنية الجديدة.", "success"); });
  document.addEventListener("store:migration-failed", function () { showToast("تعذّر ترحيل بنية المنتجات (راجع الـ Console). لم تُفقد أي بيانات؛ حدّث الصفحة وأعد المحاولة.", "error"); });

  if (!Store.canWriteNode()) {
    showAdminBanner("تعذّر تحميل فهرس المنتجات من الخادم، لذلك أُوقف حفظ/حذف المنتجات مؤقتاً لحماية بياناتك. تحقق من الاتصال وقواعد Firebase (ws_index) ثم حدّث الصفحة.");
  }

  wireSidebarNav();
  const logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleAdminLogout);
  
  const sidebarToggle = document.getElementById("adminSidebarToggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", toggleAdminSidebar);
  }

  renderStats();
  renderProductsTable();
  renderCategoriesTable();
  renderOrdersTable();
  renderAdsTable(); 
  
  fillSettingsForm();
  populateCategorySelect();
  populateIconPicker();

  wireProductModal();
  wireCategoryModal();
  wireAdModal(); 
  wireSettingsForm();

  // تفعيل الميزات الذكية وإدارات الاستيراد الموحدة
  applyAiAvailability();
  wireExcelSync();
  wireSmartMediaScanner();
  wireAiPricing();

  wireProductsTableEvents();
  wireOutOfStock();

  showUpdateNotice();
}

/* ---------------------------------------------------------------------- */
/* إشعار "تم تحديث الموقع"                                                */
/* ---------------------------------------------------------------------- */
const UPDATE_NOTICE_ID = "2026-10-19";
const UPDATE_NOTICE_KEY = "ws_admin_update_seen";

function showUpdateNotice() {
  const modal = document.getElementById("updateModal");
  if (!modal) return;
  try { if (localStorage.getItem(UPDATE_NOTICE_KEY) === UPDATE_NOTICE_ID) return; } catch (e) {}

  const closeBtn = document.getElementById("closeUpdateModal");
  const okBtn = document.getElementById("updateModalOk");
  if (closeBtn) closeBtn.innerHTML = iconSvg("close");

  function dismiss() {
    modal.classList.remove("open");
    try { localStorage.setItem(UPDATE_NOTICE_KEY, UPDATE_NOTICE_ID); } catch (e) {}
  }
  if (closeBtn) closeBtn.addEventListener("click", dismiss);
  if (okBtn) okBtn.addEventListener("click", dismiss);
  modal.addEventListener("click", function (e) { if (e.target === modal) dismiss(); });

  modal.classList.add("open");
}

function showAdminBanner(message) {
  const main = document.querySelector(".admin-main");
  if (!main) return;
  const box = document.createElement("div");
  box.className = "setup-note";
  box.setAttribute("role", "alert");
  box.textContent = message;
  main.insertBefore(box, main.firstChild);
}

function ensureProductsWritable() {
  if (Store.canWriteNode()) return true;
  showToast("لم يكتمل تحميل المنتجات من الخادم، لذلك أُوقف الحفظ لحماية بياناتك. حدّث الصفحة ثم أعد المحاولة.", "error");
  return false;
}

async function ensureFullCatalogForBulk() {
  if (Store.canWriteProducts()) return true;
  showToast("جارٍ تحميل كل المنتجات من الخادم لإتمام العملية…");
  await Store.ensureAllProductsFresh();
  if (Store.canWriteProducts()) return true;
  showToast("تعذّر تحميل كل المنتجات، أُوقفت العملية لحماية بياناتك. تحقق من الاتصال وأعد المحاولة.", "error");
  return false;
}

async function openProductForEdit(productId) {
  if (!productId) { openProductModal(null); return; }
  let p = null;
  try { p = await Store.loadProductFresh(productId); } catch (e) { console.error(e); }
  if (!p) {
    showToast("تعذّر تحميل المنتج من الخادم. حدّث الصفحة.", "error");
    return;
  }
  openProductModal(productId);
}

/* ---------------------------------------------------------------------- */
/* مزامنة البيانات مع Algolia                                             */
/* ---------------------------------------------------------------------- */
let _algoliaKeyDeclined = false;
function algoliaConfigured() {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  return !!(cfg.useAlgolia === true && cfg.algoliaAppId && !String(cfg.algoliaAppId).startsWith("YOUR_"));
}
function getAlgoliaAdminKey() {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (cfg.algoliaAdminKey && !String(cfg.algoliaAdminKey).startsWith("YOUR_")) {
    return String(cfg.algoliaAdminKey);
  }
  try { return sessionStorage.getItem("ws_algolia_admin_key") || ""; } catch (e) { return ""; }
}
function requestAlgoliaAdminKey() {
  if (!algoliaConfigured()) return "";
  let key = getAlgoliaAdminKey();
  if (key || _algoliaKeyDeclined) return key;
  key = (window.prompt("لمزامنة محرك البحث Algolia أدخل مفتاح Admin API Key:\nاضغط إلغاء لتخطي المزامنة.") || "").trim();
  if (!key) {
    _algoliaKeyDeclined = true;
    showToast("تم تخطي مزامنة Algolia.", "error");
    return "";
  }
  try { sessionStorage.setItem("ws_algolia_admin_key", key); } catch (e) {}
  return key;
}

async function syncProductsToAlgolia(productsList) {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (!algoliaConfigured()) return;
  const adminKey = requestAlgoliaAdminKey();
  if (!adminKey) return;

  const indexName = cfg.algoliaIndexName || "products";
  const url = `https://${cfg.algoliaAppId}.algolia.net/1/indexes/${encodeURIComponent(indexName)}/batch`;

  const requests = [];
  productsList.forEach(p => {
    const isAvail = Store.isProductAvailable(p);
    if (isAvail) {
      requests.push({
        action: "updateObject",
        body: {
          objectID: p.id,
          name: p.name || "",
          price: Number(p.price) || 0,
          oldPrice: Number(p.oldPrice) || 0,
          categoryId: p.categoryId || "",
          image: p.image || "",
          colors: (p.colors || []).map(c => ({ name: c.name, hex: c.hex })),
          sizes: p.sizes || [],
          variants: p.variants || [],
          featured: !!p.featured,
          isOffer: !!p.isOffer,
          isNew: !!p.isNew,
          available: true,
          stock: Number(Store.getTotalStock(p)) || Number(p.stock) || 1
        }
      });
    } else {
      requests.push({ action: "deleteObject", body: { objectID: p.id } });
    }
  });

  if (!requests.length) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": cfg.algoliaAppId,
        "X-Algolia-API-Key": adminKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    });
    if (!res.ok) console.error("Algolia sync error:", await res.text());
  } catch (err) {
    console.error("فشل مزامنة Algolia:", err);
  }
}

async function deleteProductFromAlgolia(productId) {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  if (!algoliaConfigured()) return;
  const adminKey = requestAlgoliaAdminKey();
  if (!adminKey) return;
  const indexName = cfg.algoliaIndexName || "products";
  const url = `https://${cfg.algoliaAppId}.algolia.net/1/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(productId)}`;

  try {
    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Algolia-Application-Id": cfg.algoliaAppId,
        "X-Algolia-API-Key": adminKey
      }
    });
  } catch (err) {
    console.error("فشل حذف المنتج من Algolia:", err);
  }
}

/* ---------------------------------------------------------------------- */
/* 1) ميزة التسعير بالأوامر الطبيعية                                     */
/* ---------------------------------------------------------------------- */
/* ---- التراجع عن آخر أمر تسعير ---- */
const PRICE_UNDO_KEY = "ws_price_undo_v1";
let _priceUndoMem = null;

function savePriceUndo(summary, rows) {
  const rec = { ts: Date.now(), summary: String(summary || ""), rows: rows || [] };
  _priceUndoMem = rec;
  try { localStorage.setItem(PRICE_UNDO_KEY, JSON.stringify(rec)); } catch (e) { /* التخزين ممتلئ: تبقى اللقطة في الذاكرة لهذه الجلسة */ }
}
function loadPriceUndo() {
  if (_priceUndoMem) return _priceUndoMem;
  try {
    const r = JSON.parse(localStorage.getItem(PRICE_UNDO_KEY) || "null");
    if (r && Array.isArray(r.rows) && r.rows.length) return (_priceUndoMem = r);
  } catch (e) {}
  return null;
}
function clearPriceUndo() {
  _priceUndoMem = null;
  try { localStorage.removeItem(PRICE_UNDO_KEY); } catch (e) {}
}
// يحدّد ما يمكن إرجاعه: المنتج الذي عُدّل سعره يدوياً بعد التسعير لا يُمسّ (حتى لا نمحو تعديلاً لاحقاً)
function planPriceUndo(products, rec) {
  const byId = new Map();
  (products || []).forEach(p => { if (p) byId.set(String(p.id), p); });
  const restore = []; let skipped = 0, missing = 0;
  (rec.rows || []).forEach(r => {
    const p = byId.get(String(r.id));
    if (!p) { missing++; return; }
    if ((Number(p.price) || 0) !== r.after.price || (Number(p.oldPrice) || 0) !== r.after.oldPrice) { skipped++; return; }
    restore.push({ p, before: r.before });
  });
  return { restore, skipped, missing };
}
function refreshUndoButton() {
  const btn = document.getElementById("btnUndoPriceCommand");
  if (!btn) return;
  const rec = loadPriceUndo();
  btn.style.display = rec ? "" : "none";
  if (rec) btn.title = "التراجع عن: " + rec.summary + " (" + rec.rows.length + " منتج، " + new Date(rec.ts).toLocaleString("ar-EG") + ")";
}
function wirePriceUndo() {
  const btn = document.getElementById("btnUndoPriceCommand");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  refreshUndoButton();
  btn.addEventListener("click", async () => {
    const rec = loadPriceUndo();
    if (!rec) { showToast("لا يوجد تسعير للتراجع عنه", "error"); refreshUndoButton(); return; }
    if (!ensureProductsWritable()) return;
    if (!(await ensureFullCatalogForBulk())) return;
    const plan = planPriceUndo(Store.getProducts(), rec);
    if (!plan.restore.length) {
      showToast("لا يمكن التراجع: كل المنتجات تغيّرت أسعارها منذ ذلك التسعير أو حُذفت.", "error");
      return;
    }
    const msg = "التراجع عن: " + rec.summary + "\nبتاريخ " + new Date(rec.ts).toLocaleString("ar-EG") +
      "\n\nسيُعاد سعر " + plan.restore.length + " منتج" +
      (plan.skipped ? "\nسيُتجاهل " + plan.skipped + " منتج عُدّل سعره بعد ذلك (حفاظاً على تعديلك)" : "") +
      (plan.missing ? "\nو" + plan.missing + " منتج محذوف" : "") + "\n\nتأكيد؟";
    if (!confirm(msg)) return;
    btn.disabled = true;
    try {
      plan.restore.forEach(x => { x.p.price = x.before.price; x.p.oldPrice = x.before.oldPrice; x.p.isOffer = x.before.isOffer; });
      const saved = await Store.saveProducts(Store.getProducts());
      if (saved === false) { showToast(writeFailureMessage("تعذّر حفظ التراجع على الخادم."), "error"); return; }
      await syncProductsToAlgolia(plan.restore.map(x => x.p));
      clearPriceUndo();
      refreshUndoButton();
      renderProductsTable();
      renderStats();
      showToast("تم التراجع وإرجاع أسعار " + plan.restore.length + " منتج ✅", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "فشل التراجع", "error");
    } finally { btn.disabled = false; }
  });
}

function wireAiPricing() {
  wirePriceUndo();
  const btn = document.getElementById("btnExecutePriceCommand");
  const input = document.getElementById("aiPriceCommandInput");
  if (!btn || !input || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    const command = input.value.trim();
    if (!command) {
      showToast("يرجى كتابة أمر التسعير أولاً", "error");
      input.focus();
      return;
    }

    if (!window.StoreAI || typeof window.StoreAI.parsePriceCommand !== "function") {
      showToast("ملف js/ai.js غير محمل أو لا يدعم التسعير", "error");
      return;
    }

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "جارٍ التحليل... ⏳";

    try {
      const categories = Store.getCategories();
      const categoryNames = categoryLabels();
      // parsePriceCommand يتحقق من الخطة (إجراء مسموح، قيمة، قسم موجود فعلاً، نطاق سعر) ويرمي خطأ عند أي التباس
      const plan = await window.StoreAI.parsePriceCommand(command, categoryNames);

      if (!(await ensureFullCatalogForBulk())) return;

      // القسم المطلوب + أقسامه الفرعية (المنتجات غالباً تتبع القسم الفرعي)
      let allowedCatIds = null;
      if (plan.category) {
        const root = categories.find(c => categoryPath(c, categories) === plan.category) || matchCategory(plan.category, categories);
        if (!root) throw new Error("القسم «" + plan.category + "» لم يعد موجوداً. أعد المحاولة.");
        allowedCatIds = new Set([root.id]);
        let grew = true;
        while (grew) {
          grew = false;
          categories.forEach(c => { if (c.parentId && allowedCatIds.has(c.parentId) && !allowedCatIds.has(c.id)) { allowedCatIds.add(c.id); grew = true; } });
        }
      }

      const products = Store.getProducts();
      const planned = [];   // [{p, price, oldPrice, isOffer}] — حساب فقط، لا تعديل قبل التأكيد

      products.forEach(p => {
        if (!p) return;
        if (allowedCatIds && !allowedCatIds.has(p.categoryId)) return;

        const curPrice = Number(p.price) || 0;
        const curOldPrice = Number(p.oldPrice) || 0;
        if (plan.minPrice !== null && curPrice < plan.minPrice) return;
        if (plan.maxPrice !== null && curPrice > plan.maxPrice) return;

        let price = curPrice, oldPrice = curOldPrice, isOffer = !!p.isOffer, modified = false;

        if (plan.action === "discount_percent") {
          if (!oldPrice || oldPrice <= price) oldPrice = price;
          price = Math.round(curPrice * (1 - plan.value / 100));
          isOffer = true; modified = price !== curPrice;
        } else if (plan.action === "discount_fixed") {
          if (!oldPrice || oldPrice <= price) oldPrice = price;
          price = Math.max(0, curPrice - plan.value);
          isOffer = true; modified = price !== curPrice;
        } else if (plan.action === "increase_percent" || plan.action === "increase_fixed") {
          price = plan.action === "increase_percent" ? Math.round(curPrice * (1 + plan.value / 100)) : curPrice + plan.value;
          // إن لحق السعر الجديد «السعر القديم» فلا معنى للعرض (يظهر سعر مشطوب أصغر من الجديد)
          if (oldPrice && oldPrice <= price) { oldPrice = 0; isOffer = false; }
          modified = price !== curPrice;
        } else if (plan.action === "reset_discount") {
          if (oldPrice && oldPrice > curPrice) { price = oldPrice; oldPrice = 0; isOffer = false; modified = true; }
        }

        if (modified) planned.push({ p, price, oldPrice, isOffer });
      });

      if (!planned.length) {
        showToast("لم يتم العثور على منتجات مطابقة لتطبيق هذا الأمر", "error");
        return;
      }

      // المعاينة: الخلاصة مبنية من الخطة المتحقق منها + العدد الحقيقي + مثال فعلي
      const ex = planned[0];
      const fmt = n => Number(n).toLocaleString("en-US");
      const confirmMsg = "سيتم تطبيق:\n" + plan.summary + "\n\nعدد المنتجات المتأثرة: " + planned.length + " من " + products.length +
        "\nمثال: «" + String(ex.p.name || "").slice(0, 40) + "»: " + fmt(ex.p.price) + " ← " + fmt(ex.price) +
        "\n\nهل تريد التأكيد؟";
      if (!confirm(confirmMsg)) return;

      const touchedProducts = [];
      const undoRows = [];   // لقطة قبل/بعد لزر «تراجع»
      planned.forEach(x => {
        undoRows.push({
          id: x.p.id,
          before: { price: Number(x.p.price) || 0, oldPrice: Number(x.p.oldPrice) || 0, isOffer: !!x.p.isOffer },
          after: { price: x.price, oldPrice: x.oldPrice, isOffer: x.isOffer }
        });
        x.p.price = x.price;
        x.p.oldPrice = x.oldPrice;
        x.p.isOffer = x.isOffer;
        touchedProducts.push(x.p);
      });
      const affectedCount = touchedProducts.length;

      const saved = await Store.saveProducts(products);
      if (saved === false) {
        showToast(writeFailureMessage("تعذّر حفظ الأسعار على الخادم."), "error");
        return;
      }

      savePriceUndo(plan.summary, undoRows);
      refreshUndoButton();
      await syncProductsToAlgolia(touchedProducts);
      renderProductsTable();
      renderStats();
      showToast(`تم بنجاح تحديث أسعار ${affectedCount} منتج ✨ (يمكنك التراجع بزر ↩️)`, "success");
      input.value = "";
    } catch (err) {
      console.error(err);
      showToast(err.message || "فشل تنفيذ أمر التسعير", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });
}

/* ---------------------------------------------------------------------- */
/* 2) النافذة الموحدة لمعاينة ومراجعة البضائع المستوردة                   */
/* ---------------------------------------------------------------------- */
// شارات بطاقة المراجعة: مصدر الوصف (مواصفات رسمية/شرح إعلاني عام)، ثقة البحث والمصادر، اقتراح الاسم الرسمي، وتنبيه توزيع المخزون
function enrichBadgesHtml(item) {
  const e = item && item.enriched;
  const kind = item && item.descKind;
  if (!e && kind !== "ad" && kind !== "official" && kind !== "table") return "";
  const rows = [];
  if (kind === "table") rows.push('<div style="font-size:0.75rem; color:#15803d; font-weight:700;">📄 الوصف منقول حرفياً من الجدول</div>');
  if (kind === "official") rows.push('<div style="font-size:0.75rem; color:#15803d; font-weight:700;">📋 الوصف من مواصفات رسمية (من الإنترنت)</div>');
  if (kind === "ad") rows.push('<div style="font-size:0.75rem; color:#b45309; font-weight:700;">✍️ شرح إعلاني عام (لم تتوفر مواصفات رسمية) — راجعه وعدّله إن لزم</div>');
  if (e) {
    const labels = { high: "ثقة عالية", medium: "ثقة متوسطة — راجع البيانات", low: "ثقة منخفضة — لم تُملأ البيانات حفاظاً على الدقة", notfound: "لم يُعثر على المنتج في الإنترنت — أكمل بياناته يدوياً" };
    const color = e.state === "high" ? "#15803d" : (e.state === "medium" ? "#b45309" : "#b91c1c");
    rows.push('<div style="font-size:0.75rem; color:' + color + '; font-weight:700;">🔎 ' + escapeHtml(labels[e.state] || "") + "</div>");
    if (e.sources && e.sources.length) {
      rows.push('<div style="font-size:0.7rem; color:var(--text-2);">المصادر: ' + e.sources.map(function (src) {
        return '<a href="' + escapeHtml(safeUrl(src.uri)) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary);">' + escapeHtml(src.title || "مصدر") + "</a>";
      }).join("، ") + "</div>");
    }
    if (e.officialName && cleanNameForMatch(e.officialName) !== cleanNameForMatch(item.name)) {
      rows.push('<div style="font-size:0.75rem;">الاسم الرسمي المقترح: <strong>' + escapeHtml(e.officialName) + '</strong> ' +
        '<button type="button" class="btn-use-official" data-official-name="' + escapeHtml(e.officialName) + '" style="background:none; border:none; color:var(--primary); text-decoration:underline; cursor:pointer; font-size:0.75rem; padding:0; font-weight:600;">[استخدمه]</button></div>');
    }
    if (e.addedVariants) rows.push('<div style="font-size:0.72rem; color:#b45309;">⚠️ ألوان/مقاسات مقترحة من الإنترنت: سيُوزَّع المخزون بالتساوي عليها، عدّله من نافذة المنتج بعد الحفظ، أو امسح الحقل لتعطيلها.</div>');
  }
  return '<div class="shelf-enrich-box" style="display:flex; flex-direction:column; gap:3px; background:var(--surface-2, #f8fafc); border:1px dashed var(--line-strong); border-radius:6px; padding:6px 8px;">' + rows.join("") + "</div>";
}

function renderBatchReviewCards(items, modalTitle = "مراجعة وتأكيد البضائع المستخرجة 📦") {
  const modal = document.getElementById("shelfScanModal");
  const container = document.getElementById("shelfDetectedList");
  const statusText = document.getElementById("shelfScanStatus");
  const titleEl = document.getElementById("batchModalTitle");
  const selectAllChk = document.getElementById("batchSelectAll");
  const counterEl = document.getElementById("batchSelectedCounter");

  if (!modal || !container) return;

  if (titleEl) titleEl.textContent = modalTitle;
  container.innerHTML = "";

  const categories = Store.getCategories();
  const catOptions = '<option value="">-- بدون قسم --</option>' + categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  const updateCounter = () => {
    const total = container.querySelectorAll(".shelf-item-card").length;
    const selected = container.querySelectorAll(".shelf-item-check:checked").length;
    if (counterEl) counterEl.textContent = `المحدد للحفظ: ${selected} من أصل ${total}`;
    if (selectAllChk) selectAllChk.checked = (selected === total && total > 0);
  };

  items.forEach((item, idx) => {
    const initialName = item.name || `منتج ${idx + 1}`;
    const initialPrice = item.price !== null && item.price !== undefined ? item.price : "";
    const initialStock = item.stock !== null && item.stock !== undefined ? item.stock : 1;
    const currentStock = item.currentStock !== null && item.currentStock !== undefined ? item.currentStock : null;
    const initialBarcode = item.barcode || "";
    const initialDesc = item.description || "";
    
    // تصفية الألوان من الشفاف
    const cleanColorsList = (item.colors || [])
      .map(c => cleanColorName(String(c)))
      .filter(c => c && !isTransparentOrInvalidColor(c));
    const initialColors = cleanColorsList.join(", ");
    
    const initialSizes = (item.sizes || []).join(", ");
    const existingId = item.existingId || "";
    const isUpdate = !!existingId;

    const statusBadge = isUpdate
      ? `<span class="pill pill-warn" style="font-size:0.75rem;" title="سيتم إضافة هذه الكمية إلى رصيد المتجر الحالي">تحديث رصيد (+${initialStock}) 🔄</span>`
      : '<span class="pill pill-ok" style="font-size:0.75rem;">منتج جديد ✨</span>';

    const searchGoogleUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(initialName + ' product white background')}`;
    const displayImg = item.image
      ? `<img class="shelf-item-img" src="${escapeHtml(item.image)}" style="max-width:100%; max-height:100%; object-fit:contain;">`
      : `<div class="shelf-item-placeholder" style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--ink-300); font-size:12px; gap:4px;">${iconSvg("box")}<span>لا توجد صورة</span></div>`;

    const card = document.createElement("div");
    card.className = "shelf-item-card";
    card.setAttribute("data-existing-id", existingId);
    card.setAttribute("data-color-hex", JSON.stringify(item.colorHex || {}));   // درجة كل لون جاء ككود في الملف
    card.style.cssText = "background:var(--surface); border:1px solid var(--line-strong); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;";

    const cleanSuggestedCat = cleanNameForMatch(item.category);
    const hasCatMatch = item.categoryId || (cleanSuggestedCat && categories.some(c => cleanNameForMatch(c.name) === cleanSuggestedCat));
    const showSuggestedChip = !hasCatMatch && item.category && item.category.trim();

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        ${statusBadge}
        <span style="font-size:0.75rem; color:var(--ink-400); font-family:monospace;">${escapeHtml(initialBarcode || '—')}</span>
      </div>

      <div class="shelf-img-box" style="height:130px; border-radius:6px; overflow:hidden; background:#fff; display:flex; align-items:center; justify-content:center; border:1px solid var(--line); position:relative;">
        ${displayImg}
      </div>

      <!-- أدوات التعامل مع الصورة -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <a href="${searchGoogleUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm btn-google-search" style="flex:1; text-align:center; padding:4px 6px; font-size:11px; text-decoration:none; background:#fff;" title="البحث في صور Google">
          🔍 صور Google
        </a>
        <button type="button" class="btn-paste-url" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:11px; text-decoration:underline;">🔗 رابط</button>
        <label style="color:var(--primary); cursor:pointer; font-size:11px; text-decoration:underline; margin:0;">
          📁 رفع
          <input type="file" accept="image/*" class="shelf-card-file" style="display:none;">
        </label>
      </div>

      ${enrichBadgesHtml(item)}

      <input type="text" class="shelf-item-name" value="${escapeHtml(initialName)}" placeholder="اسم المنتج الأساسي" style="padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.85rem; font-weight:600;">
      
      <!-- اختيار أو إنشاء القسم بسرعة -->
      <div>
        <div style="display:flex; gap:6px; align-items:center;">
          <select class="shelf-item-category" style="flex:1; padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.85rem; font-family:inherit; background:var(--surface); color:var(--text);">
            ${catOptions}
          </select>
          <button type="button" class="btn-quick-add-cat" title="إضافة قسم جديد وتعيينه" style="padding:6px 10px; border:1px solid var(--border); background:var(--surface); color:var(--primary); border-radius:6px; cursor:pointer; font-weight:bold; font-size:0.95rem; line-height:1;">
            +
          </button>
        </div>
        ${showSuggestedChip ? `
          <div class="suggested-cat-chip" style="font-size:0.75rem; color:var(--text-2); display:flex; align-items:center; gap:4px; margin-top:4px;">
            <span>قسم مقترح: <strong>${escapeHtml(item.category)}</strong></span>
            <button type="button" class="btn-create-suggested-cat" data-cat-name="${escapeHtml(item.category)}" style="background:none; border:none; color:var(--primary); text-decoration:underline; cursor:pointer; font-size:0.75rem; padding:0; font-weight:600;">
              [+ إنشاء واختيار]
            </button>
          </div>
        ` : ''}
      </div>

      <textarea class="shelf-item-desc" placeholder="وصف المنتج ومميزاته ومواصفاته..." rows="2" style="width:100%; padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.8rem; resize:vertical; font-family:inherit;">${escapeHtml(initialDesc)}</textarea>

      <!-- حقول الألوان والمقاسات التلقائية -->
      <div style="display:flex; gap:6px;">
        <div style="flex:1;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:2px;">الألوان (اختياري)</label>
          <input type="text" class="shelf-item-colors" value="${escapeHtml(initialColors)}" placeholder="مثال: أسود, أبيض, بيج" style="width:100%; padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.8rem; font-family:inherit;">
        </div>
        <div style="flex:1;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:2px;">المقاسات / السعات</label>
          <input type="text" class="shelf-item-sizes" value="${escapeHtml(initialSizes)}" placeholder="مثال: S, M, L أو 50ml أو 256GB" style="width:100%; padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.8rem; font-family:inherit;">
        </div>
      </div>

      <div style="display:flex; gap:6px;">
        <div style="flex:1;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:2px;">السعر (د.ع)</label>
          <input type="number" class="shelf-item-price" value="${initialPrice}" placeholder="السعر" min="0" style="width:100%; padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.85rem;">
        </div>
        <div style="width:100px;">
          <label style="font-size:0.75rem; color:var(--ink-400); display:block; margin-bottom:2px;">
            ${currentStock !== null ? 'الكمية الواردة (+)' : 'الكمية'}
          </label>
          <input type="number" class="shelf-item-stock" value="${initialStock}" placeholder="الكمية" min="0" style="width:100%; padding:6px 8px; border:1px solid var(--line-strong); border-radius:6px; font-size:0.85rem;">
          ${currentStock !== null ? `<span style="font-size:0.7rem; color:var(--text-2); display:block; margin-top:2px; text-align:center;">(الحالي: ${currentStock})</span>` : ''}
        </div>
      </div>

      <input type="hidden" class="shelf-item-barcode" value="${escapeHtml(initialBarcode)}">

      <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer; margin-top:4px; padding-top:6px; border-top:1px dashed var(--line);">
        <input type="checkbox" class="shelf-item-check" checked data-crop="${escapeHtml(item.image || '')}">
        <span style="font-weight:600;">تأكيد التحديث / الإضافة للمتجر</span>
      </label>
    `;

    const catSelect = card.querySelector(".shelf-item-category");
    if (catSelect) {
      if (item.categoryId) {
        catSelect.value = item.categoryId;
      } else if (cleanSuggestedCat) {
        const found = matchCategory(item.category, categories);
        if (found) catSelect.value = found.id;
      }
    }

    const btnQuickAdd = card.querySelector(".btn-quick-add-cat");
    if (btnQuickAdd) {
      btnQuickAdd.addEventListener("click", () => {
        const catName = prompt("اكتب اسم القسم الجديد:");
        if (catName && catName.trim()) {
          const newId = fastAddCategory(catName);
          if (newId) {
            refreshAllBatchCategorySelects(card, newId);
          }
        }
      });
    }

    const btnSuggested = card.querySelector(".btn-create-suggested-cat");
    if (btnSuggested) {
      btnSuggested.addEventListener("click", () => {
        const catName = btnSuggested.getAttribute("data-cat-name");
        const newId = fastAddCategory(catName);
        if (newId) {
          refreshAllBatchCategorySelects(card, newId);
          const chip = card.querySelector(".suggested-cat-chip");
          if (chip) chip.remove();
        }
      });
    }

    const btnOfficial = card.querySelector(".btn-use-official");
    if (btnOfficial) {
      btnOfficial.addEventListener("click", () => {
        const nm = card.querySelector(".shelf-item-name");
        if (nm) { nm.value = btnOfficial.getAttribute("data-official-name") || nm.value; nm.dispatchEvent(new Event("input", { bubbles: true })); }
        btnOfficial.parentElement.style.display = "none";
      });
    }

    const nameInp = card.querySelector(".shelf-item-name");
    const googleLink = card.querySelector(".btn-google-search");
    if (nameInp && googleLink) {
      nameInp.addEventListener("input", () => {
        const q = (nameInp.value.trim() || 'product') + ' product white background';
        googleLink.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
      });
    }

    card.querySelector(".btn-paste-url").addEventListener("click", () => {
      const url = prompt("ألصق رابط الصورة المباشر هنا:");
      if (url && url.trim().startsWith("http")) {
        const box = card.querySelector(".shelf-img-box");
        box.innerHTML = `<img class="shelf-item-img" src="${escapeHtml(url.trim())}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        card.querySelector(".shelf-item-check").setAttribute("data-crop", url.trim());
        card.style.borderColor = "var(--olive-600, #4ade80)";
      }
    });

    // رفع فوري عند اختيار الصورة (فكرة النسخة الأخرى): الصورة تُرفع إلى ImgBB ← ImageKit فوراً ويُكتب الرابط في البطاقة،
    // فيكون خطوة «حفظ» سريعة ويرى المدير فشل أي صورة في بطاقتها. الرفع نفسه عبر uploadToImgBB (تصغير + مهلة + إعادة محاولة).
    card.querySelector(".shelf-card-file").addEventListener("change", async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const box = card.querySelector(".shelf-img-box");
      const checkEl = card.querySelector(".shelf-item-check");
      const originalBoxContent = box.innerHTML;
      card.dataset.uploading = "1";            // يمنع «حفظ» قبل اكتمال الرفع (وإلا يُحفظ المنتج بلا صورة)
      box.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--primary);"><div class="process-spinner" style="width:24px; height:24px; border-width:2px;"></div><span style="font-size:11px; font-weight:600;">جارٍ رفع الصورة...</span></div>';
      try {
        const cdnUrl = await uploadToImgBB(f, false);
        box.innerHTML = `<img class="shelf-item-img" src="${escapeHtml(cdnUrl)}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        checkEl.setAttribute("data-crop", cdnUrl);
        card.style.borderColor = "var(--olive-600, #4ade80)";
      } catch (err) {
        console.error("Upload error:", err);
        box.innerHTML = originalBoxContent;
        showToast(err.message || "فشل رفع الصورة.", "error");
      } finally {
        delete card.dataset.uploading;
        ev.target.value = "";
      }
    });

    card.querySelector(".shelf-item-check").addEventListener("change", updateCounter);

    // تنبيه السعر المشبوه: صفر، أو أصغر من 1000 بالدينار (غالباً 25 تعني 25,000) مع زر ×1000
    (function wirePriceHint() {
      const priceEl = card.querySelector(".shelf-item-price");
      if (!priceEl || !priceEl.parentElement) return;
      const hint = document.createElement("div");
      hint.className = "shelf-price-hint";
      hint.style.cssText = "font-size:0.72rem; margin-top:3px; color:#b45309; display:none;";
      priceEl.parentElement.appendChild(hint);
      const cur = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.currencySymbol) || "";
      const iqd = /د\.ع|iqd/i.test(cur);
      const update = () => {
        const v = Number(priceEl.value) || 0;
        if (v <= 0) { hint.style.display = ""; hint.textContent = "⚠️ لا يوجد سعر — أدخله قبل الحفظ"; return; }
        if (iqd && v < 1000) {
          hint.style.display = "";
          hint.innerHTML = "⚠️ السعر " + v + " صغير جداً. هل تقصد " + (v * 1000).toLocaleString("en-US") + "؟ " +
            '<button type="button" class="shelf-price-x1000" style="border:1px solid #b45309; background:#fff7ed; color:#b45309; border-radius:5px; padding:0 6px; cursor:pointer; font-size:0.72rem;">×1000</button>';
          return;
        }
        hint.style.display = "none";
      };
      hint.addEventListener("click", ev => {
        if (ev.target && ev.target.classList && ev.target.classList.contains("shelf-price-x1000")) {
          priceEl.value = (Number(priceEl.value) || 0) * 1000;
          update();
        }
      });
      priceEl.addEventListener("input", update);
      update();
    })();

    container.appendChild(card);
  });

  if (statusText) statusText.textContent = `تم العثور على ${items.length} صنف`;
  updateCounter();

  if (selectAllChk && !selectAllChk.dataset.wired) {
    selectAllChk.dataset.wired = "1";
    selectAllChk.addEventListener("change", (e) => {
      const chks = container.querySelectorAll(".shelf-item-check");
      chks.forEach(c => c.checked = e.target.checked);
      updateCounter();
    });
  }

  modal.style.display = "flex";
  modal.classList.add("open");
}

/* ---------------------------------------------------------------------- */
/* معالجة ملفات الإكسل مباشرة عبر الذكاء الاصطناعي مع استخراج الروابط      */
/* ---------------------------------------------------------------------- */
/* ---------------------------------------------------------------------- */
/* حماية من تكرار الاستيراد + قالب إكسل جاهز                              */
/* ---------------------------------------------------------------------- */
// رفع الملف نفسه مرتين يضاعف المخزون (الكمية الواردة تُضاف للرصيد) فنسأل المدير. البصمة: الاسم+الحجم+تاريخ التعديل.
const IMPORT_HIST_KEY = "ws_import_hist_v1";
let _pendingImportFp = "";
function readImportHist() { try { return JSON.parse(localStorage.getItem(IMPORT_HIST_KEY) || "{}") || {}; } catch (e) { return {}; } }
function confirmReimport(file) {
  _pendingImportFp = [file.name, file.size, file.lastModified].join("|");
  const ts = readImportHist()[_pendingImportFp];
  if (ts && Date.now() - ts < 90 * 86400000) {
    const when = new Date(ts).toLocaleString("ar");
    const ok = window.confirm("هذا الملف نفسه استُورد وحُفظ سابقاً بتاريخ " + when + ".\nاستيراده مرة أخرى سيضيف كمياته إلى المخزون من جديد (تضاعف الأرصدة).\n\nهل تريد المتابعة؟");
    if (!ok) { _pendingImportFp = ""; return false; }
  }
  return true;
}
function recordImportDone() {
  if (!_pendingImportFp) return;
  try {
    const h = readImportHist();
    h[_pendingImportFp] = Date.now();
    const keys = Object.keys(h).sort((x, y) => h[y] - h[x]).slice(0, 50);   // نحتفظ بآخر 50 فقط
    const out = {}; keys.forEach(k => { out[k] = h[k]; });
    localStorage.setItem(IMPORT_HIST_KEY, JSON.stringify(out));
  } catch (e) { /* التخزين ممتلئ أو معطّل: لا يهم */ }
  _pendingImportFp = "";
}

// قالب إكسل جاهز يعطيه المدير للتاجر: أعمدة واضحة، الباركود نص (لا يتحول إلى 6.29E+12)، وتعليمات في ورقة ثانية
function downloadImportTemplate() {
  try {
    if (typeof XLSX === "undefined" || !XLSX.utils || typeof XLSX.writeFile !== "function") throw new Error("مكتبة الإكسل غير محمّلة");
    const head = ["اسم المنتج", "السعر", "الكمية", "الباركود", "القسم", "الألوان", "المقاسات / السعات", "الوصف (اختياري)", "رابط الصورة (اختياري)"];
    const rows = [head,
      ["(مثال) قميص قطني رجالي", 25000, 12, "6291003012345", "ملابس رجالية", "أبيض, أسود, أزرق", "M, L, XL", "", ""],
      ["(مثال) Google Pixel 11 Pro", 1450000, 5, "840353012345", "هواتف", "Obsidian, Porcelain", "12/256, 16/512", "", ""]
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let r = 1; r < rows.length; r++) {
      const ref = XLSX.utils.encode_cell({ r: r, c: 3 });
      if (ws[ref]) { ws[ref].t = "s"; ws[ref].z = "@"; }
    }
    ws["!cols"] = [28, 12, 9, 18, 18, 24, 20, 30, 30].map(w => ({ wch: w }));
    const help = XLSX.utils.aoa_to_sheet([
      ["تعليمات تعبئة القالب"],
      ["1) كل منتج في سطر واحد. الألوان والمقاسات المتعددة تُكتب في الخلية نفسها مفصولة بفاصلة."],
      ["2) السعر رقم كامل بلا فواصل: 25000 وليس 25."],
      ["3) الباركود يُكتب كنص؛ لا تغيّر تنسيق عموده حتى لا يتحول إلى 8.99E+12."],
      ["4) الصف الأول للعناوين فقط؛ لا تضف عنواناً أو شعاراً فوقه."],
      ["5) سعة الهواتف تُكتب 12/256 (رام/تخزين)، ومقاس الجينز 30/32، ومقاس الأطفال 2-3Y."],
      ["6) سطرا المثال (المبدوءان بـ «(مثال)») يُتجاهلان تلقائياً؛ يمكنك حذفهما أو الكتابة فوقهما."],
      ["7) الوصف والصورة والقسم اختيارية: الذكاء الاصطناعي يكمل الناقص، وكل شيء يُراجَع في شاشة المراجعة قبل الحفظ."],
      ["8) لا ترفع الملف نفسه مرتين: الكميات تُضاف إلى المخزون في كل مرة."]
    ]);
    help["!cols"] = [{ wch: 100 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المنتجات");
    XLSX.utils.book_append_sheet(wb, help, "تعليمات");
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.writeFile(wb, "قالب-استيراد-المنتجات.xlsx");
  } catch (e) {
    console.error("template error:", e);
    showToast("تعذّر إنشاء القالب: " + e.message, "error");
  }
}

async function handleExcelFileWithAI(file) {
  if (!confirmReimport(file)) return;
  showProcessLoader("تحليل بيانات الإكسل عبر الذكاء الاصطناعي", [
    "جارٍ قراءة وتفريغ جدول الإكسل والروابط...",
    "جارٍ إرسال البيانات مباشرة إلى الذكاء الاصطناعي...",
    "جارٍ استنتاج الأقسام واستخراج الأسماء باللغتين...",
    "جارٍ تجهيز شاشة المراجعة..."
  ]);

  try {
    if (!window.StoreAI || typeof window.StoreAI.scanInvoice !== "function") throw new Error("ملف js/ai.js غير محمل");
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const storeCategories = categoryLabels();

    // كل الأوراق (كان الكود يقرأ الورقة الأولى فقط فتضيع بقية المنتجات بصمت)
    let all = [];
    let warnings = [];
    let sheetsUsed = 0;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      // ورقة التعليمات في القالب الجاهز (أو أي ورقة بعمود واحد) ليست منتجات: لا تُرسل للذكاء الاصطناعي
      if (/^\s*(تعليمات|instructions?|help|readme|ملاحظات)\s*$/i.test(sheetName)) continue;
      try { const rg = XLSX.utils.decode_range(sheet["!ref"] || "A1"); if (rg.e.c - rg.s.c < 1) continue; } catch (e) { /* نتابع */ }

      // استخراج الروابط التشعبية المضمنة حتى لا تضيع روابط الصور
      Object.keys(sheet).forEach(cellRef => {
        if (cellRef.startsWith("!")) return;
        const cell = sheet[cellRef];
        if (cell && cell.l && cell.l.Target) {
          const url = cell.l.Target;
          cell.v = `${cell.v || ""} [URL: ${url}]`;
          if (cell.w) cell.w = `${cell.w} [URL: ${url}]`;
        }
      });

      const csvText = XLSX.utils.sheet_to_csv(sheet);
      if (!csvText || !csvText.trim()) continue;
      sheetsUsed++;

      // الجدول الكبير يُقطَّع تلقائياً إلى دفعات داخل StoreAI.scanInvoice
      const result = await window.StoreAI.scanInvoice(csvText, "text/csv", storeCategories);
      all = all.concat(result.items || []);
      const label = workbook.SheetNames.length > 1 ? "[" + sheetName + "] " : "";
      warnings = warnings.concat((result.warnings || []).map(w => label + w));
    }

    if (!sheetsUsed) {
      hideProcessLoader();
      showToast("ملف الإكسل فارغ أو لا يحتوي على بيانات.", "error");
      return;
    }

    // توحيد المكرر عبر الأوراق
    const rawItems = window.StoreAI.normalizeItems(all).items;

    if (!rawItems.length) {
      hideProcessLoader();
      showToast("لم يتمكن الذكاء الاصطناعي من العثور على منتجات صالحة في هذا الملف.", "error");
      return;
    }

    await enrichAndOpen(rawItems, "المنتجات المستخرجة من ملف الإكسل (عبر الذكاء الاصطناعي) 📊", warnings);
  } catch (err) {
    hideProcessLoader();
    console.error("Excel AI import error:", err);
    showToast("حدث خطأ أثناء معالجة ملف الإكسل: " + err.message, "error");
  }
}

/* ---------------------------------------------------------------------- */
/* 3) المعالجة الموحدة للوسائط الذكية (رفع صورة شاملة / رفع ملف مستند)     */
/* ---------------------------------------------------------------------- */
function wireSmartMediaScanner() {
  // زر «قالب إكسل جاهز» يُضاف داخل شريط أدوات الذكاء الاصطناعي (إن وُجد الشريط)
  const _bar = document.querySelector(".ai-toolkit-bar");
  if (_bar && !document.getElementById("btnDownloadImportTemplate")) {
    const sib = _bar.querySelector("button, label, a");
    const tb = document.createElement("button");
    tb.type = "button";
    tb.id = "btnDownloadImportTemplate";
    tb.className = sib ? sib.className : "btn";
    tb.textContent = "⬇️ قالب إكسل جاهز";
    tb.title = "حمّل قالباً بأعمدة واضحة ليملأه صاحب المحل ثم ارفعه هنا";
    tb.addEventListener("click", downloadImportTemplate);
    _bar.appendChild(tb);
  }
  const imgInput = document.getElementById("aiImageInput");
  const fileInput = document.getElementById("aiFileInput");
  const modal = document.getElementById("shelfScanModal");
  const closeBtn = document.getElementById("closeShelfScanModal");
  const cancelBtn = document.getElementById("btnCancelShelfScan");
  const saveBtn = document.getElementById("btnSaveShelfProducts");

  const closeModal = () => {
    if (modal) {
      modal.classList.remove("open");
      modal.style.display = "none";
    }
    const list = document.getElementById("shelfDetectedList");
    if (list) list.innerHTML = "";
    if (imgInput) imgInput.value = "";
    if (fileInput) fileInput.value = "";
    const xlInput = document.getElementById("excelSyncInput");
    if (xlInput) xlInput.value = "";
  };

  if (closeBtn && !closeBtn.dataset.wired) {
    closeBtn.dataset.wired = "1";
    closeBtn.addEventListener("click", closeModal);
  }
  if (cancelBtn && !cancelBtn.dataset.wired) {
    cancelBtn.dataset.wired = "1";
    cancelBtn.addEventListener("click", closeModal);
  }

  // أ) معالجة "رفع صورة" (كاميرا أو معرض)
  if (imgInput && !imgInput.dataset.wired) {
    imgInput.dataset.wired = "1";
    imgInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!window.StoreAI || typeof window.StoreAI.scanInvoice !== "function") {
        showToast("خدمة الذكاء الاصطناعي غير متوفرة في js/ai.js", "error");
        imgInput.value = "";
        return;
      }

      if (!confirmReimport(file)) { imgInput.value = ""; return; }
      showProcessLoader("معالجة الصورة بالذكاء الاصطناعي", [
        "جارٍ قراءة تفاصيل الصورة بصرياً...",
        "جارٍ استخراج الأسماء التجارية باللغتين والمواصفات والروابط...",
        "جارٍ مطابقة الأقسام وتجهيز شاشة المراجعة..."
      ]);

      try {
        const prepared = await window.StoreAI.prepareImage(file);   // تصغير + JPEG (أسرع وأدق وأقل عرضة لتجاوز الحد)
        const storeCategories = categoryLabels();
        const result = await window.StoreAI.scanInvoice(prepared.base64, prepared.mimeType, storeCategories);
        const rawItems = result.items || [];

        if (!rawItems.length) {
          hideProcessLoader();
          showToast("لم يتم العثور على منتجات واضحة في الصورة.", "error");
          return;
        }

        await enrichAndOpen(rawItems, "المنتجات المستخرجة من الصورة 🖼️", result.warnings);
      } catch (err) {
        hideProcessLoader();
        console.error(err);
        showToast(err.message || "حدث خطأ أثناء معالجة الصورة", "error");
      } finally {
        imgInput.value = "";
      }
    });
  }

  // ب) معالجة "رفع ملف" (فواتير PDF مباشرة أو ملفات Excel)
  if (fileInput && !fileInput.dataset.wired) {
    fileInput.dataset.wired = "1";
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const fileName = file.name.toLowerCase();

      // معالجة الإكسل مباشرة عبر الذكاء الاصطناعي
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv")) {
        try {
          await handleExcelFileWithAI(file);
        } finally {
          fileInput.value = "";
        }
        return;
      }

      // معالجة ملفات PDF مباشرة
      if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
        if (!window.StoreAI || typeof window.StoreAI.scanInvoice !== "function") {
          showToast("خدمة الذكاء الاصطناعي غير متوفرة", "error");
          fileInput.value = "";
          return;
        }

        if (!confirmReimport(file)) { fileInput.value = ""; return; }
        showProcessLoader("قراءة وتحليل ملف الفاتورة PDF", [
          "جارٍ تفريغ نصوص وجداول وروابط الفاتورة الإلكترونية...",
          "جارٍ استخراج الأسماء باللغتين والمواصفات والأسعار...",
          "جارٍ مطابقة الأقسام من سياق المنتجات بالذكاء الاصطناعي...",
          "جارٍ تجهيز شاشة المراجعة..."
        ]);

        try {
          const prepared = await window.StoreAI.preparePdf(file);    // يتحقق من الحجم (≤12MB)
          const storeCategories = categoryLabels();
          const result = await window.StoreAI.scanInvoice(prepared.base64, prepared.mimeType, storeCategories);
          const rawItems = result.items || [];

          if (!rawItems.length) {
            hideProcessLoader();
            showToast("لم يتم العثور على أصناف قابلة للاستخراج في ملف PDF.", "error");
            return;
          }

          await enrichAndOpen(rawItems, "المنتجات المستخرجة من ملف الفاتورة (PDF) 📄", result.warnings);
        } catch (err) {
          hideProcessLoader();
          console.error(err);
          showToast(err.message || "حدث خطأ أثناء قراءة ملف PDF", "error");
        } finally {
          fileInput.value = "";
        }
        return;
      }

      showToast("يرجى اختيار ملف PDF أو ملف إكسل صالح.", "error");
      fileInput.value = "";
    });
  }

  // ج) تأكيد وحفظ التحديثات المجمعة
  if (saveBtn && !saveBtn.dataset.wired) {
    saveBtn.dataset.wired = "1";
    let _batchSaving = false;   // يمنع الضغط المزدوج (كان يُنشئ كل المنتجات مرتين)
    const _doBatchSave = async () => {
      const container = document.getElementById("shelfDetectedList");
      if (container.querySelector('.shelf-item-card[data-uploading="1"]')) {
        showToast("انتظر اكتمال رفع الصور في البطاقات ثم احفظ.", "error");
        return;
      }
      const cards = container.querySelectorAll(".shelf-item-card");
      const toProcess = [];

      cards.forEach(card => {
        const chk = card.querySelector(".shelf-item-check");
        if (!chk || !chk.checked) return;

        const name = card.querySelector(".shelf-item-name")?.value.trim();
        const categoryId = card.querySelector(".shelf-item-category")?.value || "";
        const description = card.querySelector(".shelf-item-desc")?.value.trim() || "";
        const price = Number(card.querySelector(".shelf-item-price")?.value) || 0;
        const stock = Number(card.querySelector(".shelf-item-stock")?.value) || 0;
        const barcode = card.querySelector(".shelf-item-barcode")?.value.trim() || "";
        const existingId = card.getAttribute("data-existing-id") || "";
        const imgUrl = chk.getAttribute("data-crop") || "";

        const colorsRaw = card.querySelector(".shelf-item-colors")?.value.trim() || "";
        const sizesRaw = card.querySelector(".shelf-item-sizes")?.value.trim() || "";
        
        // استبعاد أي لون شفاف أو قوام مائي تلقائياً عند الحفظ
        // الألوان: كود مكتوب في الخانة (E07A5F) ← اسم عربي + درجته؛ وألوان الملف تحمل درجتها في data-color-hex
        let hexMapCard = {};
        try { hexMapCard = JSON.parse(card.getAttribute("data-color-hex") || "{}") || {}; } catch (e) { hexMapCard = {}; }
        const rawColors = [], colorHexMap = {}, usedColorNames = new Set();
        (colorsRaw ? colorsRaw.split(/[,،/|]/) : []).forEach(piece => {
          const e = (window.StoreAI && window.StoreAI.splitColorEntry) ? window.StoreAI.splitColorEntry(piece) : null;
          let base = cleanColorName(e ? e.name : piece.trim());
          if (!base || isTransparentOrInvalidColor(base)) return;
          let nm = base, n = 2;
          if (usedColorNames.has(nm.toLowerCase())) { if (!e) return; while (usedColorNames.has((base + " " + n).toLowerCase())) n++; nm = base + " " + n; }
          usedColorNames.add(nm.toLowerCase());
          rawColors.push(nm);
          const hx = e ? e.hex : hexMapCard[nm];
          if (hx) colorHexMap[nm] = hx;
        });
        const rawSizes = sizesRaw ? sizesRaw.split(/[,،/|]/).map(s => safeVariantName(s)).filter(Boolean) : [];

        if (name) {
          toProcess.push({ name, categoryId, description, price, stock, barcode, existingId, imgUrl, rawColors, rawSizes, colorHexMap });
        }
      });

      if (!toProcess.length) {
        showToast("لم تحدد أي منتجات للحفظ", "error");
        return;
      }

      if (!ensureProductsWritable()) return;
      if (!(await ensureFullCatalogForBulk())) return;

      showProcessLoader("جارٍ حفظ البيانات وتحديث المتجر", [
        "جارٍ معالجة ورفع صور المنتجات...",
        "جارٍ مزامنة وتحديث كميات المخزون...",
        "جارٍ ربط وتحديث قاعدة البيانات..."
      ]);

      try {
        let addedCount = 0;
        let updatedCount = 0;
        let imgFailed = 0;
        const touchedProducts = [];
        let allProducts = Store.getProducts();

        // نفس مسار صورة المنتج المفرد: ملف ← ImgBB ← رابط ImageKit يُكتب في Firebase (uploadToImgBB).
        // الروابط الخارجية http(s) تُحفظ كما هي. الرفع متوازٍ (3 معاً) مع عدّاد تقدّم ظاهر.
        const uploadJobs = toProcess.filter(it => it.imgUrl && it.imgUrl.startsWith("data:"));
        if (uploadJobs.length) {
          let doneUploads = 0, cursor = 0;
          const stepMsg = () => showProcessLoader("جارٍ حفظ البيانات وتحديث المتجر", ["جارٍ رفع الصور إلى ImgBB: " + doneUploads + " من " + uploadJobs.length]);
          stepMsg();
          const worker = async () => {
            while (cursor < uploadJobs.length) {
              const job = uploadJobs[cursor++];
              try {
                job.imgUrl = await uploadToImgBB(dataURLtoBlob(job.imgUrl), false);
              } catch (e) {
                // لا نحفظ base64 داخل Firebase؛ المنتج يُحفظ بلا صورة وتُعرض رسالة بالعدد
                console.warn("ImgBB upload failed, image skipped:", e);
                job.imgUrl = "";
                imgFailed++;
              }
              doneUploads++; stepMsg();
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          showProcessLoader("جارٍ حفظ البيانات وتحديث المتجر", ["جارٍ ربط وتحديث قاعدة البيانات..."]);
        }

        const now = Date.now();
        for (let i = 0; i < toProcess.length; i++) {
          const item = toProcess[i];
          let finalImgUrl = item.imgUrl;

          const cleanItemName = cleanNameForMatch(item.name);
          let existingProduct = item.existingId
            ? allProducts.find(p => p.id === item.existingId)
            : allProducts.find(p => (item.barcode && (p.barcode === item.barcode || p.sku === item.barcode)) || (p.name && cleanNameForMatch(p.name) === cleanItemName));

          const cleanColors = (item.rawColors || []).map((cName) => ({
            name: cName,
            hex: (item.colorHexMap && item.colorHexMap[cName]) || getColorHex(cName),
            image: null
          }));
          const cleanSizes = item.rawSizes || [];

          let cleanInventory = {};
          if (cleanColors.length > 0 || cleanSizes.length > 0) {
            const rowKeys = cleanColors.length ? cleanColors.map(c => c.name) : [null];
            const colKeys = cleanSizes.length ? cleanSizes : [null];
            const totalCombos = rowKeys.length * colKeys.length;
            // نوزّع الكمية كما هي بالضبط (المجموع = الكمية الواردة). القديم كان يرفع كل توليفة إلى 1 على الأقل
            // فتصير الكمية 10 لمنتج وارد منه 5 فقط (5 ألوان × 2 مقاس).
            const baseQty = Math.floor(item.stock / totalCombos);
            let remainder = item.stock - baseQty * totalCombos;

            rowKeys.forEach(color => {
              colKeys.forEach(size => {
                const key = inventoryKeyFor(color, size);
                cleanInventory[key] = baseQty + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
              });
            });
          }

          const itemTimestamp = now + (toProcess.length - i);

          if (existingProduct) {
            if (item.price > 0) existingProduct.price = item.price;
            if (item.categoryId) existingProduct.categoryId = item.categoryId;
            if (item.description) existingProduct.description = item.description;
            if (finalImgUrl && !existingProduct.image) existingProduct.image = finalImgUrl;

            const mergedColors = [...(existingProduct.colors || [])];
            cleanColors.forEach(nc => {
              if (!mergedColors.some(oc => oc.name.trim().toLowerCase() === nc.name.trim().toLowerCase())) {
                mergedColors.push(nc);
              }
            });

            const mergedSizes = [...(existingProduct.sizes || [])];
            cleanSizes.forEach(ns => {
              if (!mergedSizes.some(os => os.trim().toLowerCase() === ns.trim().toLowerCase())) {
                mergedSizes.push(ns);
              }
            });

            if (mergedColors.length) existingProduct.colors = mergedColors;
            if (mergedSizes.length) existingProduct.sizes = mergedSizes;

            // جمع الكمية الواردة إلى الرصيد الحالي للمنتج (+)
            const incomingQty = Number(item.stock) || 0;
            const currentTotalStock = Number(existingProduct.stock) || 0;

            if (Object.keys(cleanInventory).length > 0) {
              let mergedInventory = Object.assign({}, existingProduct.inventory || {});
              Object.keys(cleanInventory).forEach(k => {
                mergedInventory[k] = (Number(mergedInventory[k]) || 0) + Number(cleanInventory[k]);
              });
              existingProduct.inventory = mergedInventory;
              existingProduct.stock = Object.values(mergedInventory).reduce((sum, n) => sum + (Number(n) || 0), 0);
            } else {
              existingProduct.stock = currentTotalStock + incomingQty;
            }

            existingProduct.updatedAt = itemTimestamp;
            if (existingProduct.stock > 0) existingProduct.available = true;
            touchedProducts.push(existingProduct);
            updatedCount++;
          } else {
            const newP = Store.addProduct({
              name: item.name,
              description: item.description || "",
              barcode: item.barcode,
              sku: item.barcode,
              price: item.price,
              oldPrice: 0,
              stock: item.stock,
              categoryId: item.categoryId,
              colors: cleanColors,
              sizes: cleanSizes,
              inventory: cleanInventory,
              image: finalImgUrl,
              images: [],
              available: true,
              featured: false,
              isNew: true,
              isOffer: false,
              createdAt: itemTimestamp,
              updatedAt: itemTimestamp
            });
            if (newP) {
              newP.createdAt = itemTimestamp;
              newP.updatedAt = itemTimestamp;
              touchedProducts.push(newP);
              addedCount++;
            }
          }
        }

        const savedOk = await Promise.race([
          Store.saveProducts(Store.getProducts()),
          new Promise(res => setTimeout(() => res("timeout"), 90000))
        ]);
        if (savedOk === "timeout") {
          hideProcessLoader();
          showToast("الحفظ في Firebase يتأخر أكثر من 90 ثانية. تحقق من الاتصال ثم حدّث الصفحة وتأكد من ظهور المنتجات قبل إعادة المحاولة.", "error");
          return;
        }
        if (savedOk === false) {
          // كان الكود يعلن النجاح حتى لو رفض الخادم الكتابة
          hideProcessLoader();
          showToast(writeFailureMessage("تعذّر حفظ المنتجات على الخادم، لم يُحفظ شيء."), "error");
          return;
        }
        await syncProductsToAlgolia(touchedProducts);

        hideProcessLoader();
        renderProductsTable();
        renderStats();
        recordImportDone();
        showToast(`تم بنجاح! تمت إضافة (${addedCount}) منتج وتحديث رصيد (${updatedCount}) منتج. 🚀` + (imgFailed ? ` ⚠️ تعذّر رفع ${imgFailed} صورة فحُفظت تلك المنتجات بلا صورة.` : ""), imgFailed ? "error" : "success");
        closeModal();
      } catch (err) {
        hideProcessLoader();
        console.error(err);
        showToast("حدث خطأ أثناء حفظ البيانات: " + err.message, "error");
      }
    };
    saveBtn.addEventListener("click", async () => {
      if (_batchSaving) return;
      _batchSaving = true;
      saveBtn.disabled = true;
      try { await _doBatchSave(); } finally { _batchSaving = false; saveBtn.disabled = false; }
    });
  }
}

// دالة توحيد المطابقة وفتح شاشة المراجعة (مع تنقية وتثبيت روابط الصور ومطابقة الأقسام)
// المنتج الموجود في المتجر المطابق لسطر مستورد: بالباركود أولاً ثم بالاسم بعد التوحيد
function findExistingFor(item, existingProducts) {
  const cleanItemName = cleanNameForMatch(item.name);
  return (existingProducts || []).find(p => {
    if (item.barcode && (p.barcode === item.barcode || p.sku === item.barcode)) return true;
    return !!(p.name && cleanItemName && cleanNameForMatch(p.name) === cleanItemName);
  });
}

// بعد الاستخراج: (1) بحث Google عن المواصفات الرسمية والألوان والمقاسات والقسم (aiEnrich)، (2) شرح إعلاني لكل منتج بقي بلا وصف.
// أي فشل هنا لا يوقف الاستيراد: تُفتح المراجعة مع تحذير. لا بحث عن صور ولا تعديل لمنتجات المتجر الموجودة.
async function enrichAndOpen(rawItems, modalTitle, warnings) {
  const warn = Array.isArray(warnings) ? warnings.slice() : [];
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  let items = rawItems;
  if (cfg.aiEnabled !== false && window.StoreAI) {
    const existing = Store.getAdminProducts();
    // لا نكتب/نبحث لسطر عنده وصف من الملف، ولا لمنتج موجود في المتجر بوصف (حتى لا نبدّل وصفاً كتبه المدير)
    const hasDesc = it => { const ex = findExistingFor(it, existing); return !!(it.description || (ex && ex.description)); };
    if (cfg.aiEnrich !== false && typeof window.StoreAI.enrichItems === "function") {
      try {
        showProcessLoader("جارٍ البحث عن المواصفات الرسمية 🔎", ["جارٍ البحث عن المنتجات في الإنترنت..."]);
        const budgetSec = Math.max(5, Math.min(120, Number(cfg.aiEnrichBudgetSec) || 20));
        const res = await window.StoreAI.enrichItems(items, categoryLabels(), {
          skip: hasDesc,
          budgetMs: budgetSec * 1000,   // سقف زمني للبحث كله: ما لم يكتمل يُترك ويُكتب له شرح إعلاني
          onProgress: (d, t) => showProcessLoader("جارٍ البحث عن المواصفات الرسمية 🔎", ["جارٍ البحث عن المنتجات: " + d + " من " + t + " (حتى " + budgetSec + " ثانية)"])
        });
        items = res.items;
        (res.warnings || []).forEach(w => console.warn("[إثراء]", w));   // لا تُعرض للمدير: كل بطاقة تحمل شارتها (لم يُعثر/ثقة)
      } catch (e) {
        console.warn("[إثراء] تعذّر البحث عن المواصفات الرسمية:", e);
      }
    }
    if (typeof window.StoreAI.completeDescriptions === "function") {
      try {
        showProcessLoader("جارٍ كتابة أوصاف المنتجات ✍️", ["جارٍ كتابة الشرح الإعلاني للمنتجات..."]);
        const res = await window.StoreAI.completeDescriptions(items, {
          skip: it => { const ex = findExistingFor(it, existing); return !!(ex && ex.description); },
          onProgress: (d, t) => showProcessLoader("جارٍ كتابة أوصاف المنتجات ✍️", ["جارٍ كتابة الشرح الإعلاني: " + d + " من " + t])
        });
        items = res.items;
        (res.warnings || []).forEach(w => console.warn("[أوصاف]", w));
      } catch (e) {
        console.warn("[أوصاف] تعذّر كتابة الأوصاف تلقائياً:", e);
      }
    }
  }
  processAndOpenBatchReview(items, modalTitle, warn);
}

function processAndOpenBatchReview(rawItems, modalTitle, warnings) {
  const existingProducts = Store.getAdminProducts();
  const categories = Store.getCategories();

  const mappedItems = rawItems.map(item => {
    const existing = findExistingFor(item, existingProducts);

    let matchedCatId = existing ? existing.categoryId : "";
    if (!matchedCatId && item.category) {
      const foundCat = matchCategory(item.category, categories);
      if (foundCat) matchedCatId = foundCat.id;
    }

    const existingColors = existing && existing.colors ? existing.colors.map(c => c.name) : [];
    const existingSizes = existing && existing.sizes ? existing.sizes : [];

    // تنقية الألوان واستبعاد الأوصاف الشفافة أو المائية
    const rawColorsList = (item.colors && item.colors.length) ? item.colors : existingColors;
    const filteredColors = (rawColorsList || [])
      .map(c => cleanColorName(String(c)))
      .filter(c => c && !isTransparentOrInvalidColor(c));

    // تنقية وتثبيت رابط الصورة
    let cleanImageUrl = (item.image || "").trim();
    if (cleanImageUrl) {
      const urlMatch = cleanImageUrl.match(/https?:\/\/[^\s"'<>]+/);
      cleanImageUrl = urlMatch ? urlMatch[0] : (cleanImageUrl.startsWith("http") ? cleanImageUrl : "");
    }
    if (!cleanImageUrl && existing) {
      cleanImageUrl = existing.image || "";
    }

    return {
      name: item.name,
      category: String(item.category || "").split("›").pop().trim(),   // اسم الفرعي فقط إن لم يُطابق (لا ننشئ قسماً اسمه «أب › فرعي»)
      categoryId: matchedCatId,
      price: item.price || (existing ? existing.price : 0),
      stock: Number.isFinite(Number(item.qty)) ? Number(item.qty) : 1,
      currentStock: existing ? (Number(existing.stock) || 0) : null,
      barcode: item.barcode || (existing ? (existing.barcode || existing.sku) : ""),
      description: item.description || (existing ? existing.description : ""),
      colors: filteredColors,
      sizes: (item.sizes && item.sizes.length) ? item.sizes : existingSizes,
      image: cleanImageUrl,
      existingId: existing ? existing.id : "",
      colorHex: item.colorHex || {},
      enriched: item.enriched || null,
      descKind: item.description ? (item.descKind || "") : ""
    };
  });

  hideProcessLoader();
  renderBatchReviewCards(mappedItems, modalTitle);
  const warnList = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  if (warnList.length) {
    // التحذيرات تبقى ظاهرة في رأس نافذة المراجعة (لا تختفي مع التوست) كي لا يحفظ المدير ناقصاً دون أن يعلم
    const statusText = document.getElementById("shelfScanStatus");
    if (statusText) statusText.textContent += " — ⚠️ " + warnList.join(" • ");
    showToast(`تم استخراج ${mappedItems.length} صنف، لكن: ${warnList[0]}${warnList.length > 1 ? " (+" + (warnList.length - 1) + " تنبيه)" : ""}`, "error");
  } else {
    showToast(`تم استخراج ${mappedItems.length} صنف بنجاح ✨`, "success");
  }
}

/* ---------------------------------------------------------------------- */
/* 4) ربط زر استيراد الإكسل المباشر ليعمل بنفس دقة الذكاء الاصطناعي        */
/* ---------------------------------------------------------------------- */
function wireExcelSync() {
  const fileInput = document.getElementById("excelSyncInput");
  if (!fileInput || fileInput.dataset.wired) return;
  fileInput.dataset.wired = "1";

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await handleExcelFileWithAI(file);
    } finally {
      fileInput.value = "";
    }
  });
}

/* ---------------------------------------------------------------------- */
/* رفع ومعالجة الصور عبر ImgBB و ImageKit CDN                             */
/* ---------------------------------------------------------------------- */
// تصغير الصورة قبل الرفع: صور الهاتف 5–12MB كانت تُرفض (>4MB) أو تبقى ترفع دقائق على شبكة الجوال.
// الضلع الأطول ≤ 1600px (البانر 2000) وJPEG 0.85؛ ImageKit يحوّلها لاحقاً إلى WebP.
async function compressImageForUpload(file, maxSide) {
  try {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || "")) return file;
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode")); i.src = url; }).finally(() => URL.revokeObjectURL(url));
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size <= 700 * 1024) return file;       // صغيرة أصلاً
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch (e) {
    return file;                                                    // فشل التصغير ← نرفع الأصل كما كان
  }
}

async function uploadToImgBB(file, isBanner = false) {
  if (!file) throw new Error("لم يتم اختيار ملف");
  file = await compressImageForUpload(file, isBanner ? 2000 : 1600);

  const MAX_SIZE_MB = 4;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  if (file.size > MAX_SIZE_BYTES) {
    const currentMB = (file.size / (1024 * 1024)).toFixed(1);
    const errorMsg = `حجم الصورة كبير جداً (${currentMB}MB)! الحد الأقصى هو ${MAX_SIZE_MB}MB.`;
    showToast(errorMsg, "error");
    throw new Error(errorMsg);
  }

  const apiKey = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.imgbbApiKey || "").trim();
  if (!apiKey || apiKey === "YOUR_IMGBB_KEY") {
    throw new Error("لم يتم ضبط مفتاح imgbbApiKey في js/config.js.");
  }

  // مهلة 45 ثانية + محاولة ثانية: بدونها يبقى الرفع معلّقاً إلى الأبد إذا توقف الاتصال (كان شاشة «جارٍ الحفظ» لا تنتهي)
  let data = null, lastErr = null;
  for (let attempt = 0; attempt < 2 && !(data && data.success); attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const formData = new FormData();
      formData.append("image", file, file.name || "image.jpg");
      const response = await fetch("https://api.imgbb.com/1/upload?key=" + encodeURIComponent(apiKey), {
        method: "POST", body: formData, signal: ctrl.signal
      });
      data = await response.json();
      if (!data.success) lastErr = new Error((data.error && data.error.message) || "فشل رفع الصورة إلى ImgBB.");
    } catch (e) {
      data = null;
      lastErr = (e && e.name === "AbortError") ? new Error("انتهت مهلة رفع الصورة (اتصال بطيء).") : new Error("تعذّر الاتصال بـ ImgBB. تحقق من الإنترنت.");
    } finally { clearTimeout(timer); }
  }
  if (!data || !data.success) throw lastErr || new Error("فشل رفع الصورة إلى ImgBB.");

  const rawUrl = data.data.url;
  const imageKitEndpoint = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.imageKitEndpoint || "").trim().replace(/\/+$/, "");

  if (!imageKitEndpoint || imageKitEndpoint.includes("YOUR_ID")) {
    return rawUrl;
  }

  const match = rawUrl.match(/^https?:\/\/i\.ibb\.co\/(.+)$/);
  if (!match) return rawUrl;

  const transform = isBanner ? "tr:w-1400,q-90,f-webp" : "tr:w-900,q-85,f-webp";
  return imageKitEndpoint + "/" + transform + "/" + match[1];
}

/* ---------------------------------------------------------------------- */
/* التنقل والقائمة الجانبية                                              */
/* ---------------------------------------------------------------------- */
function wireSidebarNav() {
  const buttons = document.querySelectorAll(".admin-nav button[data-panel]");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      buttons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll(".admin-panel-view").forEach(function (p) { p.style.display = "none"; });
      document.getElementById("panel-" + btn.dataset.panel).style.display = "block";
      
      const sidebar = document.querySelector(".admin-sidebar");
      const overlay = document.querySelector(".sidebar-overlay");
      if (sidebar) sidebar.classList.remove("active", "open");
      if (overlay) overlay.classList.remove("active");
    });
  });
}

window.toggleAdminSidebar = function() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
};

/* ---------------------------------------------------------------------- */
/* لوحة الإحصائيات                                                       */
/* ---------------------------------------------------------------------- */
function renderStats() {
  renderOutOfStock();
  const products = Store.getAdminProducts();
  const outOfStock = products.filter(function (p) { return !Store.isProductAvailable(p); }).length;
  const stats = [
    { num: products.length, label: "إجمالي المنتجات" },
    { num: Store.getCategories().length, label: "الأقسام" },
    { num: outOfStock, label: "منتجات غير متوفرة" },
    { num: Store.getOrders().length, label: "طلبات عبر واتساب" }
  ];
  const el = document.getElementById("statsRow");
  if (!el) return;
  el.innerHTML = stats.map(function (s) {
    return '<div class="stat-card"><div class="num">' + s.num + '</div><div class="label">' + s.label + "</div></div>";
  }).join("");
}

/* ---------------------------------------------------------------------- */
/* جدول المنتجات (مع فرز الأحدث أولاً دائماً)                             */
/* ---------------------------------------------------------------------- */
const ADMIN_PRODUCTS_PAGE_SIZE = 40;
let adminProductsShown = ADMIN_PRODUCTS_PAGE_SIZE;
let adminProductsLastQuery = "";
let adminProductsSearchTimer = null;

function adminProductMatches(p, q) {
  return (p.name && String(p.name).toLowerCase().includes(q)) ||
         (p.barcode && String(p.barcode).toLowerCase().includes(q)) ||
         (p.sku && String(p.sku).toLowerCase().includes(q));
}

function adminProductRowHtml(p) {
  const thumbUrl = (typeof window.getIkUrl === "function" && p.image) ? window.getIkUrl(p.image, 96, 60) : (p.image || "");
  const img = thumbUrl
    ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" width="44" height="44" loading="lazy" decoding="async" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">'
    : '<div class="admin-table-icon">' + iconSvg("box") + "</div>";
  const statusPill = Store.isProductAvailable(p)
    ? '<span class="pill pill-ok">متوفر</span>'
    : '<span class="pill pill-off" style="color: var(--error); background: var(--error-bg); border: 1px solid var(--error-line); font-weight: bold;">غير متوفر</span>';

  const tags = [];
  if (p.featured) tags.push("مميز");
  if (p.isNew) tags.push("جديد");
  if (p.isOffer) tags.push("عرض🔥");

  const code = p.barcode || p.sku;
  const barcodeDisplay = code
    ? '<span style="font-family:monospace; background:var(--olive-50); padding:3px 8px; border-radius:6px; border:1px solid var(--line); font-size:0.85rem;">' + escapeHtml(code) + "</span>"
    : '<span style="color:var(--ink-300); font-size:0.85rem;">—</span>';

  const id = escapeHtml(p.id);
  return (
    "<tr>" +
      "<td>" + img + "</td>" +
      "<td>" + barcodeDisplay + "</td>" +
      "<td>" + escapeHtml(p.name) + (tags.length ? ' <span class="field-hint" style="color:var(--danger);">(' + tags.join(" / ") + ")</span>" : "") + "</td>" +
      "<td>" + escapeHtml(Store.getCategoryName(p.categoryId)) + "</td>" +
      "<td>" + formatPrice(p.price) + "</td>" +
      "<td>" + p.stock + "</td>" +
      "<td>" + statusPill + "</td>" +
      '<td class="row-actions">' +
        '<button class="btn-icon btn-sm" title="تعديل" data-act="edit" data-id="' + id + '">' + iconSvg("edit") + "</button>" +
        '<button class="btn-icon btn-sm" title="حذف" data-act="del" data-id="' + id + '">' + iconSvg("trash") + "</button>" +
      "</td>" +
    "</tr>"
  );
}

function oosReasonOf(p) {
  if (p.available === false) return "hidden";
  return "stock";
}

function renderOutOfStock() {
  const all = Store.getAdminProducts().filter(Boolean).filter(function (p) { return !Store.isProductAvailable(p); });
  const badge = document.getElementById("oosBadge");
  if (badge) badge.textContent = String(all.length);
  const count = document.getElementById("oosCount");
  if (count) count.textContent = String(all.length);

  const tbody = document.getElementById("oosTableBody");
  if (!tbody) return;
  const query = ((document.getElementById("oosSearch") || {}).value || "").trim().toLowerCase();
  const reason = (document.getElementById("oosReason") || {}).value || "";
  const rows = all.filter(function (p) {
    if (reason && oosReasonOf(p) !== reason) return false;
    return !query || adminProductMatches(p, query);
  });
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--ink-300);">' +
      (all.length ? "لا توجد نتائج مطابقة" : "🎉 لا توجد منتجات نافدة — كل المنتجات متوفرة") + "</td></tr>";
    return;
  }
  tbody.innerHTML = rows.map(function (p) {
    const thumbUrl = (typeof window.getIkUrl === "function" && p.image) ? window.getIkUrl(p.image, 96, 60) : (p.image || "");
    const img = thumbUrl
      ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" width="44" height="44" loading="lazy" decoding="async" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">'
      : '<div class="admin-table-icon">' + iconSvg("box") + "</div>";
    const code = p.barcode || p.sku;
    const barcode = code
      ? '<span style="font-family:monospace; background:var(--olive-50); padding:3px 8px; border-radius:6px; border:1px solid var(--line); font-size:0.85rem;">' + escapeHtml(code) + "</span>"
      : '<span style="color:var(--ink-300); font-size:0.85rem;">—</span>';
    const why = oosReasonOf(p) === "hidden"
      ? '<span class="pill pill-warn">مخفي يدوياً (غير متاح)</span>'
      : '<span class="pill pill-off">نفدت الكمية (' + (Store.getTotalStock ? Store.getTotalStock(p) : 0) + ")</span>";
    const id = escapeHtml(p.id);
    return "<tr><td>" + img + "</td><td>" + barcode + "</td><td>" + escapeHtml(p.name) + "</td>" +
      "<td>" + escapeHtml(Store.getCategoryName(p.categoryId)) + "</td><td>" + formatPrice(p.price) + "</td><td>" + why + "</td>" +
      '<td class="row-actions"><button class="btn-icon btn-sm" title="تعديل / تحديث الكمية" data-act="edit" data-id="' + id + '">' + iconSvg("edit") + "</button></td></tr>";
  }).join("");
}

function wireOutOfStock() {
  const tbody = document.getElementById("oosTableBody");
  if (tbody && !tbody.dataset.wired) {
    tbody.dataset.wired = "1";
    tbody.addEventListener("click", function (e) {
      const btn = e.target.closest ? e.target.closest("button[data-act=edit]") : null;
      if (btn) openProductForEdit(btn.dataset.id);
    });
  }
  const search = document.getElementById("oosSearch");
  if (search && !search.dataset.wired) {
    search.dataset.wired = "1";
    let t = null;
    search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(renderOutOfStock, 200); });
  }
  const sel = document.getElementById("oosReason");
  if (sel && !sel.dataset.wired) { sel.dataset.wired = "1"; sel.addEventListener("change", renderOutOfStock); }
}

function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;

  const query = ((document.getElementById("adminProductSearch") || {}).value || "").trim().toLowerCase();
  if (query !== adminProductsLastQuery) {
    adminProductsLastQuery = query;
    adminProductsShown = ADMIN_PRODUCTS_PAGE_SIZE;
  }

  let products = Store.getAdminProducts().filter(Boolean);
  if (query) products = products.filter(function (p) { return adminProductMatches(p, query); });

  // فرز المنتجات تنازلياً ليظهر الأحدث إضافتاً أو تعديلاً أولاً دائماً
  products.sort((a, b) => {
    const timeA = Number(a.createdAt || a.updatedAt || 0);
    const timeB = Number(b.createdAt || b.updatedAt || 0);
    return timeB - timeA;
  });

  const total = products.length;
  if (!total) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد منتجات</td></tr>';
    return;
  }

  const visible = products.slice(0, adminProductsShown);
  let html = visible.map(adminProductRowHtml).join("");
  if (total > visible.length) {
    html += '<tr class="admin-more-row"><td colspan="8" style="text-align:center;padding:16px;">' +
      '<button type="button" class="btn btn-outline btn-sm" data-act="more">عرض المزيد (' + visible.length + " من " + total + ")</button>" +
      "</td></tr>";
  }
  tbody.innerHTML = html;
}

function wireProductsTableEvents() {
  const tbody = document.getElementById("productsTableBody");
  if (tbody && !tbody.dataset.wired) {
    tbody.dataset.wired = "1";
    tbody.addEventListener("click", function (e) {
      const btn = e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "more") {
        adminProductsShown += ADMIN_PRODUCTS_PAGE_SIZE;
        renderProductsTable();
      } else if (act === "edit") {
        openProductForEdit(btn.dataset.id);
      } else if (act === "del") {
        deleteProductConfirm(btn.dataset.id);
      }
    });
  }
  const search = document.getElementById("adminProductSearch");
  if (search && !search.dataset.wired) {
    search.dataset.wired = "1";
    search.addEventListener("input", function () {
      clearTimeout(adminProductsSearchTimer);
      adminProductsSearchTimer = setTimeout(renderProductsTable, 250);
    });
  }
}

async function deleteProductConfirm(id) {
  const product = Store.getAdminProduct(id);
  if (!product) return;
  if (confirm('هل تريد حذف المنتج "' + product.name + '"؟ لا يمكن التراجع عن هذا الإجراء.')) {
    if (!ensureProductsWritable()) return;
    const ok = await Store.deleteProduct(id);
    if (ok === false) {
      showToast("تعذّر حذف المنتج من الخادم.", "error");
      renderProductsTable();
      return;
    }
    await deleteProductFromAlgolia(id);
    renderProductsTable();
    renderStats();
    showToast("تم حذف المنتج", "success");
  }
}

function populateCategorySelect() {
  const select = document.getElementById("productCategorySelect");
  if (!select) return;
  select.innerHTML = Store.getCategories().map(function (c) {
    return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + "</option>";
  }).join("");
}

/* ---------------------------------------------------------------------- */
/* إدارة الألوان والمقاسات والمودال                                       */
/* ---------------------------------------------------------------------- */
function currentSizesFromInput() {
  const input = document.getElementById("productSizes");
  if (!input) return [];
  return input.value.split(",").map(function (s) { return safeVariantName(s); }).filter(function (s) { return s.length > 0; });
}

function renderColorsList() {
  const list = document.getElementById("colorsList");
  if (!list) return;

  if (!pendingColors.length) {
    list.innerHTML = '<p class="field-hint" style="margin:0;">لا يوجد ألوان مضافة. اضغط "+ إضافة لون" إن كان المنتج يحتاج تمييزًا بالألوان.</p>';
  } else {
    list.innerHTML = pendingColors.map(function (c, idx) {
      return (
        '<div class="color-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:15px;background:var(--olive-50);padding:15px;border-radius:8px;border:1px solid var(--line);margin-bottom:10px;">' +
          '<div style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:5px;">' +
            '<label style="font-size:0.8rem;color:var(--ink-400);">اسم اللون</label>' +
            '<input type="text" placeholder="مثال: أسود" value="' + escapeHtml(c.name || "") + '" data-color-idx="' + idx + '" class="color-name-input" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;background:#fff;">' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:5px;align-items:center;">' +
            '<label style="font-size:0.8rem;color:var(--ink-400);">الدرجة</label>' +
            '<input type="color" value="' + escapeHtml(/^#[0-9a-fA-F]{6}$/.test(c.hex || "") ? c.hex : "#2563eb") + '" data-color-idx="' + idx + '" class="color-hex-input" style="width:38px;height:38px;padding:0;border:none;cursor:pointer;border-radius:50%;">' +
          '</div>' +
          '<div class="image-upload" style="margin:0;display:flex;flex-direction:column;gap:5px;min-width:120px;">' +
            '<label style="font-size:0.8rem;color:var(--ink-400);">صورة اللون (اختياري)</label>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<div class="preview" id="colorImgPreview_' + idx + '" style="width:38px;height:38px;border-radius:6px;overflow:hidden;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;background:#fff;">' + 
                (c.image ? '<img src="' + escapeHtml(c.image) + '" style="width:100%;height:100%;object-fit:cover;">' : iconSvg("box")) + 
              '</div>' +
              '<input type="file" accept="image/*" class="color-image-input" data-color-idx="' + idx + '" style="width:90px;font-size:0.8rem;">' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:flex-end;height:100%;padding-bottom:2px;">' +
            '<button type="button" class="btn-icon btn-sm" style="color:var(--danger);background:var(--error-bg);border-radius:6px;width:38px;height:38px;" title="حذف اللون" onclick="removeColorRow(' + idx + ')">' + iconSvg("trash") + '</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  list.querySelectorAll(".color-name-input").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const idx = Number(this.dataset.colorIdx);
      const oldName = pendingColors[idx].name;
      const newName = this.value;

      if (oldName && oldName !== newName) {
        Object.keys(pendingInventory).forEach(function(key) {
          if (key.startsWith(oldName + "||")) {
            const newKey = key.replace(oldName + "||", newName + "||");
            pendingInventory[newKey] = pendingInventory[key];
            delete pendingInventory[key];
          }
        });
      }

      pendingColors[idx].name = newName;
      pendingColors[idx].hex = getColorHex(newName);
      const hexInp = list.querySelector(`.color-hex-input[data-color-idx="${idx}"]`);
      if (hexInp) hexInp.value = pendingColors[idx].hex;
      renderInventoryGrid();
    });
  });

  // عند مغادرة الحقل: اسم مكتوب ككود (E07A5F) يتحول لاسم عربي مع درجته (والمخزون يتبع الاسم الجديد)
  list.querySelectorAll(".color-name-input").forEach(function (inp) {
    inp.addEventListener("change", function () {
      const fixed = repairHexColorNames(pendingColors, pendingInventory);
      const changed = fixed.colors.some(function (c, i) { return c !== pendingColors[i]; });
      if (!changed) return;
      pendingColors = fixed.colors;
      pendingInventory = fixed.inventory;
      renderColorsList();
    });
  });

  list.querySelectorAll(".color-hex-input").forEach(function (inp) {
    inp.addEventListener("input", function () {
      pendingColors[Number(this.dataset.colorIdx)].hex = this.value;
    });
  });

  list.querySelectorAll(".color-image-input").forEach(function (inp) {
    inp.addEventListener("change", async function () {
      const idx = Number(this.dataset.colorIdx);
      const file = this.files[0];
      if (!file) return;
      try {
        showToast("جاري رفع صورة اللون...");
        const url = await uploadToImgBB(file, false);
        pendingColors[idx].image = url;
        showToast("تم رفع الصورة بنجاح!", "success");
        renderColorsList();
      } catch (err) {
        showToast(err.message || "فشل رفع الصورة.", "error");
      }
    });
  });

  renderInventoryGrid();
}

window.removeColorRow = function (idx) {
  pendingColors.splice(idx, 1);
  renderColorsList();
};

function inventoryKeyFor(color, size) {
  return (color || "_") + "||" + (size || "_");
}

function renderInventoryGrid() {
  const wrap = document.getElementById("inventoryWrap");
  const grid = document.getElementById("inventoryGrid");
  const stockInput = document.getElementById("productStock");
  const stockLabel = document.getElementById("productStockLabel");
  if (!wrap || !grid) return;

  const colors = pendingColors
    .filter(function (c) { return c.name && c.name.trim() && !isTransparentOrInvalidColor(c.name); })
    .map(function (c) { return cleanColorName(c.name.trim()); });
  const sizes = currentSizesFromInput();
  const hasMatrix = colors.length > 0 || sizes.length > 0;

  if (!hasMatrix) {
    wrap.style.display = "none";
    grid.innerHTML = "";
    if (stockInput) { stockInput.readOnly = false; }
    if (stockLabel) stockLabel.textContent = "الكمية المتوفرة الكلية";
    return;
  }

  wrap.style.display = "block";
  const rowKeys = colors.length ? colors : [null];
  const colKeys = sizes.length ? sizes : [null];

  let html = '<table style="width:100%;border-collapse:collapse;font-size:.85rem;">';
  html += "<tr><th style='text-align:right;padding:6px;width:1%;white-space:nowrap;'></th>" + colKeys.map(function (s) { return "<th style='padding:6px;text-align:center;'>" + escapeHtml(s || "الكمية") + "</th>"; }).join("") + "</tr>";
  rowKeys.forEach(function (color) {
    html += "<tr><td style='padding:6px;font-weight:600;text-align:right;width:1%;white-space:nowrap;'>" + escapeHtml(color || "الكمية") + "</td>";
    colKeys.forEach(function (size) {
      const key = inventoryKeyFor(color, size);
      const val = Number(pendingInventory[key]) || 0;
      html += "<td style='padding:4px;text-align:center;'><input type='number' min='0' value='" + (Number(val) || 0) + "' data-inv-key='" + escapeHtml(key) + "' class='inventory-cell' style='width:70px;padding:6px;'></td>";
    });
    html += "</tr>";
  });
  html += "</table>";
  grid.innerHTML = html;

  grid.querySelectorAll(".inventory-cell").forEach(function (inp) {
    inp.addEventListener("input", function () {
      pendingInventory[this.dataset.invKey] = Number(this.value) || 0;
      updateComputedStock();
    });
  });

  if (stockLabel) stockLabel.textContent = "إجمالي المخزون (محسوب تلقائيًا من الألوان/المقاسات)";
  if (stockInput) stockInput.readOnly = true;
  updateComputedStock();
}

function updateComputedStock() {
  const stockInput = document.getElementById("productStock");
  if (!stockInput) return;
  const total = Object.values(pendingInventory).reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
  stockInput.value = total;
}

function wireProductModal() {
  const addBtn = document.getElementById("addProductBtn");
  if (addBtn) addBtn.addEventListener("click", function () { openProductModal(null); });

  const closeBtn = document.getElementById("closeProductModal");
  if (closeBtn) closeBtn.addEventListener("click", closeProductModal);

  const form = document.getElementById("productForm");
  if (form) form.addEventListener("submit", saveProductForm);

  const imageInput = document.getElementById("productImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", async function () {
      const file = imageInput.files[0];
      if (!file) return;
      
      try {
        showToast("جاري رفع الصورة بدقة عالية...");
        const imageUrl = await uploadToImgBB(file, false);
        pendingProductImage = imageUrl;
        document.getElementById("productImagePreview").innerHTML = '<img src="' + escapeHtml(imageUrl) + '">';
        showToast("تم رفع الصورة بنجاح!", "success");
      } catch (error) {
        console.error("Upload Error:", error);
        showToast(error.message || "فشل رفع الصورة.", "error");
      }
    });
  }

  const removeImgBtn = document.getElementById("removeProductImageBtn");
  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", function () {
      pendingProductImage = null;
      if (document.getElementById("productImageInput")) {
        document.getElementById("productImageInput").value = "";
      }
      document.getElementById("productImagePreview").innerHTML = iconSvg("box");
    });
  }

  const addColorBtn = document.getElementById("addColorBtn");
  if (addColorBtn) {
    addColorBtn.addEventListener("click", function () {
      const defaultName = "لون " + (pendingColors.length + 1);
      pendingColors.push({ name: defaultName, hex: "#2563eb", image: null });
      renderColorsList();
    });
  }

  const sizesInput = document.getElementById("productSizes");
  if (sizesInput) {
    sizesInput.addEventListener("input", renderInventoryGrid);
  }

  const btnAiGenDesc = document.getElementById("btnAiGenDesc");
  if (btnAiGenDesc && !btnAiGenDesc.dataset.wired) {
    btnAiGenDesc.dataset.wired = "true";
    btnAiGenDesc.addEventListener("click", async () => {
      const nameInput = document.getElementById("productName");
      const descInput = document.getElementById("productDescription");
      const catSelect = document.getElementById("productCategorySelect");

      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        showToast("يرجى كتابة اسم المنتج أولاً", "error");
        if (nameInput) nameInput.focus();
        return;
      }

      const catText = catSelect && catSelect.selectedIndex >= 0 && catSelect.options[catSelect.selectedIndex]
        ? catSelect.options[catSelect.selectedIndex].text
        : "";
      const originalText = btnAiGenDesc.innerHTML;

      btnAiGenDesc.disabled = true;
      btnAiGenDesc.innerHTML = "جاري التوليد... ⏳";

      try {
        if (!window.StoreAI || typeof window.StoreAI.generateDescription !== "function") {
          throw new Error("ملف js/ai.js غير محمل أو غير معرف");
        }
        const generated = await window.StoreAI.generateDescription(name, catText);
        if (descInput) {
          descInput.value = generated;
          descInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        showToast("تم توليد الوصف بنجاح ✨", "success");
      } catch (err) {
        console.error(err);
        showToast(err.message || "تعذر توليد الوصف", "error");
      } finally {
        btnAiGenDesc.disabled = false;
        btnAiGenDesc.innerHTML = originalText;
      }
    });
  }
}

window.removeExtraImage = function(index) {
  if (!confirm("هل أنت متأكد من حذف هذه الصورة؟")) return;
  if (editingProductId) {
    if (!ensureProductsWritable()) return;
    const p = Store.getProduct(editingProductId);
    if (p && p.images) {
      p.images.splice(index, 1);
      Store.updateProduct(editingProductId, { images: p.images }).then(function (ok) {
        if (ok === false) showToast("تعذّر حفظ حذف الصورة على الخادم", "error");
      });
      openProductModal(editingProductId);
      showToast("تم حذف الصورة الإضافية", "success");
    }
  }
};

function openProductModal(productId) {
  editingProductId = productId;
  pendingProductImage = null;
  pendingColors = [];
  pendingSizes = [];
  pendingInventory = {};
  populateCategorySelect();

  const modal = document.getElementById("productModal");
  const title = document.getElementById("productModalTitle");
  const form = document.getElementById("productForm");
  form.reset();

  const preview = document.getElementById("productImagePreview");
  const extraImagesInput = document.getElementById("productExtraImagesInput");
  const extraImagesPreview = document.getElementById("extraImagesPreview");
  if (extraImagesInput) extraImagesInput.value = "";
  if (extraImagesPreview) extraImagesPreview.innerHTML = "";

  if (productId) {
    const p = Store.getProduct(productId);
    title.textContent = "تعديل المنتج";
    if (document.getElementById("productBarcode")) document.getElementById("productBarcode").value = p.barcode || p.sku || "";
    document.getElementById("productName").value = p.name;
    document.getElementById("productDescription").value = p.description || "";
    document.getElementById("productPrice").value = p.price;
    if (document.getElementById("productOldPrice")) document.getElementById("productOldPrice").value = p.oldPrice || "";
    document.getElementById("productCategorySelect").value = p.categoryId;
    document.getElementById("productStock").value = p.stock;
    
    document.getElementById("productAvailable").checked = p.available;
    document.getElementById("productFeatured").checked = !!p.featured;
    document.getElementById("productNew").checked = !!p.isNew;
    if (document.getElementById("productOffer")) document.getElementById("productOffer").checked = !!p.isOffer; 
    
    pendingProductImage = p.image || null;
    preview.innerHTML = p.image ? '<img src="' + escapeHtml(p.image) + '">' : iconSvg("box");
    
    if (p.images && p.images.length > 0 && extraImagesPreview) {
      extraImagesPreview.innerHTML = p.images.map((img, idx) => `
        <div style="position:relative; display:inline-block; margin-left:10px; margin-bottom:10px;">
          <img src="${escapeHtml(img)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line-strong);">
          <button type="button" onclick="removeExtraImage(${idx})" title="حذف الصورة" style="position:absolute; top:-6px; right:-6px; background:var(--danger); color:#fff; border:none; border-radius:50%; width:22px; height:22px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);">×</button>
        </div>
      `).join('');
    }

    pendingColors = (p.colors || [])
      .filter(c => !isTransparentOrInvalidColor(c.name))
      .map(function (c) { return Object.assign({}, c, { hex: c.hex || getColorHex(c.name) }); });
    pendingSizes = (p.sizes || []).slice();
    pendingInventory = Object.assign({}, p.inventory || {});
    { const fixed = repairHexColorNames(pendingColors, pendingInventory); pendingColors = fixed.colors; pendingInventory = fixed.inventory; }
    if (document.getElementById("productSizes")) document.getElementById("productSizes").value = pendingSizes.join(", ");
    renderColorsList();
  } else {
    title.textContent = "إضافة منتج جديد";
    if (document.getElementById("productBarcode")) document.getElementById("productBarcode").value = "";
    document.getElementById("productAvailable").checked = true;
    preview.innerHTML = iconSvg("box");

    if (document.getElementById("productSizes")) document.getElementById("productSizes").value = "";
    renderColorsList();
  }

  modal.classList.add("open");
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("open");
  editingProductId = null;
}

async function saveProductForm(e) {
  e.preventDefault();

  const _oldPriceEl = document.getElementById("productOldPrice");
  const _oldPriceVal = _oldPriceEl ? (Number(_oldPriceEl.value) || 0) : 0;
  const _newPriceVal = Number(document.getElementById("productPrice").value) || 0;
  const _offerOn = document.getElementById("productOffer") ? document.getElementById("productOffer").checked : false;
  if (_offerOn && _oldPriceVal && _oldPriceVal <= _newPriceVal) {
    showToast("السعر القديم يجب أن يكون أكبر من السعر الجديد", "error");
    return;
  }

  // تنقية الألوان واستبعاد أي لون شفاف أو قوام مائي
  const cleanColors = pendingColors
    .filter(function (c) { 
      return (c.name && c.name.trim() && !isTransparentOrInvalidColor(c.name)) || c.image; 
    })
    .map(function (c, idx) {
      const validName = (c.name && c.name.trim()) ? cleanColorName(c.name.trim()) : ("لون " + (idx + 1));
      return {
        name: validName,
        hex: c.hex || getColorHex(validName),
        image: c.image || null
      };
    });

  const cleanSizes = currentSizesFromInput();
  const hasMatrix = cleanColors.length > 0 || cleanSizes.length > 0;

  let cleanInventory = {};
  let totalStock = Number(document.getElementById("productStock").value) || 0;
  if (hasMatrix) {
    const rowKeys = cleanColors.length ? cleanColors.map(function (c) { return c.name; }) : [null];
    const colKeys = cleanSizes.length ? cleanSizes : [null];
    let sum = 0;
    rowKeys.forEach(function (color) {
      colKeys.forEach(function (size) {
        const key = inventoryKeyFor(color, size);
        const qty = Number(pendingInventory[key]) || 0;
        cleanInventory[key] = qty;
        sum += qty;
      });
    });
    totalStock = sum;
  }

  const extraImagesInput = document.getElementById("productExtraImagesInput");
  let extraImagesUrls = [];

  if (editingProductId) {
    const existingProduct = Store.getProduct(editingProductId);
    if (existingProduct && existingProduct.images) {
      extraImagesUrls = existingProduct.images;
    }
  }

  if (extraImagesInput && extraImagesInput.files.length > 0) {
    showToast("جاري رفع الصور الإضافية، يرجى الانتظار...");
    const uploadPromises = Array.from(extraImagesInput.files).map(file => uploadToImgBB(file, false));

    try {
      const uploadedUrls = await Promise.all(uploadPromises);
      extraImagesUrls = extraImagesUrls.concat(uploadedUrls.filter(url => url !== null));
    } catch (err) {
      showToast(err.message || "حدث خطأ أثناء رفع الصور الإضافية", "error");
      console.error(err);
      return;
    }
  }

  if (!pendingProductImage) {
    if (extraImagesUrls.length > 0) {
      pendingProductImage = extraImagesUrls.shift();
    } else if (cleanColors.length > 0) {
      const colorImg = cleanColors.find(c => c.image);
      if (colorImg) pendingProductImage = colorImg.image;
    }
  }

  const barcodeVal = document.getElementById("productBarcode") ? document.getElementById("productBarcode").value.trim() : "";

  const data = {
    barcode: barcodeVal,
    sku: barcodeVal,
    name: document.getElementById("productName").value.trim(),
    description: document.getElementById("productDescription").value.trim(),
    price: Number(document.getElementById("productPrice").value) || 0,
    oldPrice: _oldPriceVal,
    categoryId: document.getElementById("productCategorySelect").value,
    stock: totalStock,
    available: document.getElementById("productAvailable").checked,
    featured: document.getElementById("productFeatured").checked,
    isNew: document.getElementById("productNew").checked,
    isOffer: document.getElementById("productOffer") ? document.getElementById("productOffer").checked : false,
    colors: cleanColors,
    sizes: cleanSizes,
    inventory: cleanInventory,
    image: pendingProductImage,
    images: extraImagesUrls,
    updatedAt: Date.now()
  };

  if (!editingProductId) {
    data.createdAt = Date.now();
  }

  if (!data.name || !data.categoryId) {
    showToast("يرجى تعبئة اسم المنتج واختيار القسم", "error");
    return;
  }

  if (!ensureProductsWritable()) return;

  let savedProduct = null;
  if (editingProductId) {
    data.id = editingProductId;
    Store.updateProduct(editingProductId, data);
    savedProduct = Store.getProduct(editingProductId);
  } else {
    savedProduct = Store.addProduct(data);
  }

  const persisted = await Store.whenProductsSaved();
  if (persisted === false) {
    showToast(writeFailureMessage("لم يُحفظ المنتج على الخادم. النافذة مفتوحة لإعادة المحاولة."), "error");
    return;
  }
  showToast(editingProductId ? "تم تحديث المنتج" : "تمت إضافة المنتج", "success");

  if (savedProduct) {
    await syncProductsToAlgolia([savedProduct]);
  }

  closeProductModal();
  renderProductsTable();
  renderStats();
}

/* ---------------------------------------------------------------------- */
/* جداول الأقسام والإعلانات والطلبات والإعدادات                            */
/* ---------------------------------------------------------------------- */
function renderCategoriesTable() {
  const tbody = document.getElementById("categoriesTableBody");
  if (!tbody) return;
  const categories = Store.getCategories();
  const products = Store.getAdminProducts();

  if (!categories.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد أقسام</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map(function (c) {
    const count = products.filter(function (p) { return p.categoryId === c.id; }).length;
    const thumbUrl = (typeof window.getIkUrl === "function" && c.image) ? window.getIkUrl(c.image, 160, 70) : (c.image || "");
    const img = thumbUrl ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:50%;">' : '<div class="admin-table-icon">' + iconSvg(c.icon || "box") + "</div>";
    
    const parent = c.parentId ? categories.find(function(x) { return x.id === c.parentId; }) : null;
    const displayName = parent 
      ? escapeHtml(c.name) + '<br><small style="color:var(--text-2);">↳ فرعي من: ' + escapeHtml(parent.name) + '</small>' 
      : '<strong>' + escapeHtml(c.name) + '</strong>';

    return (
      "<tr>" +
        "<td>" + img + "</td>" +
        "<td>" + displayName + "</td>" +
        "<td>" + count + " منتج</td>" +
        '<td class="row-actions">' +
          '<button class="btn-icon btn-sm" title="تعديل" onclick="openCategoryModal(' + jsStr(c.id) + ')">' + iconSvg("edit") + "</button>" +
          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteCategoryConfirm(' + jsStr(c.id) + ')">' + iconSvg("trash") + "</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
}

function deleteCategoryConfirm(id) {
  const category = Store.getCategories().find(function (c) { return c.id === id; });
  if (!category) return;
  const childCount = Store.getCategories().filter(function (c) { return c.parentId === id; }).length;
  if (childCount) {
    showToast('لا يمكن حذف "' + category.name + '" لأن له ' + childCount + ' قسم فرعي.', "error");
    return;
  }
  const productsInCat = Store.getAdminProducts().filter(function (p) { return p.categoryId === id; }).length;
  const msg = productsInCat
    ? 'يوجد ' + productsInCat + ' منتج مرتبط بقسم "' + category.name + '". حذف القسم لن يحذف المنتجات لكنها ستبقى بدون قسم ظاهر. المتابعة؟'
    : 'هل تريد حذف القسم "' + category.name + '"؟';
  if (confirm(msg)) {
    Store.deleteCategory(id);
    bumpMetaVersion();
    renderCategoriesTable();
    populateCategorySelect();
    renderStats();
    showToast("تم حذف القسم", "success");
  }
}

function populateIconPicker() {
  const wrap = document.getElementById("categoryIconPicker");
  if (!wrap) return;
  wrap.innerHTML = CATEGORY_ICON_KEYS.map(function (key) {
    return '<label class="icon-choice" title="' + key + '"><input type="radio" name="categoryIcon" value="' + key + '">' +
      '<span>' + iconSvg(key) + "</span></label>";
  }).join("");
  wrap.querySelectorAll('input[name="categoryIcon"]').forEach(function (r) {
    r.addEventListener("change", syncIconPickerActive);
  });
}

function syncIconPickerActive() {
  document.querySelectorAll("#categoryIconPicker .icon-choice").forEach(function (label) {
    const input = label.querySelector("input");
    label.classList.toggle("active", !!(input && input.checked));
  });
}

function wireCategoryModal() {
  const addBtn = document.getElementById("addCategoryBtn");
  if (addBtn) addBtn.addEventListener("click", function () { openCategoryModal(null); });
  const closeBtn = document.getElementById("closeCategoryModal");
  if (closeBtn) closeBtn.addEventListener("click", closeCategoryModal);
  const form = document.getElementById("categoryForm");
  if (form) form.addEventListener("submit", saveCategoryForm);

  const imageInput = document.getElementById("categoryImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", async function () {
      const file = imageInput.files[0];
      if (!file) return;

      try {
        showToast("جاري رفع صورة القسم بدقة عالية...");
        const imageUrl = await uploadToImgBB(file, false);
        pendingCategoryImage = imageUrl;
        const preview = document.getElementById("categoryImagePreview");
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '">';
        showToast("تم الرفع بنجاح!", "success");
      } catch (error) {
        console.error("Upload Error:", error);
        showToast(error.message || "فشل رفع الصورة.", "error");
      }
    });
  }

  const removeImgBtn = document.getElementById("removeCategoryImageBtn");
  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", function () {
      pendingCategoryImage = null;
      if (document.getElementById("categoryImageInput")) {
        document.getElementById("categoryImageInput").value = "";
      }
      document.getElementById("categoryImagePreview").innerHTML = iconSvg("box");
    });
  }
}

function openCategoryModal(categoryId) {
  editingCategoryId = categoryId;
  pendingCategoryImage = null;
  populateIconPicker();
  
  const modal = document.getElementById("categoryModal");
  const title = document.getElementById("categoryModalTitle");
  const form = document.getElementById("categoryForm");
  form.reset();

  const preview = document.getElementById("categoryImagePreview");
  const nameInput = document.getElementById("categoryName");

  let parentContainer = document.getElementById("categoryParentContainer");
  if (!parentContainer) {
    parentContainer = document.createElement("div");
    parentContainer.id = "categoryParentContainer";
    parentContainer.style.marginTop = "15px";
    parentContainer.innerHTML = '<label style="display:block;margin-bottom:5px;">يتبع لقسم (اختياري - لجعله قسم فرعي)</label><select id="categoryParent" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-strong);"></select>';
    nameInput.parentNode.insertBefore(parentContainer, nameInput.nextSibling);
  }

  const parentSelect = document.getElementById("categoryParent");
  const allCats = Store.getCategories();
  
  parentSelect.innerHTML = '<option value="">-- قسم رئيسي مستقل --</option>' +
    allCats.filter(function(c) { return c.id !== categoryId && !c.parentId; })
           .map(function(c) { return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>'; }).join("");

  parentSelect.disabled = !!(categoryId && allCats.some(function (cc) { return cc.parentId === categoryId; }));

  if (categoryId) {
    const c = allCats.find(function (cc) { return cc.id === categoryId; });
    title.textContent = "تعديل القسم";
    nameInput.value = c.name;
    parentSelect.value = c.parentId || "";
    pendingCategoryImage = c.image || null;
    
    if (preview) preview.innerHTML = c.image ? '<img src="' + escapeHtml(c.image) + '">' : iconSvg(c.icon || "box");
    const radio = form.querySelector('input[name="categoryIcon"][value="' + CSS.escape(String(c.icon || "")) + '"]');
    if (radio) radio.checked = true;
    syncIconPickerActive();
  } else {
    title.textContent = "إضافة قسم جديد";
    parentSelect.value = "";
    if (preview) preview.innerHTML = iconSvg("box");
    const first = form.querySelector('input[name="categoryIcon"]');
    if (first) first.checked = true;
    syncIconPickerActive();
  }
  
  modal.classList.add("open");
}

function closeCategoryModal() {
  document.getElementById("categoryModal").classList.remove("open");
  editingCategoryId = null;
}

function saveCategoryForm(e) {
  e.preventDefault();
  const name = document.getElementById("categoryName").value.trim();
  const parentId = document.getElementById("categoryParent") ? document.getElementById("categoryParent").value : "";
  const iconInput = document.querySelector('input[name="categoryIcon"]:checked');
  const existing = editingCategoryId ? Store.getCategories().find(function (c) { return c.id === editingCategoryId; }) : null;
  const icon = iconInput ? iconInput.value : ((existing && existing.icon) || "box");

  if (!name) { showToast("يرجى إدخال اسم القسم", "error"); return; }

  if (editingCategoryId) {
    Store.updateCategory(editingCategoryId, { name: name, image: pendingCategoryImage, icon: icon, parentId: parentId });
    showToast("تم تحديث القسم", "success");
  } else {
    Store.addCategory({ name: name, image: pendingCategoryImage, icon: icon, parentId: parentId });
    showToast("تمت إضافة القسم", "success");
  }

  bumpMetaVersion();
  closeCategoryModal();
  renderCategoriesTable();
  populateCategorySelect();
}

function renderAdsTable() {
  const tbody = document.getElementById("adsTableBody");
  if (!tbody) return;
  
  const ads = Store.getAds().sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!ads.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد إعلانات حالياً</td></tr>';
    return;
  }

  tbody.innerHTML = ads.map(function (ad) {
    const thumbUrl = (typeof window.getIkUrl === "function" && ad.image) ? window.getIkUrl(ad.image, 160, 70) : (ad.image || "");
    const img = thumbUrl ? '<img src="' + escapeHtml(thumbUrl) + '" alt="" style="width:80px;height:40px;border-radius:4px;object-fit:cover;">' : '<div class="admin-table-icon">' + iconSvg("image") + "</div>";
    const link = ad.link ? '<a href="' + escapeHtml(safeUrl(ad.link)) + '" rel="noopener noreferrer" target="_blank" style="color:var(--olive-700);text-decoration:underline;">عرض الرابط</a>' : '-';
    
    return (
      "<tr>" +
        "<td>" + img + "</td>" +
        "<td>" + link + "</td>" +
        "<td>" + (ad.order || 0) + "</td>" +
        '<td class="row-actions">' +
          '<button class="btn-icon btn-sm" title="حذف" onclick="deleteAdConfirm(' + jsStr(ad.id) + ')">' + iconSvg("trash") + "</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");
}

function deleteAdConfirm(id) {
  if (confirm('هل تريد حذف هذا الإعلان؟')) {
    Store.deleteAd(id);
    bumpMetaVersion();
    renderAdsTable();
    showToast("تم حذف الإعلان", "success");
  }
}

function wireAdModal() {
  const addBtn = document.getElementById("addAdBtn");
  if (addBtn) addBtn.addEventListener("click", function () { openAdModal(); });
  
  const closeBtn = document.getElementById("closeAdModal");
  if (closeBtn) closeBtn.addEventListener("click", closeAdModal);
  
  const form = document.getElementById("adForm");
  if (form) form.addEventListener("submit", saveAdForm);

  const imageInput = document.getElementById("adImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", async function () {
      const file = imageInput.files[0];
      if (!file) return;
      try {
        showToast("جاري رفع الإعلان بدقة عالية...");
        const imageUrl = await uploadToImgBB(file, true);
        pendingAdImage = imageUrl;
        const preview = document.getElementById("adImagePreview");
        if (preview) preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">';
        showToast("تم رفع الإعلان بنجاح!", "success");
      } catch (error) {
        console.error("Upload Error:", error);
        showToast(error.message || "فشل رفع الصورة.", "error");
      }
    });
  }

  const removeImgBtn = document.getElementById("removeAdImageBtn");
  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", function () {
      pendingAdImage = null;
      if (document.getElementById("adImageInput")) {
        document.getElementById("adImageInput").value = "";
      }
      const preview = document.getElementById("adImagePreview");
      if(preview) preview.innerHTML = "";
    });
  }
}

function openAdModal() {
  pendingAdImage = null;
  const modal = document.getElementById("adModal");
  const form = document.getElementById("adForm");
  if(form) form.reset();
  
  const preview = document.getElementById("adImagePreview");
  if (preview) preview.innerHTML = "";
  
  if(modal) modal.classList.add("open");
}

function closeAdModal() {
  const modal = document.getElementById("adModal");
  if(modal) modal.classList.remove("open");
}

function saveAdForm(e) {
  e.preventDefault();
  if (!pendingAdImage) {
    showToast("يرجى رفع صورة للإعلان", "error");
    return;
  }
  
  const data = {
    link: document.getElementById("adLink") ? document.getElementById("adLink").value.trim() : "",
    order: document.getElementById("adOrder") ? Number(document.getElementById("adOrder").value) : 0,
    image: pendingAdImage
  };

  Store.addAd(data);
  bumpMetaVersion();
  showToast("تمت إضافة الإعلان بنجاح", "success");
  closeAdModal();
  renderAdsTable();
}

function orderInventoryKey(item) {
  return (item.color || "_") + "||" + (item.size || "_");
}

window.changeOrderStatus = async function(orderId, selectElement) {
  const newStatus = selectElement.value;
  const order = Store.getOrders().find(o => o.id === orderId);
  if (!order) return;
  const previousStatus = order.status || "pending";

  if (newStatus === "prepared" && !order.stockDeducted) {
    if (!confirm("هل تريد تأكيد تجهيز الطلب وخصم المنتجات من المخزون تلقائياً؟")) {
      selectElement.value = previousStatus;
      return;
    }
    if (!ensureProductsWritable()) { selectElement.value = previousStatus; return; }

    showToast("جاري التحديث وخصم الكميات...");
    const wantedIds = Array.from(new Set((order.items || []).map(function (it) { return String(it.productId); })));
    const fetched = await Promise.all(wantedIds.map(function (pid) { return Store.loadProductFresh(pid).catch(function () { return null; }); }));
    const byId = new Map();
    fetched.forEach(function (p) { if (p) byId.set(String(p.id), p); });
    const touched = new Map();
    const notDeducted = [];

    (order.items || []).forEach(function (item) {
      const product = byId.get(String(item.productId));
      const qty = Math.floor(Number(item.qty)) || 0;
      if (!product || qty <= 0) { notDeducted.push(item.name || item.productId); return; }

      const useMatrix = Store.hasVariantMatrix(product) && product.inventory;
      if (useMatrix) {
        const key = orderInventoryKey(item);
        if (product.inventory[key] !== undefined && Number(product.inventory[key]) >= qty) {
          product.inventory[key] = Number(product.inventory[key]) - qty;
          product.stock = Object.values(product.inventory).reduce((sum, n) => sum + (Number(n) || 0), 0);
          touched.set(product.id, product);
        } else { notDeducted.push(item.name || item.productId); }
      } else if ((Number(product.stock) || 0) >= qty) {
        product.stock = Number(product.stock) - qty;
        touched.set(product.id, product);
      } else { notDeducted.push(item.name || item.productId); }
    });

    if (touched.size > 0) {
      const results = await Promise.all(Array.from(touched.values()).map(function (p) {
        const patch = { stock: p.stock };
        if (p.inventory) patch.inventory = p.inventory;
        return Store.updateProduct(p.id, patch);
      }));
      if (results.some(function (ok) { return ok === false; })) {
        showToast("تعذّر حفظ خصم المخزون على الخادم.", "error");
        selectElement.value = previousStatus;
        return;
      }
      await syncProductsToAlgolia(Array.from(touched.values()));
    }

    const saved = await updateOrderInFirebase(order.id, { status: "prepared", stockDeducted: true });
    if (!saved) {
      showToast("تم خصم المخزون لكن تعذّر تحديث حالة الطلب على الخادم.", "error");
    } else if (notDeducted.length) {
      showToast("تم التجهيز، لكن لم تُخصم كمية: " + notDeducted.join("، ") + " (المخزون غير كافٍ).", "error");
    } else {
      showToast("تم تجهيز الطلب وخصم المخزون بنجاح!", "success");
    }
  } else {
    const saved = await updateOrderInFirebase(order.id, { status: newStatus });
    if (!saved) {
      showToast("تعذّر تحديث حالة الطلب على الخادم.", "error");
      selectElement.value = previousStatus;
      return;
    }
    showToast("تم تحديث حالة الطلب.", "success");
  }

  renderOrdersTable();
};

window.updateOrderInFirebase = async function(orderId, patch) {
  if (typeof database !== "undefined" && database) {
    try {
      const snapshot = await database.ref("ws_orders").orderByChild("id").equalTo(orderId).once("value");
      if (!snapshot.exists()) return false;
      const writes = [];
      snapshot.forEach(function (child) { writes.push(child.ref.update(patch)); });
      await Promise.all(writes);
    } catch (e) {
      console.error("Error updating order in FB", e);
      return false;
    }
  }
  const list = Store.getOrders().map(o => o.id === orderId ? Object.assign({}, o, patch) : o);
  LS.set("ws_orders", JSON.stringify(list));
  return true;
};

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  const ORDERS_VIEW_LIMIT = 300;
  const orders = Store.getOrders().slice(0, ORDERS_VIEW_LIMIT);
  const targets = [tbody, document.getElementById("ordersTableBody2")].filter(Boolean);

  if (!orders.length) {
    targets.forEach(function (t) {
      t.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink-300);">لا توجد طلبات مسجّلة بعد</td></tr>';
    });
    return;
  }

  const rowsHtml = orders.map(function (o) {
    const date = escapeHtml(new Date(o.date).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }));
    
    const itemsList = (o.items || []).map(function (it) {
      const opts = [];
      if (it.color) opts.push(escapeHtml(it.color));
      if (it.size) opts.push(escapeHtml(it.size));
      if (!opts.length && it.variant) opts.push(escapeHtml(it.variant));
      const optHtml = opts.length ? ' <small>(' + opts.join(' / ') + ')</small>' : '';
      const qty = Number(it.qty) || 1;

      return (
        '<li class="order-item">' +
          '<span class="order-item-qty" dir="ltr">×' + qty + '</span>' +
          '<span class="order-item-name">' + escapeHtml(it.name || "منتج") + optHtml + '</span>' +
        '</li>'
      );
    }).join("");

    const summary = itemsList 
      ? '<ul class="order-items">' + itemsList + '</ul>' 
      : '<span class="order-items-empty">—</span>';

    const cust = o.customer || {};
    let customerHtml = '<span style="color:var(--ink-400);font-size:.85rem;">بدون بيانات توصيل</span>';
    if (cust.phone || cust.gov || cust.name) {
      customerHtml = 
        '<div style="font-size:.85rem;line-height:1.4;white-space:nowrap;">' +
          (cust.name ? '<strong style="color:var(--primary);display:block;margin-bottom:3px;font-size:0.92rem;">👤 ' + escapeHtml(cust.name) + '</strong>' : '') +
          (cust.phone ? '<a href="tel:' + escapeHtml(String(cust.phone).replace(/[^0-9+]/g, "")) + '" style="font-weight:700;color:var(--olive-700);text-decoration:underline;" dir="ltr">' + escapeHtml(cust.phone) + '</a><br>' : '') +
          '<span>' + escapeHtml(cust.gov || "") + (cust.area ? ' — ' + escapeHtml(cust.area) : '') + '</span>' +
          (cust.landmark && cust.landmark !== "لا يوجد" ? '<br><small style="color:var(--ink-500);">' + escapeHtml(cust.landmark) + '</small>' : '') +
        '</div>';
    }

    const status = o.status || 'pending';
    const deducted = o.stockDeducted ? true : false;
    let statusHtml = `
      <select class="order-status-select" onchange="changeOrderStatus(${jsStr(o.id)}, this)" style="padding:6px; border-radius:6px; font-size:0.85rem; border:1px solid var(--line-strong); background:#fff; cursor:pointer;">
        <option value="pending" ${status === 'pending' ? 'selected' : ''}>قيد المعالجة ⏳</option>
        <option value="prepared" ${status === 'prepared' ? 'selected' : ''}>تم التجهيز ✅</option>
        <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>ملغي ❌</option>
      </select>
    `;
    
    if (deducted) {
        statusHtml += `<div style="font-size:0.75rem; color:var(--success); margin-top:6px; font-weight:bold; white-space:nowrap;">(تم خصم المخزون)</div>`;
    }

    return (
      "<tr>" +
        "<td>" + date + "</td>" +
        "<td>" + customerHtml + "</td>" +
        '<td style="white-space:nowrap;">' + (o.type === "cart" ? "سلة كاملة" : "منتج واحد") + "</td>" +
        "<td>" + summary + "</td>" +
        '<td style="white-space:nowrap;font-weight:700;">' + formatPrice(o.total) + "</td>" +
        "<td>" + statusHtml + "</td>" + 
      "</tr>"
    );
  }).join("");

  targets.forEach(function (t) { t.innerHTML = rowsHtml; });
}

function fillSettingsForm() {
  const form = document.getElementById("settingsForm");
  if (!form) return;
  const s = Store.getSettings();
  form.storeName.value = s.storeName || "";
  form.storeTagline.value = s.storeTagline || "";
  form.storeDescription.value = s.storeDescription || "";
  form.whatsapp.value = s.whatsapp || "";
  form.instagram.value = s.instagram || "";
  if (form.tiktok) form.tiktok.value = s.tiktok || "";
  form.phone.value = s.phone || "";
  if (form.phone2) form.phone2.value = s.phone2 || "";
  if (form.mapUrl) form.mapUrl.value = s.mapUrl || "";
  form.address.value = s.address || "";
  form.workingHours.value = s.workingHours || "";
  const deliveryInfo = s.deliveryInfo || "";
  if (form.deliveryInfo) form.deliveryInfo.value = deliveryInfo;
  form.currencySymbol.value = s.currencySymbol || "د.ع";
}

function wireSettingsForm() {
  const form = document.getElementById("settingsForm");
  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const mapUrlVal = form.mapUrl ? form.mapUrl.value.trim() : "";
    if (mapUrlVal && !safeMapUrl(mapUrlVal)) {
      showToast("رابط الخرائط يجب أن يبدأ بـ https://", "error");
      return;
    }

    const patch = {
      storeName: form.storeName.value.trim(),
      storeTagline: form.storeTagline.value.trim(),
      storeDescription: form.storeDescription.value.trim(),
      whatsapp: whatsappDigitsOnly(form.whatsapp.value),
      instagram: form.instagram.value.trim(),
      tiktok: form.tiktok ? form.tiktok.value.trim() : Store.getSettings().tiktok || "",
      phone: form.phone.value.trim(),
      phone2: form.phone2 ? form.phone2.value.trim() : (Store.getSettings().phone2 || ""),
      mapUrl: mapUrlVal,
      address: form.address.value.trim(),
      workingHours: form.workingHours.value.trim(),
      deliveryInfo: form.deliveryInfo.value.trim(),
      currencySymbol: form.currencySymbol.value.trim() || "د.ع"
    };

    Store.saveSettings(patch);
    bumpMetaVersion();
    showToast("تم حفظ الإعدادات بنجاح", "success");
  });
}

document.addEventListener("DOMContentLoaded", initAdminPage);
