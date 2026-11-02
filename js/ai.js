// js/ai.js — عميل الذكاء الاصطناعي في المتصفح (لوحة الأدمن فقط) — خالٍ تماماً من المفاتيح.
// القاعدة الذهبية هنا: «مخرجات النموذج بيانات غير موثوقة». كل ما يرجع منه يُنظَّف ويُتحقَّق منه
// (أرقام، روابط، أقسام، إجراءات) قبل أن تراه admin.js، ولا يُكتب شيء في Firebase إلا بعد تأكيد المدير.
const StoreAI = (() => {
  const CHUNK_ROWS = 40;            // عدد صفوف الجدول في الطلب الواحد (يمنع قطع الرد في الملفات الكبيرة)
  const MAX_IMAGE_SIDE = 2000;      // أكبر ضلع للصورة قبل الإرسال (أصغر حجماً وأسرع دون خسارة قراءة النص)
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_ITEMS = 1000;           // سقف أمان لعدد المنتجات في عملية استيراد واحدة
  // مفاتيح config.js: aiEnabled (افتراضي true) و aiBilingualNames (افتراضي true). غير معرّفة (اختبارات) ← الافتراضي.
  const cfg = () => (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG) ? STORE_CONFIG : {};
  const aiEnabled = () => cfg().aiEnabled !== false;
  const enrichEnabled = () => cfg().aiEnrich !== false;
  const enrichMax = () => { const n = Number(cfg().aiEnrichMax); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40; };
  const enrichBudgetMs = () => { const n = Number(cfg().aiEnrichBudgetSec); return (Number.isFinite(n) && n >= 5 ? Math.min(n, 120) : 20) * 1000; };
  const bilingualNames = () => cfg().aiBilingualNames !== false;
  function assertEnabled() {
    if (!aiEnabled()) throw new Error("أدوات الذكاء الاصطناعي معطّلة لهذا المتجر (aiEnabled في config.js).");
  }

  // مخططات JSON: تُرسل للخادم فيُلزم Gemini/Groq بالشكل (والتنظيف في العميل يبقى كحماية ثانية)
  const STR = { type: "string" }, NULLABLE_STR = { type: ["string", "null"] }, NULLABLE_NUM = { type: ["number", "null"] };
  // اللون = الاسم كما في المصدر + درجته التقريبية (#RRGGBB) ليطابق الموقع اللون الحقيقي بدل الأزرق الافتراضي
  const COLOR_ITEM = { type: "object", properties: { name: STR, hex: STR }, required: ["name", "hex"] };
  const INVOICE_SCHEMA = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: STR, brand: STR, productType: STR, category: STR, price: { type: "number" }, qty: { type: "integer" },
            barcode: NULLABLE_STR, colors: { type: "array", items: COLOR_ITEM }, sizes: { type: "array", items: STR },
            description: STR, image: NULLABLE_STR, row: NULLABLE_NUM   // row = رقم سطر المنتج في الجدول (لربط الوصف بخلية الملف حرفياً)
          },
          required: ["name", "brand", "productType", "category", "price", "qty", "barcode", "colors", "sizes", "description", "image", "row"]
        }
      }
    },
    required: ["items"]
  };
  const SHELF_SCHEMA = {
    type: "object",
    properties: { products: { type: "array", items: { type: "object", properties: { name: STR, category: STR, box_2d: { type: "array", items: { type: "number" } } }, required: ["name", "category", "box_2d"] } } },
    required: ["products"]
  };
  const PRICE_SCHEMA = {
    type: "object",
    properties: {
      action: { type: "string", enum: ["discount_percent", "discount_fixed", "increase_percent", "increase_fixed", "reset_discount", "unclear"] },
      value: { type: "number" }, category: NULLABLE_STR, minPrice: NULLABLE_NUM, maxPrice: NULLABLE_NUM, summary: STR
    },
    required: ["action", "value", "category", "minPrice", "maxPrice", "summary"],
    additionalProperties: false
  };

  // الأقسام قد تأتي أسماء (نص) أو كائنات {name, path}؛ المسار «الأب › الفرعي» يميّز قسمين بنفس الاسم تحت أبوين مختلفين
  const catLabel = c => cleanText(typeof c === "string" ? c : (c && (c.path || c.name)), 120);
  const PRICE_ACTIONS = ["discount_percent", "discount_fixed", "increase_percent", "increase_fixed", "reset_discount"];

  /* ------------------------------ أدوات التنظيف ------------------------------ */
  const AR_DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
                      "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

  function toAsciiDigits(s) { return String(s).replace(/[٠-٩۰-۹]/g, d => AR_DIGITS[d]); }

  // يحوّل "25,000" / "٢٥٬٠٠٠" / "18.5 د.ع" إلى رقم. غير الصالح ← 0 (لا NaN أبداً).
  function toNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0;
    if (v === null || v === undefined) return 0;
    const s = toAsciiDigits(v).replace(/[,،٬\s]/g, "").replace(/٫/g, ".");
    const m = s.match(/\d+(?:\.\d+)?/);
    const n = m ? parseFloat(m[0]) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function cleanText(v, max) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 200);
  }

  function toList(v, maxItems, maxLen) {
    const arr = Array.isArray(v) ? v : (typeof v === "string" ? v.split(/[,،|/]/) : []);
    const out = [], seen = new Set();
    for (const x of arr) {
      const t = cleanText(x, maxLen || 40);
      const k = t.toLowerCase();
      if (t && !seen.has(k)) { seen.add(k); out.push(t); }
      if (out.length >= (maxItems || 20)) break;
    }
    return out;
  }

  function safeUrl(v) {
    if (!v) return null;
    const m = String(v).match(/https?:\/\/[^\s"'<>\u0000-\u001F]+/i);
    return m && m[0].length <= 1000 ? m[0] : null;
  }

  function normKey(s) {
    return toAsciiDigits(cleanText(s, 300)).toLowerCase()
      .replace(/[\u064B-\u0652\u0640]/g, "")          // التشكيل والتطويل
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  /* ------------------------------ تنظيف المنتجات المستخرجة ------------------------------ */
  /* ---- ألوان بصيغة كود (HEX) ---- */
  // ملفات المبيعات تكتب الدرجة ككود (E07A5F). نحوّله **حسابياً** إلى اسم عربي لأقرب لون معروف (أدق وأثبت من تخمين نموذج لغوي)،
  // ونحتفظ بالكود نفسه ليُستعمل كدرجة فعلية للون (بدل الأزرق الافتراضي).
  const COLOR_NAMES = [
    ["أسود", "#111111"], ["أبيض", "#FFFFFF"], ["رمادي", "#808080"], ["رمادي فاتح", "#C8C8C8"], ["رمادي غامق", "#4A4A4A"], ["فضي", "#C0C0C0"],
    ["أحمر", "#E53935"], ["أحمر غامق", "#B71C1C"], ["عنابي", "#7B1E3A"], ["ماروني", "#800000"],
    ["وردي", "#F48FB1"], ["وردي فاتح", "#F8BBD0"], ["فوشي", "#E91E8C"], ["سلموني", "#FA8072"],
    ["برتقالي", "#FB8C00"], ["تيراكوتا", "#E07A5F"], ["مشمشي", "#FFB27D"], ["خوخي", "#FFDAB9"],
    ["أصفر", "#FDD835"], ["ذهبي", "#D4AF37"], ["خردلي", "#C9A227"], ["كريمي", "#FFF1D0"],
    ["بيج", "#D9C3A5"], ["كاكي", "#B5A47A"], ["رملي", "#C2B280"], ["عسلي", "#B8860B"],
    ["بني", "#8B6B4A"], ["بني فاتح", "#A1887F"], ["بني غامق", "#4E342E"],
    ["أخضر", "#43A047"], ["أخضر فاتح", "#9CCC65"], ["أخضر غامق", "#1B5E20"], ["ليموني", "#CDDC39"], ["زيتي", "#6B8E23"], ["نعناعي", "#98E0C4"], ["تركوازي", "#26C6DA"],
    ["سماوي", "#4FC3F7"], ["أزرق", "#1E88E5"], ["أزرق فاتح", "#90CAF9"], ["كحلي", "#1A237E"],
    ["بنفسجي", "#8E24AA"], ["أرجواني", "#6A1B9A"], ["لافندر", "#B39DDB"], ["موف", "#AB7FD0"],
    // مراسي إضافية للألوان الصريحة الشائعة (الاسم نفسه بدرجات أنقى/أغمق) كي لا تُسمّى الدرجة النقية باسم درجتها الغامقة
    ["أحمر", "#FF0000"], ["أحمر", "#D32F2F"], ["أخضر", "#2E7D32"], ["أخضر", "#00A651"], ["أخضر", "#00C000"], ["أزرق", "#0000FF"], ["أزرق", "#1565C0"],
    ["أصفر", "#FFEB3B"], ["أصفر", "#FFFF00"], ["ذهبي", "#FFD700"], ["سماوي", "#87CEEB"], ["سماوي", "#00BFFF"], ["بني غامق", "#6D4C41"],
    ["برتقالي", "#FFA500"], ["برتقالي", "#FF6D00"], ["وردي", "#FF69B4"], ["بنفسجي", "#800080"], ["رمادي غامق", "#333333"]
  ].map(c => ({ name: c[0], hex: c[1], rgb: [1, 3, 5].map(i => parseInt(c[1].substr(i, 2), 16)) }));

  // يقبل: E07A5F | #E07A5F | 0xE07A5F | #E75 | rgb(224,122,95). الستة بلا # لا تُعدّ كوداً إلا إن حوت رقماً (حتى لا تُفهم كلمة مثل facade كلون).
  function parseHexColor(v) {
    const t = cleanText(v, 30).replace(/^0x/i, "#");
    let m = t.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (m) {
      const parts = [m[1], m[2], m[3]].map(Number);
      return parts.some(n => n > 255) ? null : "#" + parts.map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    }
    m = t.match(/^#([0-9a-f]{6})$/i);
    if (m) return "#" + m[1].toUpperCase();
    m = t.match(/^#([0-9a-f]{3})$/i);
    if (m) return "#" + m[1].split("").map(c => c + c).join("").toUpperCase();
    m = t.match(/^([0-9a-f]{6})$/i);
    if (m && (/\d/.test(m[1]) || /^([a-f])\1{5}$/i.test(m[1]))) return "#" + m[1].toUpperCase();
    return null;
  }

  function hexToColorName(hex) {
    const h = parseHexColor(hex);
    if (!h) return "";
    const rgb = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
    let best = null, bestD = Infinity;
    COLOR_NAMES.forEach(c => {
      const rm = (rgb[0] + c.rgb[0]) / 2, dr = rgb[0] - c.rgb[0], dg = rgb[1] - c.rgb[1], db = rgb[2] - c.rgb[2];
      const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;     // مسافة redmean (أقرب لإدراك العين من RGB الخام)
      if (d < bestD) { bestD = d; best = c; }
    });
    return best ? best.name : "";
  }

  // مدخل لون من ملف: «E07A5F» أو «#E07A5F - تيراكوتا» أو «تيراكوتا». يرجع {name, hex} لو فيه كود، وإلا null.
  function splitColorEntry(v) {
    const t = cleanText(v, 60);
    if (!t) return null;
    const whole = parseHexColor(t);
    if (whole) return { name: hexToColorName(whole), hex: whole };
    const m = t.match(/(^|[^0-9a-fA-F])(#?)([0-9a-fA-F]{6})(?![0-9a-fA-F])/);
    if (!m) return null;
    const hex = parseHexColor((m[2] || "") + m[3]);
    if (!hex) return null;
    const rest = cleanText(t.replace(m[0], m[1]).replace(/[()\-–—:،,/|]+/g, " "), 40);
    return { name: /\p{L}/u.test(rest) ? rest : hexToColorName(hex), hex };
  }

  /* ---- لون من الاسم (إنجليزي/عربي/تسويقي) ---- */
  // أسماء الألوان التسويقية للهواتف والأجهزة (Obsidian، Porcelain، Titanium…) لا يعرفها أي قاموس عربي، فكانت كلها تأخذ الأزرق الافتراضي.
  // الترتيب عند القرار النهائي (resolveColorHex): كود صريح ← درجة النموذج (إن لم تناقض الاسم) ← القاموس ← فارغ (رمادي محايد في الأدمن، لا أزرق).
  const COLOR_WORDS_BASE = {
    black: "#1C1C1E", "اسود": "#1C1C1E", white: "#F5F5F0", "ابيض": "#F5F5F0", gray: "#8E8E93", grey: "#8E8E93", "رمادي": "#8E8E93", "رصاصي": "#8E8E93",
    silver: "#C0C0C5", "فضي": "#C0C0C5", "سيلفر": "#C0C0C5", gold: "#D4AF37", "ذهبي": "#D4AF37", red: "#D32F2F", "احمر": "#D32F2F", "عنابي": "#7B1E3A",
    blue: "#1E63D6", "ازرق": "#1E63D6", green: "#2E7D32", "اخضر": "#2E7D32", yellow: "#F9C70C", "اصفر": "#F9C70C", orange: "#F57C00", "برتقالي": "#F57C00",
    pink: "#F48FB1", "وردي": "#F48FB1", "زهري": "#F48FB1", purple: "#7B1FA2", violet: "#7B1FA2", "بنفسجي": "#7B1FA2", brown: "#6D4C41", "بني": "#6D4C41",
    beige: "#D9C7A7", "بيج": "#D9C7A7", cream: "#F3E9D2", "كريمي": "#F3E9D2", navy: "#1A2A52", "كحلي": "#1A2A52", teal: "#00897B", turquoise: "#26C6DA", "فيروزي": "#26C6DA", "تركوازي": "#26C6DA",
    bronze: "#A9713B", "برونزي": "#A9713B", copper: "#B87333", "نحاسي": "#B87333", lavender: "#B9A7E0", "لافندر": "#B9A7E0", mint: "#A8E6CF", "نعناعي": "#A8E6CF",
    cyan: "#26C6DA", "سماوي": "#4FC3F7", lime: "#84CC16", olive: "#6B7A3A", "زيتي": "#6B7A3A", "زيتوني": "#6B7A3A", maroon: "#800000", "ماروني": "#800000"
  };
  const COLOR_WORDS_MARKETING = {
    obsidian: "#1F2126", onyx: "#17181B", graphite: "#3A3B3E", charcoal: "#36393D", midnight: "#1B2233", phantom: "#1D1E20", jet: "#0E0E10", space: "#2C2C2E",
    porcelain: "#E9E4DA", ivory: "#F2EEE3", snow: "#F7F8FA", moonlight: "#E8EAEE", starlight: "#EFE9DC", titanium: "#8D8F92", natural: "#B8B2A7", desert: "#C9B79C",
    mystic: "#4A4F5C", cosmic: "#2B2E4A", hazel: "#8C9A82", sage: "#9CAF88", jade: "#00A86B", emerald: "#0B7A55", wintergreen: "#A9C9B4", aloe: "#B9D8B0",
    peony: "#E58EA6", coral: "#F4806C", peach: "#F7B999", blush: "#F2C4C4", rose: "#E8A0B0", ruby: "#A3122E", sapphire: "#1F3F8F", cobalt: "#1F4FBF", iris: "#6C6FD0",
    bay: "#6FA6C8", sky: "#7EC8E3", ice: "#CFE6F2", lemongrass: "#E3E56B", champagne: "#E6D3B1", sand: "#D9C6A0",
    "تيتانيوم": "#8D8F92", "جرافيت": "#3A3B3E", "عاجي": "#F2EEE3", "ملكي": "#2A4DB7", "تيراكوتا": "#C8553D", "ليلكي": "#C8A2C8", "خوخي": "#F7B999", "مشمشي": "#FFB27D", "عسلي": "#B8860B", "خردلي": "#C9A227"
  };
  const colorWordMap = (o) => { const m = {}; Object.keys(o).forEach(k => { m[normKey(k)] = o[k]; }); return m; };
  const CW_BASE = colorWordMap(COLOR_WORDS_BASE), CW_MKT = colorWordMap(COLOR_WORDS_MARKETING);
  const CW_LIGHT = new Set(["light", "pale", "soft", "فاتح"]), CW_DARK = new Set(["dark", "deep", "غامق", "داكن"]);

  function hexRgb(h) { return [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)); }
  function rgbHex(a) { return "#" + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase(); }
  function mixHex(h, target, k) { const a = hexRgb(h), b = hexRgb(target); return rgbHex(a.map((x, i) => x + (b[i] - x) * k)); }
  function colorDistance(h1, h2) {     // redmean
    const a = hexRgb(h1), b = hexRgb(h2), rm = (a[0] + b[0]) / 2;
    return Math.sqrt((2 + rm / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2);
  }

  // اسم لون (Titanium Gray / Moonlight White / أزرق فاتح) ← درجة، أو "" إن لم يُعرف. اللون الأساسي (gray) يغلب الكلمة التسويقية (titanium).
  function colorHexFromName(name) {
    const words = normKey(name).split(" ").filter(Boolean);
    if (!words.length) return "";
    let hex = "";
    words.forEach(w => { if (CW_BASE[w]) hex = CW_BASE[w]; });
    if (!hex) for (const w of words) { if (CW_MKT[w]) { hex = CW_MKT[w]; break; } }
    if (!hex) return "";
    if (words.some(w => CW_LIGHT.has(w))) hex = mixHex(hex, "#FFFFFF", 0.4);
    if (words.some(w => CW_DARK.has(w))) hex = mixHex(hex, "#000000", 0.4);
    return hex;
  }

  // القرار النهائي لدرجة لون بلا كود صريح: درجة النموذج إن كانت صالحة ولا تناقض الاسم، وإلا القاموس، وإلا "" (لا أزرق افتراضي).
  function resolveColorHex(name, aiHex) {
    const dict = colorHexFromName(name), ai = parseHexColor(aiHex);
    if (dict && ai) return colorDistance(dict, ai) <= 260 ? ai : dict;
    return dict || ai || "";
  }

  // يحوّل مصفوفة ألوان خام (نصوص أو {name,hex} أو نص واحد بفواصل) إلى { names[], hexMap{} } بعد التنقية.
  function buildColors(rawColors) {
    const flat = [];
    (Array.isArray(rawColors) ? rawColors : [rawColors]).forEach(c => {
      if (c && typeof c === "object") flat.push(c);
      else if (c !== null && c !== undefined) String(c).split(/[,،|](?![^(]*\))/).forEach(p => flat.push(p));
    });
    const names = [], hexMap = {}, used = new Set();
    flat.slice(0, 40).forEach(c => {
      const obj = c && typeof c === "object" ? c : null;
      const cname = cleanText(obj ? obj.name : c, 60);
      if (!cname) return;
      const e = splitColorEntry(cname);
      const base = e ? e.name : cname;
      if (!isValidColor(base)) return;
      let nm = base, n = 2;
      if (used.has(nm.toLowerCase())) { if (!e) return; while (used.has((base + " " + n).toLowerCase())) n++; nm = base + " " + n; }
      if (names.length >= 20) return;
      used.add(nm.toLowerCase());
      names.push(nm);
      const hx = e ? e.hex : resolveColorHex(base, obj ? obj.hex : "");
      if (hx) hexMap[nm] = hx;
    });
    return { names, hexMap };
  }

  /* ---- السعة التخزينية (رام/تخزين): 12/256 ← 12GB + 256GB ---- */
  // ملفات الهواتف تكتب السعة «12/256» أو «16/1024»؛ كانت تُرفض لأنها ليست رقماً+وحدة فتضيع. نحوّلها حسابياً (لا بنموذج لغوي).
  // لا نستعمل «/» في الناتج لأنها محظورة في مفاتيح Firebase (مفتاح المخزون «لون||مقاس»).
  const CAP_STORAGE = new Set([32, 64, 128, 256, 512, 1024, 2048, 4096]);
  const CAP_RAM = new Set([1, 2, 3, 4, 6, 8, 10, 12, 16, 18, 24, 32, 64]);
  const CAP_RE = /^(\d{1,2})\s*(?:gb|g|جيجا)?\s*(?:ram|رام)?\s*[\/+\-–|]\s*(\d{1,4})\s*(tb|gb|g|تيرا|ترا|جيجا)?\s*(?:rom|ssd|storage|تخزين)?$/i;
  const capLabel = n => (n >= 1024 && n % 1024 === 0) ? (n / 1024) + "TB" : n + "GB";
  function parseCapacity(v) {
    const t = toAsciiDigits(cleanText(v, 40)).replace(/\s+/g, " ").trim();
    const m = t.match(CAP_RE);
    if (!m) return null;
    let ram = Number(m[1]), st = Number(m[2]);
    if (m[3] && /^(tb|تيرا|ترا)$/i.test(m[3])) st *= 1024;
    if (ram > st) { const x = ram; ram = st; st = x; }
    if (!CAP_RAM.has(ram) || !CAP_STORAGE.has(st) || ram >= st) return null;
    return { ram, storage: st, label: capLabel(ram) + " + " + capLabel(st) };
  }
  function normalizeSize(v) {
    const cap = parseCapacity(v);
    if (cap) return cap.label;
    const t = toAsciiDigits(cleanText(v, 40));
    const j = t.match(/^(2[4-9]|[3-5]\d)\s*[\/x×]\s*(2[8-9]|3[0-8])$/i);
    return j ? j[1] + "×" + j[2] : cleanText(v, 40);   // «/» تُقسِّم المقاسات عند الحفظ فنستعمل ×
  }

  // المقاس/السعة الحقيقية فقط: رقم+وحدة (50ml، 30 مل، 256GB، 5 kg)، مقاسات ملابس (S..5XL)، أرقام أحذية (4–60)، «مقاس واحد».
  // النسب المئوية وتراكيز المكوّنات (10%، 1%) ليست مقاساً — كانت تظهر خطأً («10% + 1%» في خانة المقاسات).
  const UNIT = "(?:ml|mL|ملل|مل|l|لتر|ltr|g|gr|gm|غرام|جرام|غم|جم|غ|kg|كغم|كغ|كيلو|oz|fl\\.?\\s?oz|cm|سم|mm|ملم|m|متر|inch|in|بوصة|انش|gb|tb|mb|جيجا|تيرا|mah|w|وات|v|فولت|pcs|pc|قطعة|قطع|حبة|حبات|capsules?|كبسولة|كبسولات|tablets?|قرص|اقراص|أقراص|sheets?|ورقة|pack|عبوة|btu|بي تي يو|طن|حصان|hp|hz|ghz|rpm|قدم|ft|\")";
  const SIZE_ONE = new RegExp("^(?:\\d+(?:[.,]\\d+)?\\s*" + UNIT + "|(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|free\\s?size|one\\s?size|مقاس واحد|فري سايز)|(?:[4-9]|[1-5]\\d|60)(?:\\.5)?)$", "i");
  // مقاسات الأطفال بالعمر (2-3Y، 6M، 12 شهر) ومقاس الجينز (30/32): كانت تُحذف بصمت لأنها ليست «رقم+وحدة».
  const AGE_SIZE = /^\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s*(?:y|yr|yrs|year|years|m|mo|mos|month|months|سنه|سنة|سنوات|سنين|شهر|اشهر|أشهر)$/i;
  const JEANS_SIZE = /^(2[4-9]|[3-5]\d)\s*[\/x×]\s*(2[8-9]|3[0-8])$/i;
  function isValidSize(v) {
    const t = cleanText(v, 40);
    if (!t || t.includes("%")) return false;
    if (SIZE_ONE.test(t) || parseCapacity(t) || AGE_SIZE.test(t) || JEANS_SIZE.test(t)) return true;
    const m = t.match(/^(\d+)\s*[x×*]\s*(.+)$/i) || t.match(/^(.+?)\s*[x×*]\s*(\d+)$/i);   // «2×50ml» أو «50ml x 2»
    return !!(m && (SIZE_ONE.test(m[2].trim()) || SIZE_ONE.test(m[1].trim())));
  }
  function isValidColor(v) {
    const t = cleanText(v, 40);
    if (!t || t.includes("%") || /\d{3,}/.test(t)) return false;
    if (SIZE_ONE.test(t)) return false;                      // «50ml» ليس لوناً
    return !/^(شفاف|شفافة|شفافه|مائي|مائية|مائيه|عديم اللون|عديمة اللون|clear|transparent|جل|جيل|سائل)$/i.test(t);
  }

  // قائمة مقاسات منظَّفة: لا نقسم النص على «/» (12/256 سعة وليست خيارين)، ونوحّد السعات ثم نتحقق ونزيل التكرار.
  function toSizeList(v) {
    const arr = Array.isArray(v) ? v : (typeof v === "string" ? v.split(/[,،|]/) : []);
    const out = [], seen = new Set();
    arr.forEach(x => {
      const s = normalizeSize(x), k = s.toLowerCase();
      if (s && s.length <= 30 && isValidSize(s) && !seen.has(k)) { seen.add(k); out.push(s); }
    });
    return out.slice(0, 20);
  }

  // هل «الوصف» مجرد تكرار لاسم المنتج؟ (كان النموذج يضع اسم المنتج في خانة الوصف). قصير + يشارك الاسم كلمتين مميّزتين فأكثر.
  function nameTokens(str) { return normKey(str).split(" ").filter(w => w.length >= 3 && !/^\d+$/.test(w)); }
  function isNameEcho(desc, name) {
    const d = cleanText(desc, 3000);
    if (!d) return false;
    if (d.length >= 90) return false;                         // وصف حقيقي أطول من اسم
    const nt = new Set(nameTokens(name));
    const shared = nameTokens(d).filter(w => nt.has(w));
    return new Set(shared).size >= 2 || (d.length < 40 && shared.length >= 1);
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = cleanText(raw.name, 200);
    if (!name || name.length < 2) return null;
    const qtyRaw = raw.qty === undefined || raw.qty === null || raw.qty === "" ? 1 : Math.floor(toNumber(raw.qty));
    const barcode = cleanText(raw.barcode, 64).replace(/^(\d+)\.0+$/, "$1").replace(/[^\p{L}\p{N}\-_.]/gu, "");
    let description = cleanText(raw.description, 2000);
    if (!raw._srcDesc && isNameEcho(description, name)) description = "";   // وصف مأخوذ حرفياً من خلية الملف لا يُحذف أبداً
    // الألوان: كود HEX ← اسم عربي + درجته؛ اسم عادي (Obsidian…) ← درجة من النموذج/القاموس؛ تكرار الاسم الناتج من كودين ← «بني 2»
    const cb = buildColors(raw.colors);
    const colorsOut = cb.names, colorHex = cb.hexMap;
    return {
      name,
      category: cleanText(raw.category, 80),
      price: toNumber(raw.price),
      qty: Number.isFinite(qtyRaw) && qtyRaw >= 0 ? Math.min(qtyRaw, 1000000) : 1,
      barcode: barcode || null,
      colors: colorsOut,
      colorHex: colorHex,
      sizes: toSizeList(raw.sizes),
      description: description,
      descKind: description ? (raw._srcDesc ? "table" : "source") : "",
      _srcDesc: !!(description && raw._srcDesc),   // يبقى مع العنصر: handleExcelFileWithAI يعيد تمريره على normalizeItems فلا يُحذف وصفه القصير       // table = منقول حرفياً من خلية الجدول | source = من الملف نفسه (استخرجه النموذج) | official = مواصفات رسمية من البحث | ad = شرح إعلاني مكتوب تلقائياً
      brand: cleanText(raw.brand, 60),
      productType: cleanText(raw.productType, 60),
      image: safeUrl(raw.image)
    };
  }

  // يوحّد السطور المكررة (نفس الباركود أو الاسم) بدل إنشاء منتجين: تُجمع الكميات وتُدمج الألوان والمقاسات.
  function normalizeItems(list) {
    const out = [], index = new Map();
    let dropped = 0, merged = 0, badBarcodes = 0;
    for (let raw of (Array.isArray(list) ? list : [])) {
      // إكسل يحوّل الباركود الطويل إلى 8.99E+12 فيضيع نهائياً: نهمله بدل حفظ رقم خاطئ
      const bc = raw && raw.barcode !== null && raw.barcode !== undefined ? String(raw.barcode).trim() : "";
      if (/^\d+(?:[.,]\d+)?e[+\-]?\d+$/i.test(bc)) { badBarcodes++; raw = Object.assign({}, raw, { barcode: null }); }
      const it = normalizeItem(raw);
      if (!it) { dropped++; continue; }
      const key = it.barcode ? "b:" + it.barcode : "n:" + normKey(it.name);
      const prev = index.get(key) || (it.barcode ? index.get("n:" + normKey(it.name)) : null);
      if (prev) {
        merged++;
        prev.qty += it.qty;
        prev.colors = toList(prev.colors.concat(it.colors), 20, 30);
        prev.colorHex = Object.assign({}, it.colorHex, prev.colorHex);
        prev.sizes = toList(prev.sizes.concat(it.sizes), 20, 30);
        if (!prev.price && it.price) prev.price = it.price;
        if (!prev.description && it.description) { prev.description = it.description; prev.descKind = it.descKind; prev._srcDesc = it._srcDesc; }
        if (!prev.brand && it.brand) prev.brand = it.brand;
        if (!prev.productType && it.productType) prev.productType = it.productType;
        if (!prev.image && it.image) prev.image = it.image;
        if (!prev.barcode && it.barcode) prev.barcode = it.barcode;
        continue;
      }
      if (out.length >= MAX_ITEMS) { dropped++; continue; }
      index.set(key, it);
      out.push(it);
    }
    return { items: out, dropped, merged, badBarcodes };
  }

  /* ------------------------------ الاتصال بالخادم ------------------------------ */
  async function getIdToken() {
    const user = (typeof firebase !== "undefined" && typeof firebase.auth === "function") ? firebase.auth().currentUser : null;
    if (!user) throw new Error("سجّل الدخول كأدمن أولاً لاستخدام الذكاء الاصطناعي.");
    return await user.getIdToken();
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function callServerApi(action, payload, attempt = 0, timeoutMs = 70000, maxRetries = 1) {
    const token = await getIdToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ action, payload }),
        signal: ctrl.signal
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("انتهت مهلة الذكاء الاصطناعي. جرّب ملفاً أصغر أو أعد المحاولة.");
      throw new Error("تعذّر الاتصال بخدمة الذكاء الاصطناعي. تحقق من الإنترنت.");
    } finally { clearTimeout(timer); }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.error) {
      if ((res.status === 404 || res.status === 405) && !data) {
        throw new Error("خدمة /api/ai غير موجودة على هذه الاستضافة. الذكاء الاصطناعي يعمل فقط عند النشر على Cloudflare Pages مع مجلد functions.");
      }
      if ((res.status === 429 || res.status === 502 || res.status === 504) && attempt < maxRetries) {
        await sleep(2000);
        return callServerApi(action, payload, attempt + 1, timeoutMs, maxRetries);
      }
      throw new Error((data && data.error) || ("خطأ في معالجة الذكاء الاصطناعي (" + res.status + ")"));
    }
    return data;
  }

  /* ------------------------------ 1) توليد الوصف ------------------------------ */
  function cleanDescription(s) {
    let t = String(s || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^\s*(الوصف|وصف المنتج)\s*[:：]\s*/u, "")
      .replace(/[*#`_>]+/g, "")
      .replace(/^["«“'\s]+|["»”'\s]+$/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (t.length > 500) {                     // لا نقطع منتصف جملة
      const cut = t.slice(0, 500);
      const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("،"), cut.lastIndexOf("!"), cut.lastIndexOf("؟"));
      t = last > 150 ? cut.slice(0, last + 1) : cut;
    }
    return t;
  }

  // شرح إعلاني عام حين لا تتوفر مواصفات رسمية: يشرح ما هو المنتج وفائدته حسب نوعه (تجميل، إلكترونيات، ملابس، أجهزة…) بلا اختراع أرقام
  const AD_SYSTEM = [
    "أنت كاتب وصف منتجات لمتجر إلكتروني عراقي. اكتب لكل منتج شرحاً إعلانياً جذاباً بالعربية الفصحى المبسطة من جملتين إلى ثلاث، يوضح ما هو المنتج وفائدته واستخدامه حسب نوعه (مستحضرات تجميل، عناية بالبشرة أو الشعر، إلكترونيات، ملابس، أجهزة منزلية، أو غيرها) ويحفّز على الشراء.",
    "قواعد الدقة الصارمة:",
    "- لا تكرر اسم المنتج كاملاً ولا الحجم أو السعة أو التركيز كأنها وصف؛ اشرح المنتج نفسه.",
    "- ممنوع اختراع مواصفات رقمية أو مكوّنات أو نسب أو سعات أو ألوان أو بلد صنع أو ضمان أو شهادات لم ترد في اسم المنتج. اكتفِ بما يُفهم من الاسم ونوع المنتج.",
    "- ممنوع الادعاءات الطبية أو العلاجية (يعالج، يشفي، يمنع…) وممنوع المبالغات غير القابلة للإثبات (الأفضل في العالم، 100% مضمون).",
    "- إن كان الاسم غامضاً فاكتب شرحاً عاماً عن نوع المنتج واستخدامه دون تفاصيل مخترعة.",
    "- لا إيموجي، ولا علامات تنسيق، ولا ذكر للسعر، وبلا مقدمة أو خاتمة."
  ].join("\n");
  const DESC_SCHEMA = {
    type: "object",
    properties: { descriptions: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, text: STR }, required: ["i", "text"] } } },
    required: ["descriptions"]
  };

  async function generateDescription(productName, categoryName = "") {
    assertEnabled();
    const name = cleanText(productName, 200);
    if (!name) throw new Error("اكتب اسم المنتج أولاً");
    const cat = cleanText(categoryName, 80);
    const prompt = "اسم المنتج: " + name + (cat ? "\nالقسم: " + cat : "") + "\nاكتب الشرح الإعلاني مباشرة:";
    const data = await callServerApi("groq_chat", { prompt, systemInstruction: AD_SYSTEM, asJson: false });
    const text = cleanDescription(data.result);
    if (!text) throw new Error("لم يُنتج النموذج وصفاً صالحاً. أعد المحاولة.");
    return text;
  }

  // يكتب شرحاً إعلانياً لكل منتج بلا وصف (بعد الاستخراج والبحث). دفعات 8 منتجات في طلب واحد. opts: { skip(item), onProgress(done,total) }
  async function completeDescriptions(items, opts = {}) {
    assertEnabled();
    const warnings = [];
    const list = Array.isArray(items) ? items.slice() : [];
    const need = [];
    list.forEach((it, i) => { if (it && !it.description && !(opts.skip && opts.skip(it))) need.push(i); });
    const targets = need.slice(0, 120);
    if (need.length > targets.length) warnings.push("كُتبت أوصاف أول 120 منتجاً فقط من " + need.length + ".");
    if (!targets.length) return { items: list, warnings };

    const BATCH = 8, groups = [];
    for (let i = 0; i < targets.length; i += BATCH) groups.push(targets.slice(i, i + BATCH));
    let done = 0, failedGroups = 0, empty = 0;
    if (opts.onProgress) opts.onProgress(0, targets.length);

    let gi = 0;
    const worker = async () => {
      while (gi < groups.length) {
        const g = groups[gi++];
        const lines = g.map((idx, k) => {
          const it = list[idx];
          return (k + 1) + ". " + cleanText(it.name, 160) + (it.category ? " | القسم: " + cleanText(it.category, 60) : "") + (it.productType ? " | النوع: " + it.productType : "");
        });
        const prompt = "اكتب شرحاً إعلانياً لكل منتج من المنتجات التالية (المفتاح i هو رقم السطر):\n" + lines.join("\n") +
          '\nأرجع JSON فقط: {"descriptions":[{"i":1,"text":"..."}]}';
        try {
          const res = await callServerApi("groq_chat", { prompt, systemInstruction: AD_SYSTEM, asJson: true, schema: DESC_SCHEMA });
          const arr = res && res.data && Array.isArray(res.data.descriptions) ? res.data.descriptions : [];
          const seen = new Set();
          arr.forEach(d => {
            const k = Math.floor(Number(d && d.i)) - 1;
            if (!(k >= 0 && k < g.length) || seen.has(k)) return;
            seen.add(k);
            const idx = g[k];
            const text = cleanDescription(d.text);
            if (!text || isNameEcho(text, list[idx].name)) { empty++; return; }
            list[idx] = Object.assign({}, list[idx], { description: text, descKind: "ad" });
          });
          empty += g.length - seen.size;
        } catch (e) { failedGroups++; }
        done += g.length;
        if (opts.onProgress) opts.onProgress(Math.min(done, targets.length), targets.length);
      }
    };
    await Promise.all([worker(), worker()]);
    if (failedGroups) warnings.push("تعذّر كتابة أوصاف " + failedGroups + " دفعة (خطأ مؤقت). اكتب وصفها يدوياً أو بزر ✨ في نافذة المنتج.");
    if (empty) warnings.push(empty + " منتج لم يُنتج له وصف صالح.");
    return { items: list, warnings };
  }

  /* ------------------------------ 2) أوامر التسعير ------------------------------ */
  function resolveCategoryName(wanted, categories) {
    const w = normKey(wanted);
    if (!w) return null;
    const list = (categories || []).map(c => {
      const label = catLabel(c);
      const leaf = label.split("›").pop();
      return { label, key: normKey(label), leaf: normKey(leaf) };
    }).filter(c => c.key);
    const exact = list.filter(c => c.key === w || c.leaf === w);
    if (exact.length === 1) return exact[0].label;
    if (exact.length > 1) return undefined;                 // نفس الاسم تحت أكثر من أب ← التباس: يُطلب المسار الكامل
    const partial = list.filter(c => c.key.includes(w) || w.includes(c.leaf));
    if (partial.length === 1) return partial[0].label;      // التطابق الجزئي مقبول فقط إن كان وحيداً (لا تخمين)
    return undefined;                                       // غير موجود أو ملتبس
  }

  function describePlan(plan) {
    const scope = plan.category ? "على قسم «" + plan.category + "» (وأقسامه الفرعية)" : "على كل الأقسام";
    const range = (plan.minPrice != null || plan.maxPrice != null)
      ? " للمنتجات التي سعرها" + (plan.minPrice != null ? " ≥ " + plan.minPrice.toLocaleString("en-US") : "") + (plan.maxPrice != null ? (plan.minPrice != null ? " و" : "") + " ≤ " + plan.maxPrice.toLocaleString("en-US") : "")
      : "";
    const act = {
      discount_percent: "خصم " + plan.value + "%",
      discount_fixed: "خصم مبلغ ثابت " + plan.value.toLocaleString("en-US"),
      increase_percent: "رفع الأسعار بنسبة " + plan.value + "%",
      increase_fixed: "رفع الأسعار بمبلغ ثابت " + plan.value.toLocaleString("en-US"),
      reset_discount: "إلغاء الخصومات وإرجاع السعر الأصلي"
    }[plan.action];
    return act + " " + scope + range;
  }

  // يتحقق من خطة التسعير القادمة من النموذج. أي التباس ← خطأ صريح بدل تنفيذ تخميني على كل المتجر.
  function normalizePricePlan(plan, categories) {
    if (!plan || typeof plan !== "object") throw new Error("لم أفهم أمر التسعير. أعد صياغته بوضوح.");
    if (plan.action === "unclear") throw new Error(cleanText(plan.summary, 200) || "الأمر غير واضح أو يحوي أكثر من عملية. نفّذ عملية واحدة في كل أمر.");
    if (!PRICE_ACTIONS.includes(plan.action)) throw new Error("لم أفهم نوع العملية المطلوبة (خصم/زيادة/إلغاء خصم).");

    let value = 0;
    if (plan.action !== "reset_discount") {
      value = toNumber(plan.value);
      if (value <= 0) throw new Error("لم أجد قيمة واضحة في الأمر (نسبة أو مبلغ).");
      if (plan.action === "discount_percent" && value > 90) throw new Error("نسبة الخصم " + value + "% مرتفعة جداً لتُنفَّذ بأمر نصي. عدّلها يدوياً إن كانت مقصودة.");
      if (plan.action === "increase_percent" && value > 300) throw new Error("نسبة الزيادة " + value + "% مرتفعة جداً. تحقق من الأمر.");
    }

    let category = null;
    const wanted = cleanText(plan.category, 100);
    if (wanted && !/^(null|none|all|الكل|كل الأقسام)$/i.test(wanted)) {
      const resolved = resolveCategoryName(wanted, categories);
      if (!resolved) throw new Error("لم أجد قسماً مطابقاً لـ «" + wanted + "» في متجرك، أو أن الاسم ينطبق على أكثر من قسم. اكتب اسم القسم كما هو. لم يُنفَّذ شيء.");
      category = resolved;
    }

    const minRaw = plan.minPrice === null || plan.minPrice === undefined ? 0 : toNumber(plan.minPrice);
    const maxRaw = plan.maxPrice === null || plan.maxPrice === undefined ? 0 : toNumber(plan.maxPrice);
    const minPrice = minRaw > 0 ? minRaw : null;
    const maxPrice = maxRaw > 0 ? maxRaw : null;
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new Error("الحد الأدنى للسعر أكبر من الحد الأعلى. راجع الأمر.");

    const clean = { action: plan.action, value, category, minPrice, maxPrice };
    clean.summary = describePlan(clean);      // الملخص يُبنى من الخطة المتحقَّق منها، لا من كلام النموذج (قد يناقض الفعل الحقيقي)
    return clean;
  }

  async function parsePriceCommand(commandText, categories = []) {
    assertEnabled();
    const cmd = cleanText(commandText, 500);
    if (!cmd) throw new Error("اكتب أمر التسعير أولاً");
    const names = (categories || []).map(catLabel).filter(Boolean);
    const sys = [
      "أنت محلل أوامر تسعير لمتجر. حوّل أمر المدير إلى JSON واحد فقط (بلا أي نص خارجه):",
      '{"action":"discount_percent|discount_fixed|increase_percent|increase_fixed|reset_discount|unclear","value":number,"category":string|null,"minPrice":number|null,"maxPrice":number|null,"summary":string}',
      "قواعد الدقة:",
      "- حدّد عملية واحدة فقط. إن احتوى الأمر أكثر من عملية أو كان غامضاً أو ليس أمر تسعير فأرجع action=\"unclear\" وفي summary سبب ذلك بجملة عربية قصيرة.",
      "- خصم/تخفيض/تنزيل ← discount. زيادة/رفع/غلاء ← increase. إلغاء الخصم/إرجاع السعر الأصلي ← reset_discount (value=0).",
      "- \"%\" أو \"بالمئة\" أو \"نسبة\" ← الصيغة percent وإلا فالصيغة fixed. value رقم موجب بأرقام لاتينية (٥٠٠٠ ← 5000).",
      "- الكلمات: \"ألف\"=1000 (\"5 آلاف\"=5000) و\"مليون\"=1000000 و\"نص/نصف\"=50% و\"ربع\"=25%.",
      "- category: انسخ القسم حرفياً من القائمة أدناه (الأقسام الفرعية بصيغة «الأب › الفرعي»؛ إن ذكر المدير قسماً فرعياً بأي صيغة فاكتب مساره الكامل من القائمة) إن ذكر قسماً يطابقها. إن ذكر قسماً غير موجود في القائمة فاكتب ما قاله كما هو (لا تستبدله بقسم آخر). إن لم يذكر قسماً فـ null. ممنوع تخمين قسم لم يُذكر.",
      "- minPrice/maxPrice فقط إذا حدد المدير نطاق سعر (مثل \"للمنتجات فوق 10000\" ← minPrice=10000)، وإلا null.",
      "الأقسام المتاحة: " + (names.length ? names.join("، ") : "(لا أقسام)")
    ].join("\n");
    const data = await callServerApi("groq_chat", { prompt: cmd, systemInstruction: sys, asJson: true, schema: PRICE_SCHEMA });
    return normalizePricePlan(data.data, names);
  }

  /* ------------------------------ 3) تجهيز الملفات ------------------------------ */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("تعذّر قراءة الملف"));
      r.readAsDataURL(blob);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  // يصغّر صور الهاتف الضخمة قبل الإرسال (أسرع وأرخص وأقل عرضة لتجاوز الحد) ويرجع {base64, mimeType}.
  async function prepareImage(file) {
    if (!file) throw new Error("لم يتم اختيار صورة");
    if (file.size > 30 * 1024 * 1024) throw new Error("الصورة كبيرة جداً (أكثر من 30MB).");
    try {
      const img = await loadImage(file);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);     // PNG الشفاف لا يتحول لأسود
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("encode");
      return { base64: await blobToBase64(blob), mimeType: "image/jpeg" };
    } catch (e) {
      // صيغة لا يفك المتصفح ترميزها (مثل HEIC خارج سفاري): نرسل الأصل إن كان صغيراً وإلا نطلب تحويله.
      if (file.size > MAX_FILE_BYTES) throw new Error("تعذّر تصغير الصورة وحجمها كبير. صوّرها بصيغة JPEG أو حوّلها.");
      return { base64: await blobToBase64(file), mimeType: (file.type || "image/jpeg").replace("image/jpg", "image/jpeg") };
    }
  }

  async function preparePdf(file) {
    if (!file) throw new Error("لم يتم اختيار ملف");
    if (file.size > MAX_FILE_BYTES) throw new Error("ملف PDF أكبر من 12MB. قسّمه إلى أجزاء.");
    return { base64: await blobToBase64(file), mimeType: "application/pdf" };
  }

  // تقسيم CSV إلى سجلات منطقية (يحترم الحقول المقتبسة التي تحوي أسطراً جديدة)
  // عدد الخلايا غير الفارغة في سطر CSV (لاكتشاف سطور العنوان/الشعار فوق سطر عناوين الأعمدة)
  function csvCellCount(row) {
    let n = 0, inQ = false, cur = "";
    for (const ch of row) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { if (cur.trim()) n++; cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) n++;
    return n;
  }
  // تقسيم سطر CSV إلى خلاياه (يحترم علامات الاقتباس)
  function parseCsvCells(row) {
    const cells = [];
    let cur = "", inQ = false;
    const s = String(row || "");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') { if (inQ && s[i + 1] === '"') { cur += '"'; i++; continue; } inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  }
  // أي عمود هو «الوصف»؟ نقرره بالكود (لا بتخمين النموذج الذي يتغير من مرة لأخرى).
  // 1) من عنوان العمود: وصف/Description ثم تفاصيل/مواصفات.  2) إن لم يُعرف العنوان: العمود ذو النصوص الأطول (متوسط ≥ 50 حرفاً وأغلب صفوفه معبّأة وليس روابط).
  function findDescColumn(headerCells, bodyRows) {
    const bad = /(رابط|url|link|صوره|image|photo)/;
    const tier = h => {
      const k = normKey(h);
      if (!k || bad.test(k)) return 0;
      if (k.includes("وصف") || /(^| )(description|desc)( |$)/.test(k)) return 2;
      if (k.includes("تفاصيل") || k.includes("مواصفات") || /(^| )(details?|specs?|specifications?)( |$)/.test(k)) return 1;
      return 0;
    };
    let best = -1, bestTier = 0;
    headerCells.forEach((h, i) => { const t = tier(h); if (t > bestTier) { bestTier = t; best = i; } });
    if (best >= 0) return best;
    if (!Array.isArray(bodyRows) || !bodyRows.length) return -1;
    const sample = bodyRows.slice(0, 60).map(parseCsvCells);
    let bestAvg = 0;
    headerCells.forEach((h, i) => {
      if (bad.test(normKey(h))) return;
      const vals = sample.map(r => cleanText(r[i], 3000)).filter(Boolean);
      if (vals.length < Math.max(1, Math.ceil(sample.length * 0.5))) return;
      if (vals.some(v => /^https?:\/\//i.test(v))) return;
      const avg = vals.reduce((a, v) => a + v.length, 0) / vals.length;
      if (avg >= 50 && avg > bestAvg) { bestAvg = avg; best = i; }
    });
    return best;
  }
  // يطابق منتجاً أعاده النموذج مع سطره في الجدول بالاسم (احتياط إن لم يُرجع رقم السطر). يرجع رقم السطر الشامل أو 0.
  function matchRowByName(item, rows, base) {
    const tok = s => new Set(normKey(s).split(" ").filter(w => w.length >= 2));
    const parts = String((item && item.name) || "").split(/\s*[\/|]\s*/).map(tok).filter(t => t.size);
    if (!parts.length) return 0;
    let bestIdx = 0, bestScore = 0, bestExtra = Infinity;
    rows.forEach((r, j) => {
      parseCsvCells(r).forEach(cell => {
        const ct = tok(cell);
        if (!ct.size || ct.size > 25) return;           // خلايا الوصف الطويلة ليست أسماء
        parts.forEach(T => {
          let hit = 0; T.forEach(w => { if (ct.has(w)) hit++; });
          const score = hit / T.size, extra = ct.size - hit;
          if (score > bestScore || (score === bestScore && extra < bestExtra)) { bestScore = score; bestExtra = extra; bestIdx = base + j + 1; }
        });
      });
    });
    return bestScore >= 0.75 ? bestIdx : 0;
  }
  function findHeaderIndex(rows) {
    const lim = Math.min(rows.length - 2, 7);
    if (lim < 1) return 0;
    const counts = [];
    let max = 0;
    for (let i = 0; i <= lim; i++) { counts[i] = csvCellCount(rows[i]); if (counts[i] > max) max = counts[i]; }
    for (let i = 0; i <= lim; i++) if (counts[i] >= Math.max(2, Math.ceil(max * 0.6))) return i;
    return 0;
  }
  function splitCsvRows(text) {
    const rows = [];
    let cur = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQ && text[i + 1] === '"') { cur += '""'; i++; continue; }
        inQ = !inQ; cur += ch; continue;
      }
      if (!inQ && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        if (cur.trim()) rows.push(cur);
        cur = ""; continue;
      }
      cur += ch;
    }
    if (cur.trim()) rows.push(cur);
    return rows;
  }

  /* ------------------------------ 4) قراءة الفواتير والجداول والصور ------------------------------ */
  // مخطط الجداول: رقم السطر إلزامي وصحيح (في الصور/PDF لا أسطر فيبقى اختيارياً) فيرتبط كل منتج بسطره وبوصفه الأصلي
  const INVOICE_SCHEMA_TABLE = JSON.parse(JSON.stringify(INVOICE_SCHEMA));
  INVOICE_SCHEMA_TABLE.properties.items.items.properties.row = { type: "integer" };

  function buildInvoicePrompt(storeCategories, isChunk, descFromTable) {
    const cats = (storeCategories || []).map(catLabel).filter(Boolean);
    const categoriesContext = cats.length
      ? "أقسام المتجر الحالية (الفرعي بصيغة «الأب › الفرعي»): [" + cats.join("، ") + "]. اختر لكل منتج أنسب قسم من هذه القائمة وانسخه حرفياً كما هو (بمساره كاملاً إن كان فرعياً)."
      : "";
    const nameCore = "الاسم التجاري الكامل = الماركة + اسم المنتج + نوعه (مثل: The Ordinary Niacinamide 10% + Zinc 1% Serum). **التراكيز والنسب المئوية (10%، 1%) ورقم الموديل جزء من الاسم فأبقِها فيه**، وجرّد الاسم فقط من الحجم/السعة والألوان والمقاسات (لها حقولها).";
    const nameRule = bilingualNames()
      ? "1. name (إلزامي): " + nameCore + " الصيغة \"الاسم بالعربي / Name in English\". إن كان المصدر بلغة واحدة فاكتب مقابله بالأخرى (تعريب أو ترجمة أو الاسم التجاري المعروف) فقط إذا كنت متأكداً؛ وإن لم تكن متأكداً فاكتب الاسم كما ورد بلغته فقط ولا تخترع اسماً تجارياً."
      : "1. name (إلزامي): " + nameCore + " اكتبه **كما ورد في المصدر وبلغته نفسها دون ترجمة أو تعريب أو إضافة لغة ثانية**.";
    return [
      "أنت نظام استخراج بيانات منتجات من المستندات. حلّل البيانات المرفقة (صورة أو PDF أو جدول) واستخرج المنتجات.",
      isChunk ? "ملاحظة: هذه دفعة من جدول أكبر؛ السطر الأول عناوين الأعمدة وبقية الأسطر منتجات. العمود الأول (#) رقم السطر وليس بيانات منتج: أرجع لكل منتج في الحقل row رقم سطره من هذا العمود (وإن دمجت عدة أسطر لمنتج واحد فرقم أول سطر)." : "",
      categoriesContext,
      "",
      "قواعد الدقة (الأهم): استخرج فقط ما هو مكتوب فعلاً في المصدر. ممنوع اختراع أو تخمين سعر أو كمية أو باركود أو رابط أو وصف. الحقل غير الموجود يأخذ قيمته الافتراضية المذكورة أدناه.",
      "تجاهل أسطر المجاميع والضريبة والشحن والخصم العام وأرقام الصفحات والعناوين وأي سطر ليس منتجاً.",
      "المنتج الواحد يُرجَع مرة واحدة؛ فإن تكرر في عدة أسطر تختلف باللون/المقاس فقط فأرجعه مرة واحدة مع ألوانه/مقاساته وجمع كمياته.",
      "حوّل الأرقام العربية الهندية (٠١٢٣…) إلى لاتينية.",
      "",
      "الحقول لكل منتج:",
      nameRule,
      "2. brand: ماركة المنتج إن ظهرت أو عُرفت من اسمه، وإلا \"\". productType: نوع المنتج بكلمتين أو ثلاث (سيروم، شامبو، هاتف ذكي، قميص)، وإلا \"\".",
      "3. category: لا تعتمد على عمود تصنيف قديم في الملف. الترتيب الإلزامي: (أ) **نوع المنتج أولاً** — اختر القسم الذي يطابق نوعه فعلاً (سيروم/مرطب/غسول ← العناية بالبشرة، شامبو/بلسم ← العناية بالشعر، أحمر شفاه/كحل ← المكياج، عطر ← العطور، هاتف/سماعة ← إلكترونيات)؛ (ب) وإن لم يوجد قسم لنوعه فقسم باسم **ماركته** إن وُجد؛ (ج) وإلا اكتب اسم قسم عربياً موجزاً مناسباً لنوعه. **ممنوع إجبار المنتج على قسم لا يناسبه** (سيروم بشرة ليس في «العناية بالشعر»).",
      "4. colors: استخرج ألوان أو درجات المنتج. إذا كان الجدول يحتوي على عمود للون أو المظهر (مثل: اللون، اللون / المظهر، المظهر، الدرجة، Shade، Color)، فانسخ محتواه إلزامياً كما ورد في الخلية وضع كل درجة كعنصر مستقل في colors، ولا تفرغ الحقل أبداً حتى لمنتجات العناية بالبشرة أو الكريمات. استخرج اللون الأساسي (مثل: وردي، بيج، أبيض، بنفسجي، عسلي، كرزي) وضع درجته التقريبية في hex بصيغة #RRGGBB.",      "5. sizes: المقاسات/السعات/الأوزان/السعات التخزينية الفعلية المتاحة كخيارات شراء فقط (\"50ml\"، \"30 مل\"، \"S\"، \"XL\"، \"42\"، \"256GB\") وإلا []. **عمود «سعة الذاكرة» أو «رام/تخزين» أو Storage/Capacity في الجدول هو سعات شراء**: انسخ قيمة الخلية كما هي (مثل 12/256 أو 16/1024 أو 8GB/128GB) كعنصر في sizes (تُوحَّد تلقائياً إلى 12GB + 256GB) ولا تتركها فارغة ولا تضعها في الوصف. **النسب المئوية وتراكيز المكوّنات (10%، 1%) وعدد القطع ورقم الموديل ليست مقاسات** — هي جزء من الاسم.",
      "6. image: رابط مباشر لصورة المنتج (يبدأ بـ http:// أو https://) إن وُجد صراحة في المصدر وإلا null.",
      "7. price: سعر بيع الوحدة (وليس إجمالي السطر ولا سعر الجملة إن وُجد عمود لسعر البيع) رقماً فقط بلا فواصل أو عملة. إن لم يتضح السعر فـ 0.",
      "8. qty: الكمية صحيحاً؛ إن لم تُذكر فـ 1.",
      "9. barcode: الباركود/كود المادة إن وُجد وإلا null.",
      descFromTable
        ? "10. description: اتركه دائماً \"\" (فارغاً). وصف المنتجات موجود في عمود في الجدول وسيُنسخ منه آلياً حرفياً؛ لا تكتبه ولا تلخصه (هذا يوفّر وقتاً كبيراً)."
        : "10. description: انسخ نص عمود الوصف/المواصفات/التفاصيل (Description/Details/Specs) من الجدول **حرفياً كما هو** حتى لو كان قصيراً أو ذكر اسم المنتج أو الماركة أو الحجم؛ لا تختصره ولا تعيد صياغته ولا تتجاهله ولا تستبدله بوصف من عندك. في الصور والـ PDF انسخ فقرة الوصف المطبوعة إن وُجدت. ممنوع أن تضع اسم المنتج وحده كوصف. إن لم يوجد في المصدر وصف فاتركه \"\" (يُكتب لاحقاً تلقائياً).",
      "",
      "إن كانت الصورة لعبوة منتج واحد أو لرف: اقرأ اسم كل منتج من عبوته نفسها (الماركة + النوع + الحجم المكتوب عليها)؛ السعر 0 والكمية 1 ما لم تظهر على الصورة.",      "",
      "أرجع JSON فقط بلا أي نص آخر:",
      '{"items":[{"name":"","brand":"","productType":"","category":"","price":0,"qty":1,"barcode":null,"colors":[{"name":"","hex":""}],"sizes":[],"description":"","image":null,"row":null}]}',
      'وإن لم تجد منتجات فأرجع {"items":[]}.'
    ].filter(l => l !== undefined).join("\n");
  }

  function readItems(resp) {
    const d = resp && resp.data;
    if (Array.isArray(d)) return d;
    return d && Array.isArray(d.items) ? d.items : [];
  }

  // inputData: نص CSV (mimeType = text/csv|text/plain) أو base64 لصورة/PDF.
  // يرجع { items, warnings[] } — العناصر منظّفة ومدموجة المكرر. opts.onProgress(done, total)
  async function scanInvoice(inputData, mimeType = "image/jpeg", storeCategories = [], opts = {}) {
    assertEnabled();
    const warnings = [];
    const isText = mimeType === "text/plain" || mimeType === "text/csv";
    let raw = [];

    if (isText) {
      const rows = splitCsvRows(String(inputData || ""));
      if (rows.length < 2) return { items: [], warnings };
      const hi = findHeaderIndex(rows);
      if (hi > 0) warnings.push("تم تجاهل " + hi + " سطر علوي (عنوان/شعار) قبل سطر عناوين الأعمدة.");
      const header = rows[hi];
      // سطرا المثال في القالب الجاهز «(مثال) …» يُتجاهلان تلقائياً حتى لو نسي المدير حذفهما
      const body = rows.slice(hi + 1).filter(r => !parseCsvCells(r).some(cell => /^\s*\(\s*مثال\s*\)/.test(cell)));
      const headerCells = parseCsvCells(header);
      const descCol = findDescColumn(headerCells, body);   // عمود الوصف (إن وُجد) يُنسخ حرفياً من الملف بعد رد النموذج
      if (typeof console !== "undefined") console.info("[وصف] العمود المعتمد:", descCol >= 0 ? headerCells[descCol] : "(لا يوجد)", "| الأعمدة:", headerCells.join(" ، "));
      const chunks = [];
      for (let i = 0; i < body.length; i += CHUNK_ROWS) chunks.push(body.slice(i, i + CHUNK_ROWS));
      const prompt = buildInvoicePrompt(storeCategories, true, descCol >= 0);
      let lastError = null, failed = 0, doneChunks = 0;
      const results = new Array(chunks.length).fill(null);
      const runChunk = async (i) => {
        try {
          // نرقّم الأسطر (عمود #) ليرجع النموذج رقم سطر كل منتج فنربطه بخلية الوصف الأصلية
          const base = i * CHUNK_ROWS;
          const numbered = ["#," + header].concat(chunks[i].map((r, j) => (base + j + 1) + "," + r)).join("\n");
          const resp = await callServerApi("gemini_vision", { prompt, fileText: numbered, schema: INVOICE_SCHEMA_TABLE });
          let got = readItems(resp);
          if (descCol >= 0) {
            const sameCount = got.length === chunks[i].length;   // نفس عدد المنتجات والأسطر: الترتيب هو الاحتياط الأخير
            got = got.map((it, k) => {
              let n = Number(it && it.row);
              if (!Number.isInteger(n) || n <= base || n > base + chunks[i].length) n = matchRowByName(it, chunks[i], base);   // لا رقم صالح: نطابق بالاسم
              if (!n && sameCount) n = base + k + 1;
              if (!n) return it;                                                                                          // لا مطابقة: نبقي ما كتبه النموذج
              const cell = String(parseCsvCells(body[n - 1])[descCol] || "").replace(/\s*\[URL:[^\]]*\]/g, "");   // [URL: …] تضيفها واجهة الأدمن لروابط الإكسل
              return Object.assign({}, it, { description: cleanText(cell, 2000), _srcDesc: true });
            });
          }
          results[i] = got;
          if (resp.partial) warnings.push("الدفعة " + (i + 1) + " من " + chunks.length + " قُطع ردها وقد تنقص بعض منتجاتها. راجع الصفوف المقابلة.");
        } catch (e) {
          failed++; lastError = e;
          warnings.push("فشلت الدفعة " + (i + 1) + " من " + chunks.length + " (صفوف " + (i * CHUNK_ROWS + 1) + "–" + Math.min((i + 1) * CHUNK_ROWS, body.length) + "): " + e.message);
        }
        doneChunks++;
        if (opts.onProgress) opts.onProgress(doneChunks, chunks.length);
      };
      if (opts.onProgress) opts.onProgress(0, chunks.length);
      // 3 دفعات في آن واحد بدل واحدة بعد أخرى (الوقت ≈ ثلث ما كان في الملفات الكبيرة) مع حفظ ترتيب الأسطر
      for (let g = 0; g < chunks.length; g += 3) {
        await Promise.all(chunks.slice(g, g + 3).map((_, k) => runChunk(g + k)));
      }
      results.forEach(r => { if (r) raw = raw.concat(r); });
      if (failed === chunks.length && lastError) throw lastError;
    } else {
      const mime = String(mimeType || "").toLowerCase().replace("image/jpg", "image/jpeg");
      if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) throw new Error("نوع الملف غير مدعوم. استخدم صورة (JPEG/PNG/WEBP) أو PDF.");
      const resp = await callServerApi("gemini_vision", { prompt: buildInvoicePrompt(storeCategories, false), base64Data: inputData, mimeType: mime, schema: INVOICE_SCHEMA });
      raw = readItems(resp);
      if (resp.partial) warnings.push("قُطع رد الذكاء الاصطناعي لكثرة المنتجات وقد تنقص بعضها. أعد المسح على أجزاء أصغر.");
    }

    const norm = normalizeItems(raw);
    if (norm.badBarcodes) warnings.push(norm.badBarcodes + " باركود مشوَّه بسبب تنسيق الإكسل (مثل 8.99E+12) فأُهمل. اجعل عمود الباركود «نصاً» في الإكسل وأعد الاستيراد، أو أدخله يدوياً.");
    if (norm.merged) warnings.push("تم دمج " + norm.merged + " سطر مكرر (نفس المنتج) وجمع كمياتها.");
    if (norm.dropped) warnings.push("تم تجاهل " + norm.dropped + " عنصراً غير صالح (بلا اسم واضح).");
    return { items: norm.items, warnings };
  }

  /* ------------------------------ 5) مسح الرف (غير مستعملة حالياً في admin.js) ------------------------------ */
  async function scanShelf(base64Image, mimeType = "image/jpeg") {
    assertEnabled();
    const prompt = [
      "حلل صورة الرف واكتشف كل منتج/عبوة منفصلة ظاهرة فعلاً. لا تخترع منتجات غير مرئية.",
      "لكل منتج: name (الاسم كما يُقرأ من العبوة)، category (قسم تقريبي)، box_2d = [ymin, xmin, ymax, xmax] بأرقام صحيحة من 0 إلى 1000.",
      'أرجع JSON فقط: {"products":[{"name":"","category":"","box_2d":[0,0,0,0]}]}'
    ].join("\n");
    const resp = await callServerApi("gemini_vision", { prompt, base64Data: base64Image, mimeType, schema: SHELF_SCHEMA });
    const d = resp.data;
    const list = d && Array.isArray(d.products) ? d.products : (Array.isArray(d) ? d : []);
    const products = [];
    for (const p of list) {
      const name = cleanText(p && p.name, 200);
      const b = p && Array.isArray(p.box_2d) ? p.box_2d.map(Number) : null;
      if (!name || !b || b.length !== 4 || b.some(n => !Number.isFinite(n))) continue;
      const [y1, x1, y2, x2] = b.map(n => Math.max(0, Math.min(1000, Math.round(n))));
      if (y2 <= y1 || x2 <= x1) continue;
      products.push({ name, category: cleanText(p.category, 80), box_2d: [y1, x1, y2, x2] });
    }
    return { products, partial: !!resp.partial };
  }

  /* ------------------------------ 6) إثراء المنتجات ببحث Google (وصف/ألوان/مقاسات/صورة/قسم) ------------------------------ */
  // ملف المبيعات يحوي غالباً الاسم والكود والسعر والعدد فقط. هنا يبحث Gemini (Grounding) عن المنتج الحقيقي ويُكمل الوصف والألوان والمقاسات والقسم (لا صور).
  // قواعد الدقة: (1) لا يُعتمد أي رد غير مؤسَّس على مصادر بحث فعلية (يرجعها الخادم من groundingMetadata لا من كلام النموذج)،
  // (2) الثقة المنخفضة أو «لم يُعثر على المنتج» ← تُترك الحقول فارغة بدل التخمين، (3) لا نستبدل ما كتبه التاجر (الاسم الرسمي يُعرض كاقتراح).
  const ENRICH_SCHEMA = {
    type: "object",
    properties: {
      found: { type: "boolean" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      officialName: STR, brand: STR, productType: STR,
      category: STR, suggestedCategory: STR,
      description: STR,
      colors: { type: "array", items: COLOR_ITEM }, sizes: { type: "array", items: STR }
    },
    required: ["found", "confidence", "officialName", "brand", "productType", "category", "suggestedCategory", "description", "colors", "sizes"]
  };

  function buildEnrichPrompt(item, categories) {
    const cats = (categories || []).map(catLabel).filter(Boolean);
    const nameRule = bilingualNames()
      ? "الاسم الرسمي الكامل للمنتج بصيغة \"الاسم بالعربي / Official English Name\" (الاسم التجاري الرسمي كما تعرضه الشركة المصنّعة)"
      : "الاسم الرسمي الكامل للمنتج كما تعرضه الشركة المصنّعة وبلغته الأصلية دون ترجمة";
    return [
      "ابحث في الإنترنت (Google) عن المنتج التالي المعروض في متجر، وحدّد صفحته الرسمية أو صفحات متاجر معتمدة، ثم أكمل بياناته.",
      "اسم المنتج كما في ملف التاجر: «" + cleanText(item.name, 200) + "»" + (item.brand ? " — الماركة: " + item.brand : "") + (item.productType ? " — النوع: " + item.productType : ""),
      item.barcode ? "الباركود/الكود: " + item.barcode : "",
      "أقسام المتجر الحالية (الفرعي بصيغة «الأب › الفرعي»): [" + cats.join("، ") + "]",
      "",
      "قواعد الدقة الصارمة (الأهم):",
      "- found=true فقط إن وجدت **المنتج نفسه** (الماركة والنوع والحجم/الإصدار) في مصادر البحث. إن لم تجده أو التبس بمنتج مشابه فـ found=false وكل الحقول النصية \"\" والمصفوفات [] — لا تخمّن من اسم مشابه ولا من معرفتك السابقة.",
      "- confidence: high إن طابقت المصادر المنتج تماماً، medium إن طابقت جزئياً مع تأكيد النوع والماركة، low عند أي شك.",
      "- ممنوع اختراع مكوّنات أو ألوان أو أحجام أو نسب أو ادعاءات لم ترد في المصادر.",
      "",
      "الحقول:",
      "1. officialName: " + nameRule + ".",
      "2. brand: الماركة. productType: نوع المنتج بكلمتين أو ثلاث (مثل: شامبو، كريم أساس، هاتف ذكي).",
      "3. category: **انسخ حرفياً** من قائمة الأقسام بهذا الترتيب: (أ) قسم يطابق نوع المنتج (شامبو ← «العناية بالشعر»)، وإلا (ب) قسم باسم ماركة المنتج، وإلا اتركه \"\". لا تنشئ اسم قسم هنا.",
      "4. suggestedCategory: فقط إن كان category فارغاً — اسم قسم عربي موجز مناسب لنوع المنتج، وإلا \"\".",
      "5. description: **المواصفات الرسمية** للمنتج بالعربية (جملتان إلى ثلاث بأسلوب تسويقي جذاب) مبنية **فقط** على ما ورد في المصادر (الفوائد، المكوّنات الرئيسية، السعة، المواصفات التقنية…). لا تكرر اسم المنتج ولا الحجم كوصف. بلا سعر، بلا إيموجي، وبلا ادعاءات طبية أو علاجية ما لم ترد رسمياً. إن لم تجد مواصفات رسمية فاتركه \"\".",
      "6. colors: الألوان/الدرجات الرسمية المتوفرة للمنتج كخيارات شراء كما تعرضها المصادر، وإلا []. كل لون كائن {name, hex}: name = اسم اللون الرسمي كما تعرضه المصادر (Obsidian، Porcelain، Titanium Gray)، و hex = درجته الفعلية بصيغة #RRGGBB كما تظهر في صور/ألوان المنتج الرسمية (لا أزرق افتراضياً). كلمات القوام (شفاف/مائي/جل/سائل) ليست ألواناً.",
      "7. sizes: الأحجام/السعات/المقاسات الرسمية المتوفرة كخيارات (\"50ml\"، \"256GB\"، \"S\")، وإلا []. للهواتف والأجهزة اكتب السعة رام/تخزين بصيغة 12GB + 256GB. أضف الحجم المذكور في الاسم إن وُجد.",
      "",
      "أرجع JSON فقط بلا أي نص آخر."
    ].filter(x => x !== "").join("\n");
  }

  // يطبّق نتيجة البحث على المنتج (دالة صافية قابلة للاختبار). لا تستبدل الموجود؛ تكمل الناقص فقط.
  function applyEnrichment(item, result, categories) {
    const out = Object.assign({}, item);
    const d = (result && result.data) || {};
    const sources = Array.isArray(result && result.sources) ? result.sources : [];
    const grounded = !!(result && result.grounded) && sources.length > 0;
    let state = "notfound";
    if (grounded && d.found === true) state = ["high", "medium", "low"].includes(d.confidence) ? d.confidence : "low";
    const meta = { state, officialName: "", sources: sources.slice(0, 3).map(x => ({ uri: cleanText(x.uri, 500), title: cleanText(x.title, 80) })), addedVariants: false };
    out.enriched = meta;
    if (state !== "high" && state !== "medium") return out;      // لم يُعثر عليه / ثقة منخفضة ← لا نملأ شيئاً

    meta.officialName = cleanText(d.officialName, 200);
    const officialDesc = cleanText(d.description, 1200);
    if (!out.description && officialDesc && !isNameEcho(officialDesc, out.name)) { out.description = officialDesc; out.descKind = "official"; }
    const cb = buildColors(d.colors);
    if (!(out.colors && out.colors.length) && cb.names.length) { out.colors = cb.names; out.colorHex = Object.assign({}, cb.hexMap, out.colorHex || {}); meta.addedVariants = true; }
    const sizes = toSizeList(d.sizes);
    if (!(out.sizes && out.sizes.length) && sizes.length) { out.sizes = sizes; meta.addedVariants = true; }

    // القسم: (1) نوع المنتج ← (2) ماركته ← (3) اقتراح (النموذج رتّب ذلك؛ نتحقق أن النص من قائمة المتجر فعلاً)
    const resolved = d.category ? resolveCategoryName(d.category, categories) : null;
    if (resolved) out.category = resolved;
    else if (cleanText(d.suggestedCategory, 60)) out.category = cleanText(d.suggestedCategory, 60);
    return out;
  }

  const isConfigError = e => /no_grounding|لا يدعم البحث|auth_not_configured|غير مضبوط|غير موجودة على هذه الاستضافة|سجّل الدخول|غير مصرّح/.test((e && e.message) || "");
  // opts: { skip(item)→bool, onProgress(done,total), concurrency, retryDelayMs, budgetMs, perCallMs }
  // budgetMs: سقف زمني للمرحلة كلها (افتراضي aiEnrichBudgetSec = 20 ثانية). بعده لا تبدأ عمليات بحث جديدة ويُفتح المراجعة بما اكتمل.
  async function enrichItems(items, categories = [], opts = {}) {
    assertEnabled();
    const warnings = [];
    const list = Array.isArray(items) ? items.slice() : [];
    if (!enrichEnabled() || !list.length) return { items: list, warnings };

    const targets = [];
    list.forEach((it, i) => { if (!(opts.skip && opts.skip(it))) targets.push(i); });
    const max = enrichMax();
    const run = targets.slice(0, max);
    if (targets.length > max) warnings.push("أُثري أول " + max + " منتجاً فقط من " + targets.length + " (الحد aiEnrichMax). الباقي بلا إثراء — استعمل «إكمال بيانات المنتجات الناقصة» لاحقاً.");

    let done = 0, cursor = 0, stop = false, notFound = 0, lowConf = 0, failed = 0, timedOut = 0;
    const total = run.length;
    const budget = opts.budgetMs > 0 ? opts.budgetMs : enrichBudgetMs();
    const perCall = opts.perCallMs > 0 ? opts.perCallMs : 15000;
    const deadline = Date.now() + budget;
    if (opts.onProgress) opts.onProgress(0, total);

    const worker = async () => {
      while (!stop && cursor < run.length) {
        if (Date.now() >= deadline) break;          // انتهى الوقت المسموح: الباقي يُترك بلا بحث (يُكتب له شرح إعلاني بعدها)
        const idx = run[cursor++];
        const item = list[idx];
        try {
          // محاولتان فقط (ثانية واحدة بينهما) وبمهلة قصيرة لكل طلب، وكلاهما ضمن الوقت المتبقي من السقف
          let res = null, lastErr = null;
          for (let attempt = 0; attempt < 2 && !res; attempt++) {
            const left = deadline - Date.now();
            if (left < 3000) break;
            try { res = await callServerApi("gemini_search", { prompt: buildEnrichPrompt(item, categories), schema: ENRICH_SCHEMA }, 0, Math.min(perCall, left + 2000), 0); }
            catch (e) {
              lastErr = e;
              if (isConfigError(e) || /انتهت مهلة/.test(e.message || "")) break;
              if (attempt < 1) await sleep(opts.retryDelayMs === undefined ? 1000 : opts.retryDelayMs);
            }
          }
          if (!res) { if (lastErr) throw lastErr; timedOut++; done++; if (opts.onProgress) opts.onProgress(done, total); continue; }
          let enriched = applyEnrichment(item, res, categories);
          const st = enriched.enriched.state;
          if (st === "notfound") notFound++; else if (st === "low") lowConf++;
          list[idx] = enriched;
        } catch (e) {
          failed++;
          if (/انتهت مهلة/.test((e && e.message) || "")) timedOut++;
          if (isConfigError(e)) {
            stop = true;       // خطأ إعداد: لا فائدة من تكرار الطلبات
            warnings.push("توقف الإثراء: " + e.message);
          }
        }
        done++;
        if (opts.onProgress) opts.onProgress(done, total);
      }
    };
    const n = Math.max(1, Math.min(opts.concurrency || 4, 6));
    await Promise.all(Array.from({ length: n }, worker));

    const skippedByTime = Math.max(0, run.length - cursor) + timedOut;
    if (skippedByTime) warnings.push(skippedByTime + " منتج لم يكتمل بحثه ضمن " + Math.round(budget / 1000) + " ثانية فتُرك دون إثراء (أكملها يدوياً أو ارفع aiEnrichBudgetSec).");
    if (notFound) warnings.push(notFound + " منتج لم يُعثر عليه بثقة في الإنترنت فتُرك بلا وصف/ألوان/مقاسات (أكملها يدوياً).");
    if (lowConf) warnings.push(lowConf + " منتج بثقة منخفضة: لم تُملأ بياناته حفاظاً على الدقة.");
    if (failed - timedOut > 0 && !stop) warnings.push("فشل إثراء " + (failed - timedOut) + " منتج لخطأ مؤقت (أعد المحاولة بزر «إكمال بيانات المنتجات الناقصة»).");
    return { items: list, warnings, stats: { total, notFound, lowConf, failed, timedOut } };
  }

  const api = {
    generateDescription, parsePriceCommand, scanShelf, scanInvoice,
    prepareImage, preparePdf,
    // للاختبارات وللاستعمال من admin.js
    normalizeItems, normalizePricePlan, toNumber, splitCsvRows, cleanDescription, normKey, parseHexColor, hexToColorName, splitColorEntry, buildInvoicePrompt, buildEnrichPrompt, applyEnrichment, enrichItems, completeDescriptions, isValidSize, isValidColor, isNameEcho,
    colorHexFromName, resolveColorHex, parseCapacity, normalizeSize, parseCsvCells, findDescColumn, matchRowByName
  };
  return api;
})();

if (typeof window !== "undefined") window.StoreAI = StoreAI;
if (typeof module !== "undefined" && module.exports) module.exports = StoreAI;
