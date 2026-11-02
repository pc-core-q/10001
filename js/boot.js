/* ==========================================================================
   boot.js — محرّك التهيئة (لا يُعدَّل لكل متجر)
   --------------------------------------------------------------------------
   يقرأ STORE_CONFIG من js/config.js ويطبّقه على الصفحة قبل أول رسم:
     • الثيم: يبني كل متغيرات CSS (الألوان، الدرجات المشتقة، الخط، الاستدارة…)
     • الخط (Google Fonts) · أيقونة الموقع (favicon) · لون شريط المتصفح
     • preconnect لخوادم Firebase / ImageKit
     • Google Analytics (GA4)
     • استبدال الرموز {{storeName}} … في عنوان الصفحة ووسوم الميتا
     • الجلب المبكر لبيانات الصفحة الرئيسية (للصفحات التي تحمل data-early-fetch)
   يُحمَّل في كل صفحة مباشرة بعد config.js.
   ========================================================================== */
(function () {
  "use strict";

  var C = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG) ? STORE_CONFIG : {};
  var T = C.theme || {};
  var doc = document;
  var root = doc.documentElement;

  /* ---------- الثيمات الجاهزة: تأتي من js/themes.js (STORE_THEMES) ---------- */
  var BUILTIN = {
    label: "كحلي وذهبي",
    colors: { primary: "#172554", secondary: "#2563EB", accent: "#D4A853", bg: "#F8FAFC", surface: "#FFFFFF", text: "#0F172A", textMuted: "#64748B", border: "#E2E8F0" },
    fontFamily: "Tajawal", fontWeights: "400;500;700", radiusCard: 14, radiusControl: 10, cardImageRatio: "1/1", cardImageFit: "cover"
  };
  var PRESETS = {};
  if (typeof STORE_THEMES !== "undefined" && STORE_THEMES) Object.keys(STORE_THEMES).forEach(function (k) { PRESETS[k] = STORE_THEMES[k]; });
  if (!PRESETS["navy-gold"]) PRESETS["navy-gold"] = BUILTIN;   // احتياط إن لم يُحمَّل themes.js

  /* ---------- أدوات الألوان ---------- */
  function parse(h) {
    h = String(h == null ? "" : h).trim().replace(/^#/, "");
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(a) {
    return "#" + a.map(function (v) {
      return ("0" + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2);
    }).join("").toUpperCase();
  }
  function mix(c1, c2, w) { // w = حصة اللون الأول (0..1)
    var a = parse(c1), b = parse(c2);
    return toHex([0, 1, 2].map(function (i) { return a[i] * w + b[i] * (1 - w); }));
  }
  function lum(c) {
    var a = parse(c).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function rgb(c) { return parse(c).join(","); }

  /* ---------- اختيار القالب (مع معاينة اختيارية للعرض على العملاء) ---------- */
  // تسامح مع الأخطاء الشائعة في الاسم: مسافات زائدة، أحرف كبيرة، شرطة سفلية بدل الشرطة
  function normName(n) { return String(n == null ? "" : n).trim().toLowerCase().replace(/[\s_]+/g, "-"); }
  function findName(n) { var k = normName(n); return (k && Object.prototype.hasOwnProperty.call(PRESETS, k)) ? k : ""; }
  function suggest(n) {
    var words = normName(n).split("-").filter(Boolean);
    return Object.keys(PRESETS).map(function (k) {
      var kw = k.split("-"), score = 0;
      words.forEach(function (w) { kw.forEach(function (x) { if (x === w || (w.length > 3 && x.indexOf(w) === 0) || (x.length > 3 && w.indexOf(x) === 0)) score++; }); });
      return { k: k, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 3).map(function (x) { return x.k; });
  }
  function previewName() {
    if (!T.allowPreview) return "";
    try {
      var q = new URLSearchParams(location.search).get("theme");
      if (q === "off") { sessionStorage.removeItem("store_theme_preview"); return ""; }
      var f = q ? findName(q) : "";
      if (f) { sessionStorage.setItem("store_theme_preview", f); return f; }
      return findName(sessionStorage.getItem("store_theme_preview"));
    } catch (e) { return ""; }
  }
  var themeError = "";
  var presetName = previewName();
  if (!presetName) {
    var wanted = (T.preset == null || String(T.preset).trim() === "") ? "navy-gold" : T.preset;
    presetName = findName(wanted);
    if (!presetName) {
      var tips = suggest(wanted), all = Object.keys(PRESETS).join(" | ");
      themeError = "الثيم «" + wanted + "» غير موجود في js/themes.js — استُخدم navy-gold بدلاً منه. " +
        (tips.length ? "هل تقصد: " + tips.join(" أو ") + "؟ " : "") + "الأسماء المتاحة: " + all;
      console.warn("[theme] " + themeError);
      presetName = "navy-gold";
    }
  }
  if (!PRESETS[presetName]) presetName = "navy-gold";
  // تنبيه مرئي على الصفحة أثناء التطوير فقط (فتح الملف مباشرة/localhost/وضع المعاينة) — لا يظهر لزوار الموقع الفعلي
  if (themeError && (location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || T.allowPreview)) {
    var showErr = function () {
      var d = doc.createElement("div");
      d.setAttribute("dir", "rtl");
      d.setAttribute("style", "position:fixed;z-index:99999;top:0;left:0;right:0;padding:10px 14px;background:#B91C1C;color:#fff;font:14px/1.6 system-ui,sans-serif;text-align:center");
      d.textContent = "⚠ " + themeError;
      doc.body.appendChild(d);
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", showErr); else showErr();
  }
  var P = PRESETS[presetName];
  var base = P.colors || BUILTIN.colors;
  var isPreview = !!previewName();
  var custom = isPreview ? {} : (T.colors || {});   // ألوان config.js
  var own = isPreview ? {} : T;                      // بقية إعدادات config.js (خط/شكل)

  // قيمة الشكل/الخط: config.js إن لم تكن فارغة، وإلا قيمة الثيم
  function sv(k) { var x = own[k]; return (x === "" || x == null) ? P[k] : x; }

  function pick(key) {
    var v = custom[key];
    if (v && String(v).trim()) {
      if (parse(v)) return toHex(parse(v));
      console.warn("[theme] لون غير صالح في theme.colors." + key + ":", v, "— استُخدم لون القالب");
    }
    return base[key];
  }

  /* ---------- بناء متغيرات CSS ---------- */
  function buildVars() {
    var primary = pick("primary"), secondary = pick("secondary"), accent = pick("accent");
    var bg = pick("bg"), surface = pick("surface"), text = pick("text");
    var muted = pick("textMuted"), border = pick("border");
    var onPrimary = lum(primary) > 0.5 ? text : "#FFFFFF";

    var v = {
      "--primary": primary, "--secondary": secondary, "--accent": accent,
      "--bg": bg, "--surface": surface, "--text": text, "--text-2": muted, "--border": border,

      "--primary-hover": mix(primary, "#000000", 0.82),
      "--secondary-hover": mix(secondary, "#000000", 0.85),
      "--secondary-50": mix(secondary, "#FFFFFF", 0.09),
      "--secondary-100": mix(secondary, "#FFFFFF", 0.18),
      "--accent-soft": mix(accent, "#FFFFFF", 0.14),
      "--accent-ink": mix(accent, "#000000", 0.62),
      "--accent-hover": mix(accent, "#FFFFFF", 0.82),
      "--surface-2": mix(bg, border, 0.6),
      "--border-soft": mix(border, "#FFFFFF", 0.55),
      "--border-strong": mix(border, "#000000", 0.88),

      "--on-primary": onPrimary,
      "--on-primary-rgb": rgb(onPrimary),
      "--on-primary-soft": mix(onPrimary, primary, 0.8),
      "--on-primary-muted": mix(onPrimary, primary, 0.7),
      "--on-primary-dim": mix(onPrimary, primary, 0.55),

      "--primary-rgb": rgb(primary), "--accent-rgb": rgb(accent), "--secondary-rgb": rgb(secondary), "--text-rgb": rgb(text),

      "--ink-800": mix(text, muted, 0.8), "--ink-700": mix(text, muted, 0.6),
      "--ink-600": mix(text, muted, 0.35), "--ink-300": mix(muted, surface, 0.55),
      "--navy-2": mix(text, muted, 0.6), "--olive-400": mix(muted, surface, 0.55),

      "--info": secondary, "--info-bg": mix(secondary, "#FFFFFF", 0.07),
      "--info-line": mix(secondary, "#FFFFFF", 0.25), "--info-ink": mix(secondary, "#000000", 0.85)
    };

    ["success", "warning", "error"].forEach(function (k) {
      var c = opt(k);
      if (c) {
        v["--" + k] = c;
        v["--" + k + "-bg"] = mix(c, "#FFFFFF", 0.08);
        v["--" + k + "-line"] = mix(c, "#FFFFFF", 0.25);
        v["--" + k + "-ink"] = mix(c, "#000000", 0.75);
        if (k === "error") { v["--danger"] = c; v["--danger-bg"] = v["--error-bg"]; }
      }
    });

    function num(x) { return (x === "" || x == null) ? NaN : Number(x); }
    var rc = num(sv("radiusCard")), rk = num(sv("radiusControl")), cw = num(sv("containerWidth"));
    if (isFinite(rc) && rc >= 0 && rc <= 60) v["--r-card"] = rc + "px";
    if (isFinite(rk) && rk >= 0 && rk <= 60) v["--r-ctl"] = rk + "px";
    if (isFinite(cw) && cw >= 900 && cw <= 2000) v["--container"] = cw + "px";
    if (/^\d+\s*\/\s*\d+$/.test(String(sv("cardImageRatio") || ""))) v["--card-image-ratio"] = String(sv("cardImageRatio")).replace(/\s+/g, "");
    var fit = sv("cardImageFit");
    if (fit === "cover" || fit === "contain") v["--card-image-fit"] = fit;

    var sys = "system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif";
    var fam = String(sv("fontFamily") || "").replace(/['";{}<>]/g, "").trim();
    if (/^system$/i.test(fam)) fam = "";               // fontFamily: "system" = خط النظام بدون تحميل
    var customFont = !!(own.fontFamily && String(own.fontFamily).trim());
    var fontWeights = String(own.fontWeights || (customFont ? "" : P.fontWeights) || "400;500;700");
    var stack = fam ? "'" + fam + "'," + sys : sys;
    v["--font-display"] = stack; v["--font-body"] = stack;

    /* ---------- تخصيص متقدم (كله اختياري): كل مفتاح فارغ يتبع الألوان الأساسية ---------- */
    function opt(key) {
      var x = custom[key];
      if (x && String(x).trim()) {
        if (parse(x)) return toHex(parse(x));
        console.warn("[theme] لون غير صالح في theme.colors." + key + ":", x, "— سيُتجاهل");
      }
      var y = base[key];                              // لون اختياري يحدده الثيم نفسه (مثل headerBg/buttonBg)
      return (y && parse(y)) ? toHex(parse(y)) : "";
    }
    function inkOn(c) { return lum(c) > 0.5 ? text : "#FFFFFF"; }
    function darker(c, k) { return mix(c, "#000000", k); }

    // (أ) الأزرار الرئيسية: الخلفية والنص والتحويم
    var btnBg = opt("buttonBg"), btnTx = opt("buttonText"), btnHv = opt("buttonHoverBg");
    if (btnBg) {
      v["--btn-bg"] = btnBg;
      v["--btn-text"] = btnTx || inkOn(btnBg);
      v["--btn-hover-bg"] = btnHv || darker(btnBg, 0.85);
    } else {
      if (btnTx) v["--btn-text"] = btnTx;
      if (btnHv) v["--btn-hover-bg"] = btnHv;
    }
    if (v["--btn-hover-bg"]) v["--btn-active-bg"] = darker(v["--btn-hover-bg"], 0.88);

    // (ب) زر الهيرو (تسوق الآن)
    var hbBg = opt("heroButtonBg"), hbTx = opt("heroButtonText");
    if (hbBg) {
      v["--hero-btn-bg"] = hbBg;
      v["--hero-btn-text"] = hbTx || inkOn(hbBg);
      v["--hero-btn-hover-bg"] = darker(hbBg, 0.88);
    } else if (hbTx) v["--hero-btn-text"] = hbTx;

    // (ج) النصوص: العناوين والأسعار
    var headingC = opt("heading"), priceC = opt("price");
    if (headingC) v["--heading-color"] = headingC;
    if (priceC) v["--price-color"] = priceC;

    // (د) الخلفيات المنفصلة + نص كل منطقة (يُحسب تلقائياً من سطوع خلفيتها أو يُحدَّد يدوياً)
    var extra = "";
    function scope(sel, bgVar, bgKey, txKey) {
      var bgC = opt(bgKey), txC = opt(txKey);
      if (bgC) v[bgVar] = bgC;
      if (!bgC && !txC) return;
      var baseBg = bgC || primary, on = txC || inkOn(baseBg);
      extra += sel + "{--on-primary:" + on + ";--on-primary-rgb:" + rgb(on) +
        ";--on-primary-soft:" + mix(on, baseBg, 0.8) + ";--on-primary-muted:" + mix(on, baseBg, 0.7) +
        ";--on-primary-dim:" + mix(on, baseBg, 0.55) + "}";
    }
    if (!custom.heroBg && custom.hero) custom.heroBg = custom.hero;   // الاسم القديم hero ما زال يعمل
    scope(".hero", "--hero-bg", "heroBg", "heroText");
    scope(".site-footer", "--footer-bg", "footerBg", "footerText");
    scope(".contact-band", "--band-bg", "bandBg", "bandText");
    scope(".admin-sidebar", "--sidebar-bg", "sidebarBg", "sidebarText");

    // الهيدر: خلفية + لون نص (العناوين والأيقونات والروابط)
    var hdBg = opt("headerBg"), hdTx = opt("headerText");
    if (hdBg) v["--header-bg"] = hdBg;
    var hdInk = hdTx || (hdBg && lum(hdBg) <= 0.5 ? "#FFFFFF" : "");
    if (hdInk) extra += ".site-header{--heading-color:" + hdInk + ";--text-2:" + mix(hdInk, hdBg || surface, 0.75) + ";--text:" + hdInk + "}";

    /* أبعاد البطاقات (theme.cardSizes): لكل موضع width/height للحاسوب وmobileWidth/mobileHeight للجوال (px).
       القيمة من config.js إن لم تكن فارغة وإلا من الثيم. غير المحددة = الشكل الأصلي المتجاوب بلا أي تغيير. */
    function cs(pl, f) {
      var o = own.cardSizes && own.cardSizes[pl] ? own.cardSizes[pl][f] : undefined;
      var x = (o === "" || o == null) ? (P.cardSizes && P.cardSizes[pl] ? P.cardSizes[pl][f] : undefined) : o;
      var n = (x === "" || x == null) ? NaN : Number(x);
      var lim = /height/i.test(f) ? [100, 900] : [80, 700];
      return (isFinite(n) && n >= lim[0] && n <= lim[1]) ? Math.round(n) : NaN;
    }
    function csSel(ids, tail) { return ids.split(",").map(function (q) { return "html body " + q + (tail || ""); }).join(","); }
    var CARD_PLACES = {
      homeProducts: { ids: "#featuredGrid,#offerGrid,#newGrid", t: "product", row: true },
      homeCategories: { ids: "#homeCategories", t: "chip" },
      productsPage: { ids: "#shopGrid", t: "product" },
      categoriesPage: { ids: "#categoriesGrid", t: "catpage" }
    };
    Object.keys(CARD_PLACES).forEach(function (pl) {
      var d = CARD_PLACES[pl];
      [[false, "min-width:768px"], [true, "max-width:767px"]].forEach(function (m) {
        var w = cs(pl, m[0] ? "mobileWidth" : "width"), h = cs(pl, m[0] ? "mobileHeight" : "height");
        if (isNaN(w) && isNaN(h)) return;
        var r = "", card = ">:is(.product-card,.skeleton-card)";
        if (d.t === "product") {
          if (!isNaN(w)) {
            if (m[0] && d.row) r += csSel(d.ids, card) + "{flex:0 0 " + w + "px;width:" + w + "px;max-width:" + w + "px}";
            else r += csSel(d.ids) + "{grid-template-columns:repeat(auto-fill,min(" + w + "px,100%));justify-content:center}";
          }
          if (!isNaN(h)) r += csSel(d.ids, card) + "{height:" + h + "px}" + csSel(d.ids, ">.product-card .product-media") + "{aspect-ratio:auto;flex:1 1 0;min-height:0}";
        } else if (d.t === "chip") {
          var cw = isNaN(w) ? (m[0] ? 120 : 138) : w, ch = isNaN(h) ? (m[0] ? 150 : 164) : h;
          var ic = Math.max(36, Math.min(cw - 24, ch - 62, 220));
          r += csSel(d.ids, ">.cat-chip") + "{flex:0 0 " + cw + "px;width:" + cw + "px;" + (isNaN(h) ? "" : "height:" + h + "px;min-height:0;") + "}" +
            csSel(d.ids, ">.cat-chip .cat-icon") + "{width:" + ic + "px;height:" + ic + "px;min-width:" + ic + "px}" +
            csSel(d.ids, ">.cat-chip .cat-icon svg") + "{width:" + Math.round(ic * 0.4) + "px;height:" + Math.round(ic * 0.4) + "px}";
        } else {
          if (!isNaN(w)) r += csSel(d.ids) + "{grid-template-columns:repeat(auto-fill,min(" + w + "px,100%));justify-content:center}";
          if (!isNaN(h)) r += csSel(d.ids, ">.cat-main-card") + "{min-height:" + h + "px}";
        }
        extra += "@media(" + m[1] + "){" + r + "}";
      });
    });

    return { vars: v, primary: primary, fontFamily: fam, fontWeights: fontWeights, heroExtra: extra };
  }

  var built = buildVars();
  var css = ":root:root{" + Object.keys(built.vars).map(function (k) { return k + ":" + built.vars[k]; }).join(";") + "}" + built.heroExtra;
  var styleEl = doc.createElement("style");
  styleEl.id = "store-theme";
  styleEl.textContent = css;
  doc.head.appendChild(styleEl);

  function addTag(tag, attrs) {
    var el = doc.createElement(tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    doc.head.appendChild(el);
    return el;
  }

  /* لون شريط المتصفح في الهاتف */
  (function () {
    var m = doc.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", built.primary); else addTag("meta", { name: "theme-color", content: built.primary });
  })();

  /* ---------- الخط ---------- */
  (function () {
    var url = String(own.fontUrl || "").trim();
    if (!url && built.fontFamily) {
      var weights = String(built.fontWeights || "400;500;700").replace(/[^0-9;]/g, "") || "400;500;700";
      url = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(built.fontFamily).replace(/%20/g, "+") +
            ":wght@" + weights + "&display=swap";
      addTag("link", { rel: "preconnect", href: "https://fonts.googleapis.com" });
      addTag("link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" });
    }
    if (!url) return;
    var l = addTag("link", { rel: "stylesheet", href: url, media: "print" });
    l.onload = function () { this.media = "all"; };
  })();

  /* ---------- الشعار وأيقونة الموقع ---------- */
  var logoPath = String(C.logo || "assets/logo/logo.png");
  var ver = C.assetVersion ? "?v=" + encodeURIComponent(C.assetVersion) : "";
  (function () {
    Array.prototype.forEach.call(doc.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]'), function (n) { n.parentNode.removeChild(n); });
    addTag("link", { rel: "icon", type: "image/png", sizes: "192x192", href: logoPath + ver });
    addTag("link", { rel: "shortcut icon", type: "image/png", href: logoPath + ver });
    addTag("link", { rel: "apple-touch-icon", href: logoPath + ver });
    addTag("link", { rel: "apple-touch-icon", sizes: "180x180", href: logoPath + ver });
  })();

  /* ---------- preconnect للخدمات ---------- */
  function originOf(u) { try { return new URL(u).origin; } catch (e) { return ""; } }
  [C.firebaseDatabaseURL, C.imageKitEndpoint].forEach(function (u) {
    var o = originOf(u);
    if (o) addTag("link", { rel: "preconnect", href: o, crossorigin: "" });
  });

  /* ---------- Google Analytics (GA4) ---------- */
  (function () {
    var id = String(C.googleAnalyticsId || "").trim();
    if (!id || root.hasAttribute("data-no-analytics")) return;
    if (!/^G-[A-Z0-9]{4,}$/i.test(id)) { console.warn("[analytics] معرّف GA غير صالح:", id); return; }
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
    var s = doc.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    doc.head.appendChild(s);
  })();

  /* ---------- الرموز {{...}} في العنوان ووسوم الميتا ---------- */
  var siteUrl = String(C.siteUrl || "").trim().replace(/\/+$/, "") || (location.origin && location.origin !== "null" ? location.origin : "");
  var TOKENS = {
    storeName: C.storeName || "", storeTagline: C.storeTagline || "", storeDescription: C.storeDescription || "",
    currencySymbol: C.currencySymbol || "", siteUrl: siteUrl,
    logoUrl: (/^https?:/i.test(logoPath) ? logoPath : siteUrl + "/" + logoPath.replace(/^\/+/, "")) + ver
  };
  function fillTokens(str) {
    return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(TOKENS, k) ? TOKENS[k] : m; });
  }
  function fillHead() {
    if (doc.title && doc.title.indexOf("{{") > -1) doc.title = fillTokens(doc.title);
    Array.prototype.forEach.call(doc.head.querySelectorAll("meta[content]"), function (m) {
      var c = m.getAttribute("content");
      if (c && c.indexOf("{{") > -1) m.setAttribute("content", fillTokens(c));
    });
  }
  function fillBody() {
    Array.prototype.forEach.call(doc.querySelectorAll("[data-cfg]"), function (el) {
      var k = el.getAttribute("data-cfg");
      if (Object.prototype.hasOwnProperty.call(TOKENS, k)) el.textContent = TOKENS[k];
    });
    Array.prototype.forEach.call(doc.querySelectorAll("img[data-logo]"), function (img) {
      img.setAttribute("src", logoPath + ver);
    });
  }
  fillHead();
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fillBody); else fillBody();

  /* ---------- الجلب المبكر لبيانات الصفحة الرئيسية ---------- */
  (function () {
    if (!root.hasAttribute("data-early-fetch") || !window.fetch) return;
    try {
      var b = String(C.firebaseDatabaseURL || "").trim().replace(/\/+$/, "");
      if (!b) return;
      var E = window.__early = {};
      var go = function (path, qs) {
        var url = b + "/" + path + ".json" + (qs || "");
        E[url] = fetch(url, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : undefined; }).catch(function () { return undefined; });
      };
      var q = function (f, val, l) {
        return "?orderBy=" + encodeURIComponent(JSON.stringify(f)) + "&equalTo=" + encodeURIComponent(JSON.stringify(val)) + "&limitToFirst=" + l;
      };
      var now = Date.now();
      var lastMeta = Number(localStorage.getItem("last_meta_pull_time") || 0);
      var lastIdx = Number(localStorage.getItem("ws_index_checked") || 0);
      var hasLocalIndex = !!localStorage.getItem("ws_index_v");   // الفهرس الآن في IndexedDB؛ رقم نسخته في localStorage
      var hasLocalMeta = !!localStorage.getItem("ws_categories");

      // أول زيارة: نسحب الأقسام والإعلانات. وإلا نفحص فقط رقم النسخة الخفيف ws_meta_v
      if (!hasLocalMeta) { go("ws_categories"); go("ws_settings"); go("ws_ads"); }
      else if (!lastMeta || (now - lastMeta) > 300000) { go("ws_meta_v"); }

      if (!hasLocalIndex || !lastIdx || (now - lastIdx) > 300000) { go("ws_index/v"); }

      if (!hasLocalIndex) {
        go("ws_products", q("featured", true, 5));
        go("ws_products", q("isOffer", true, 5));
        go("ws_products", q("isNew", true, 5));
      }
    } catch (e) {}
  })();

  /* واجهة صغيرة للاستخدام من الكونسول أو سكربتات أخرى */
  window.StoreBoot = { presets: PRESETS, activePreset: presetName, themeError: themeError, vars: built.vars };
})();
