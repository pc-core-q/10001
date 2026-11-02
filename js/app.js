/* ==========================================================================
   app.js
   منطق مشترك بين كل صفحات المتجر: رسم الهيدر والفوتر، القائمة، الإشعارات.
   تم التحديث: توحيد مقاسات ImageKit وإلغاء طلبات الـ Blur الزائدة لتوفير الباندويث.
   ========================================================================== */

/* ---------- أدوات التهريب المشتركة (متاحة لكل الصفحات) ---------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* يمنع روابط javascript: / data: القادمة من لوحة التحكم (انستغرام/تيك توك/إعلانات) */
function safeUrl(url) {
  const u = String(url === null || url === undefined ? "" : url).replace(/[\u0000-\u0020\u007f-\u009f\u2028\u2029]+/g, "");
  return /^(https?:\/\/|\/|\.\/|tel:|mailto:)/i.test(u) || (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) ? u : "#";
}

function jsStr(value) {
  return escapeHtml(JSON.stringify(String(value === null || value === undefined ? "" : value)));
}

/* صورة بديلة مضمّنة (SVG بلا أي طلب شبكة) تُعرض عند فشل الصورة نهائياً */
window.IMG_PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' +
  '<rect width="600" height="600" fill="#f3f4f6"/>' +
  '<g fill="none" stroke="#b9bec9" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M300 190 390 240V345L300 395 210 345V240Z"/><path d="M210 240 300 290 390 240M300 290V395"/></g></svg>'
);

// ====== ImageKit: تحسين وضغط الصور بمقاسات موحدة ======
/* رابط ImageKit ← رابط ImgBB الأصلي (نفس المسار). يرجع "" إن لم يكن رابط ImageKit.
   مثال: ik.imagekit.io/ID/tr:w-900,q-85,f-webp/AbCd/p.jpg  ←  i.ibb.co/AbCd/p.jpg */
window.ikToOrigin = function(url) {
  if (!url || typeof url !== 'string') return "";
  var m = url.match(/^https?:\/\/ik\.imagekit\.io\/[^\/]+\/(?:tr:[^\/]+\/)?([^?#]+)/);
  return m && m[1] ? "https://i.ibb.co/" + m[1] : "";
};

/* قاطع الدائرة: إذا فشلت 3 صور من ImageKit ولم تنجح أي صورة منه في هذه الصفحة
   (باقة منتهية أو عطل) تُحمَّل كل الصور من ImgBB مباشرة لمدة 30 دقيقة، دون انتظار فشل كل صورة. */
var IK_DOWN_KEY = "ws_ik_down";
var IK_DOWN_MS = 30 * 60 * 1000;
function isIkDown() {
  try {
    var t = parseInt(sessionStorage.getItem(IK_DOWN_KEY) || "0", 10);
    return t > 0 && (Date.now() - t) < IK_DOWN_MS;
  } catch (e) { return false; }
}
var ikFailCount = 0;
var ikAnyLoaded = false;

window.getIkUrl = function(url, width, quality) {
  if (!url || typeof url !== 'string' || !url.includes("ik.imagekit.io")) return url;
  if (isIkDown()) return window.ikToOrigin(url) || url;
  quality = quality || 75;
  const trString = "tr:w-" + width + ",q-" + quality + ",f-webp";
  if (url.match(/\/tr:[^\/]+\//)) {
    return url.replace(/\/tr:[^\/]+\//, "/" + trString + "/");
  } else {
    return url.replace(/(ik\.imagekit\.io\/[^\/]+\/)/, "$1" + trString + "/");
  }
};

/* احتياطي تلقائي لكل <img> في الموقع: عند فشل صورة ImageKit تُجرَّب نسختها من ImgBB مرة واحدة.
   يعمل في مرحلة الالتقاط فيسبق معالجات onerror الموجودة (التي تعرض الصورة البديلة فقط إن فشل ImgBB أيضاً). */
document.addEventListener("load", function(e) {
  var t = e.target;
  if (t && t.tagName === "IMG" && typeof t.src === "string" && t.src.indexOf("ik.imagekit.io") !== -1) ikAnyLoaded = true;
}, true);

document.addEventListener("error", function(e) {
  var t = e.target;
  if (!t || t.tagName !== "IMG" || t.dataset.ikFallback) return;
  var origin = window.ikToOrigin(t.currentSrc || t.src);
  if (!origin) return;
  t.dataset.ikFallback = "1";
  ikFailCount++;
  if (ikFailCount >= 3 && !ikAnyLoaded) {
    try { sessionStorage.setItem(IK_DOWN_KEY, String(Date.now())); } catch (err) {}
  }
  e.stopImmediatePropagation();
  t.src = origin;
}, true);

// تم استبدال الـ Blur بلون خلفية خفيف في CSS لمنع ازدواجية اتصالات الصور
window.initProgressiveImages = function(scope) {
  const container = scope || document;
  const lazyImgs = container.querySelectorAll("img.progressive-img:not(.loaded)");
  lazyImgs.forEach(function(img) {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add("loaded");
    } else {
      img.addEventListener("load", function() {
        img.classList.add("loaded");
      }, { once: true });
    }
  });
};
// ===========================================================================

const NAV_LINKS = [
  { href: "index.html", label: "الرئيسية", key: "home", icon: "home" },
  { href: "products.html", label: "المنتجات", key: "products", icon: "box" },
  { href: "categories.html", label: "الأقسام", key: "categories", icon: "layers" }, 
  { href: "about.html", label: "من نحن", key: "about", icon: "info" },
  { href: "contact.html", label: "تواصل معنا", key: "contact", icon: "phone" }
];

function initSidebarDOM() {
  if (!document.getElementById("mainSidebarOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "mainSidebarOverlay";
      overlay.className = "sidebar-overlay";
      overlay.onclick = toggleSidebar;
      document.body.appendChild(overlay);
  }
  if (!document.getElementById("sidebarNav")) {
      const sidebar = document.createElement("nav");
      sidebar.id = "sidebarNav";
      sidebar.className = "sidebar-nav";
      sidebar.setAttribute("aria-label", "قائمة الأقسام");
      sidebar.addEventListener("click", function (e) {
        const a = e.target.closest ? e.target.closest("a[data-cat]") : null;
        if (!a) return;
        if (document.getElementById("shopGrid") && typeof window.updateCategory === "function") {
          e.preventDefault();
          window.updateCategory(a.dataset.cat);
        }
        toggleSidebar();
      });
      document.body.appendChild(sidebar);
  }
}

function storeLogoSrc() {
  var c = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG) || {};
  return (c.logo || "assets/logo/logo.png") + (c.assetVersion ? "?v=" + encodeURIComponent(c.assetVersion) : "");
}

function renderHeader() {
  const mount = document.getElementById("site-header");
  if (!mount || mount.dataset.ready === "1") return;
  mount.dataset.ready = "1";
  const active = mount.dataset.active || "";
  const rawSettings = Store.getSettings() || {};
  const settings = {
    storeName: rawSettings.storeName || "متجرك الإلكتروني",
    storeTagline: rawSettings.storeTagline || "تسوّق بسهولة وثقة"
  };

  const safeName = escapeHtml(settings.storeName);
  const safeTagline = escapeHtml(settings.storeTagline);

  const navHtml = NAV_LINKS.map(function (link) {
    const isActive = link.key === active ? " active" : "";
    return '<a href="' + link.href + '" class="' + isActive.trim() + '">' + link.label + '</a>';
  }).join("");

  mount.innerHTML =
    '<header class="site-header">' +
      '<div class="container header-inner">' +
        '<a href="index.html" class="brand" aria-label="' + safeName + '">' +
          '<img src="' + storeLogoSrc() + '" alt="' + safeName + '" width="44" height="44" decoding="async">' +
          '<span class="brand-name">' + safeName + '<span>' + safeTagline + '</span></span>' +
        '</a>' +
        '<nav class="main-nav" id="mainNav" aria-label="التنقل الرئيسي">' + navHtml + '</nav>' +
        '<div class="header-actions">' +
          '<button type="button" class="btn-icon" id="openGlobalSearch" aria-label="بحث" title="بحث">' + iconSvg("search") + '</button>' +
          '<a href="cart.html" class="btn-icon cart-link" id="headerCartBtn" aria-label="السلة" title="السلة">' + 
            iconSvg("cart") + 
            '<span class="cart-count" id="cartCount" style="display:none;"></span>' +
          '</a>' +
          '<button class="btn-icon nav-toggle" id="navToggle" aria-label="القائمة" aria-controls="sidebarNav">' + iconSvg("menu") + '</button>' +
        '</div>' +
      '</div>' +
    '</header>' +
    '<div class="global-search-overlay" id="globalSearchOverlay">' +
      '<div class="global-search-container">' +
        '<div class="global-search-header">' +
          '<div class="search-box" style="flex:1;margin:0;">' +
            '<input type="text" id="globalSearchInput" placeholder="ابحث عن منتج أو باركود (3 أحرف على الأقل)..." autocomplete="off">' +
            '<span id="submitGlobalSearch" style="cursor:pointer;">' + iconSvg("search") + '</span>' +
          '</div>' +
          '<button type="button" class="btn-icon" id="closeGlobalSearch" aria-label="إغلاق">' + iconSvg("close") + '</button>' +
        '</div>' +
        '<div class="global-search-results" id="globalSearchResults"></div>' +
      '</div>' +
    '</div>';

  initSidebarDOM();
  renderSidebarNav(active);
  initMobileNav();
  initGlobalSearch();
  updateCartBadge();
}

function renderSidebarNav(activeKey) {
  const sidebar = document.getElementById("sidebarNav");
  if (!sidebar) return;

  let html = '<div class="sidebar-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--line); padding-bottom:15px;">';
  html += '<h3 style="margin:0; font-size:1.1rem; color:var(--olive-800);">القائمة</h3>';
  html += '<button class="btn-icon btn-sm" onclick="toggleSidebar()" aria-label="إغلاق" style="background:var(--olive-50); border:none;">' + iconSvg("close") + '</button>';
  html += '</div>';

  html += '<ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;">';
  NAV_LINKS.forEach(link => {
      const isActive = link.key === activeKey ? "color:var(--olive-700); font-weight:bold; background:var(--olive-50);" : "color:var(--ink-700);";
      html += '<li><a href="' + link.href + '" style="display:flex; align-items:center; gap:10px; padding:12px; border-radius:10px; text-decoration:none; transition:0.2s; ' + isActive + '">' + iconSvg(link.icon || "box") + link.label + '</a></li>';
  });

  const allCategories = Store.getCategories();
  const mainCategories = allCategories.filter(c => !c.parentId);

  const catHref = function (id) { return 'products.html?cat=' + encodeURIComponent(id); };

  if (mainCategories.length > 0) {
      html += '<li style="margin-top:15px; border-top:1px solid var(--line); padding-top:15px;">';
      html += '<div style="font-weight:bold; color:var(--ink-400); font-size:0.85rem; margin-bottom:10px; padding:0 12px;">تصفح الأقسام</div>';
      
      mainCategories.forEach(mainCat => {
          const subCategories = allCategories.filter(c => c.parentId === mainCat.id);
          const hasSub = subCategories.length > 0;
          
          html += '<div style="margin-bottom:5px;">';
          if (hasSub) {
              html += '<button onclick="toggleSubmenu(this)" style="width:100%; display:flex; align-items:center; justify-content:space-between; background:transparent; border:none; padding:12px; color:var(--ink-700); font-weight:600; text-align:right; border-radius:10px; cursor:pointer;">';
              html += '<span style="display:flex; align-items:center; gap:10px;">' + iconSvg(mainCat.icon || "box") + escapeHtml(mainCat.name) + '</span>';
              html += '<span class="arrow" style="transition:0.3s; transform:rotate(90deg); display:inline-block;">&#10095;</span>';
              html += '</button>';
              
              html += '<div class="sidebar-submenu" style="padding-right:35px; margin-top:5px; display:none;">';
              
              html += '<a href="' + catHref(mainCat.id) + '" data-cat="' + escapeHtml(mainCat.id) + '" style="display:block; padding:8px; color:var(--olive-600); text-decoration:none; font-size:0.9rem; margin-bottom:4px;">عرض الكل (' + escapeHtml(mainCat.name) + ')</a>';
              
              subCategories.forEach(subCat => {
                  html += '<a href="' + catHref(subCat.id) + '" data-cat="' + escapeHtml(subCat.id) + '" style="display:block; padding:8px; color:var(--ink-600); text-decoration:none; font-size:0.9rem; margin-bottom:4px;">- ' + escapeHtml(subCat.name) + '</a>';
              });
              html += '</div>';
          } else {
              html += '<a href="' + catHref(mainCat.id) + '" data-cat="' + escapeHtml(mainCat.id) + '" style="display:flex; align-items:center; gap:10px; padding:12px; border-radius:10px; color:var(--ink-700); font-weight:600; text-decoration:none;">' + iconSvg(mainCat.icon || "box") + escapeHtml(mainCat.name) + '</a>';
          }
          html += '</div>';
      });
      html += '</li>';
  }
  
  html += '</ul>';
  sidebar.innerHTML = html;
}

window.toggleSidebar = function() {
  const sidebar = document.getElementById("sidebarNav");
  const overlay = document.getElementById("mainSidebarOverlay");
  
  if (sidebar) sidebar.classList.toggle("active");
  if (overlay) overlay.classList.toggle("active");
};

window.toggleSubmenu = function(btnElement) {
  const submenu = btnElement.nextElementSibling;
  const arrow = btnElement.querySelector('.arrow');
  
  if (submenu) {
      if (submenu.style.display === "none") {
          submenu.style.display = "block";
          if(arrow) arrow.style.transform = "rotate(-90deg)"; 
      } else {
          submenu.style.display = "none";
          if(arrow) arrow.style.transform = "rotate(90deg)"; 
      }
  }
};

const GLOBAL_SEARCH_LIMIT = 8;

function initGlobalSearch() {
  const openBtn = document.getElementById("openGlobalSearch");
  const closeBtn = document.getElementById("closeGlobalSearch");
  const overlay = document.getElementById("globalSearchOverlay");
  const input = document.getElementById("globalSearchInput");
  const resultsBox = document.getElementById("globalSearchResults");
  const submitIcon = document.getElementById("submitGlobalSearch");

  if(!openBtn || !overlay) return;

  openBtn.addEventListener("click", function() {
      overlay.classList.add("open");
      input.value = "";
      resultsBox.innerHTML = '<div class="empty-search">اكتب 3 أحرف على الأقل للبحث...</div>';
      setTimeout(() => input.focus(), 100); 
  });

  closeBtn.addEventListener("click", function() {
      overlay.classList.remove("open");
  });

  overlay.addEventListener("click", function(e) {
      if(e.target === overlay) overlay.classList.remove("open");
  });

  async function executeSearch() {
    const query = input.value.trim().toLowerCase();
    if(query.length < 3) {
        resultsBox.innerHTML = '<div class="empty-search">يرجى كتابة 3 أحرف على الأقل للبحث...</div>';
        return;
    }

    resultsBox.innerHTML = '<div class="empty-search">جاري البحث...</div>';

    try { await Store.ensureIndexFresh(); } catch (err) { console.error("Search index error:", err); }
    const pool = Store.getIndexItems() || [];
    const tokens = normalizeSearch(query).split(" ");
    // خروج مبكر: نتوقف عند أول 8 نتائج بدل تصفية كل الفهرس (مهم مع آلاف المنتجات وكل ضغطة مفتاح)
    const matched = [];
    for (let n = 0; n < pool.length && matched.length < GLOBAL_SEARCH_LIMIT; n++) {
        const p = pool[n];
        if (!p || p.available === false) continue;
        let ok = true;
        for (let i = 0; i < tokens.length; i++) { if (p._k.indexOf(tokens[i]) === -1) { ok = false; break; } }
        if (ok) matched.push(p);
    }

    if(matched.length === 0) {
        resultsBox.innerHTML = '<div class="empty-search">لا توجد منتجات مطابقة لـ "' + escapeHtml(query) + '"</div>';
        return;
    }

    resultsBox.innerHTML = matched.map(p => {
        const thumbImg = p.image ? window.getIkUrl(p.image, 160, 70) : "";
        const img = p.image ? `<img src="${escapeHtml(thumbImg)}" alt="${escapeHtml(p.name)}" class="progressive-img" width="62" height="62" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:8px;background:var(--surface-2);">` : `<div class="search-img-placeholder">${iconSvg("box")}</div>`;
        return `
            <a href="product.html?id=${encodeURIComponent(p.id)}" class="search-result-item">
                <div class="search-item-img">${img}</div>
                <div class="search-item-info">
                    <h4>${escapeHtml(p.name)}</h4>
                    <span>${priceHtml(p)}</span>
                </div>
            </a>
        `;
    }).join("");

    window.initProgressiveImages(resultsBox);
  }

  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch();
    }
  });

  if (submitIcon) {
    submitIcon.addEventListener("click", executeSearch);
  }
}

/* سطر حقوق المطوّر في الفوتر — يُدار بالكامل من STORE_CONFIG.credit */
function buildCreditHtml() {
  var c = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG && STORE_CONFIG.credit) || null;
  if (!c || c.show === false) return "";
  var linkStyle = 'style="color: var(--on-primary-soft); text-decoration: underline;"';
  var dot = '<span style="opacity: 0.35;">•</span>';
  var parts = [];
  if (c.name) parts.push('<span>برمجة وتصميم: <strong style="color: var(--on-primary);">' + escapeHtml(c.name) + '</strong></span>');
  if (c.instagram) parts.push('<a href="' + escapeHtml(safeUrl(c.instagram)) + '" target="_blank" rel="noopener" ' + linkStyle + '>انستغرام: ' + escapeHtml(c.instagramLabel || "") + '</a>');
  if (c.phone) parts.push('<a href="tel:' + escapeHtml(String(c.phone).replace(/[^0-9+]/g, "")) + '" dir="ltr" ' + linkStyle + '>' + escapeHtml(c.phone) + '</a>');
  if (!parts.length) return "";
  return '<div style="display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap;">' + parts.join(dot) + '</div>';
}

function renderFooter() {
  const footerMount = document.getElementById("site-footer");
  if (!footerMount) return;
  const rawSettings = Store.getSettings() || {};
  const settings = {
    storeName: escapeHtml(rawSettings.storeName || "متجرك الإلكتروني"),
    storeDescription: escapeHtml(rawSettings.storeDescription || "تجربة تسوق بسيطة، واضحة ومباشرة."),
    phone: escapeHtml(rawSettings.phone || ""),
    phone2: escapeHtml(rawSettings.phone2 || ""),
    mapUrl: escapeHtml(safeMapUrl(rawSettings.mapUrl)),
    whatsapp: rawSettings.whatsapp || "",
    instagram: escapeHtml(rawSettings.instagram ? safeUrl(rawSettings.instagram) : ""),
    tiktok: escapeHtml(rawSettings.tiktok ? safeUrl(rawSettings.tiktok) : ""),
    address: escapeHtml(rawSettings.address || "")
  };
  const categories = (Store.getCategories() || []).slice(0, 5);
  const catLinks = categories.map(function(c){ return '<li><a href="products.html?cat=' + encodeURIComponent(c.id) + '">' + escapeHtml(c.name) + '</a></li>'; }).join("");
  footerMount.innerHTML =
    '<footer class="site-footer">' +
      '<div class="container">' +
        '<div class="footer-grid">' +
          '<div>' +
            '<div class="footer-brand"><img src="' + storeLogoSrc() + '" alt="' + settings.storeName + '" width="44" height="44" loading="lazy" decoding="async"><strong>' + settings.storeName + '</strong></div>' +
            '<p>' + settings.storeDescription + '</p>' +
          '</div>' +
          '<div><h4>روابط سريعة</h4><ul>' +
            '<li><a href="index.html">الرئيسية</a></li><li><a href="products.html">المنتجات</a></li><li><a href="categories.html">الأقسام</a></li><li><a href="about.html">من نحن</a></li><li><a href="contact.html">تواصل معنا</a></li>' +
          '</ul></div>' +
          '<div><h4>الأقسام</h4><ul>' + (catLinks || '<li>لا توجد أقسام بعد</li>') + '</ul></div>' +
          '<div><h4>تواصل معنا</h4><ul>' +
            (settings.phone ? '<li><a href="tel:' + settings.phone + '">' + settings.phone + '</a></li>' : '') +
            (settings.phone2 ? '<li><a href="tel:' + settings.phone2 + '">' + settings.phone2 + '</a></li>' : '') +
            (settings.whatsapp ? '<li><a href="https://wa.me/' + whatsappDigitsOnly(settings.whatsapp) + '" target="_blank" rel="noopener">واتساب</a></li>' : '') +
            (settings.instagram ? '<li><a href="' + settings.instagram + '" target="_blank" rel="noopener">انستغرام</a></li>' : '') +
            (settings.tiktok ? '<li><a href="' + settings.tiktok + '" target="_blank" rel="noopener">تيك توك</a></li>' : '') +
            (settings.address ? '<li>' + (settings.mapUrl ? '<a href="' + settings.mapUrl + '" target="_blank" rel="noopener">' + settings.address + '</a>' : settings.address) + '</li>' : '') +
          '</ul></div>' +
        '</div>' +
        '<div class="footer-bottom" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(var(--on-primary-rgb),0.08); text-align: center; font-size: 0.82rem; color: var(--on-primary-dim); display: flex; flex-direction: column; gap: 6px; align-items: center;">' +
          '<div>© ' + new Date().getFullYear() + ' ' + settings.storeName + ' — جميع الحقوق محفوظة.</div>' +
          buildCreditHtml() +
        '</div>' +
      '</div>' +
    '</footer>';
}

function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  if (!toggle) return;
  toggle.addEventListener("click", function () {
    toggleSidebar();
  });
}

window.updateCartBadge = function() {
  const el = document.getElementById("cartCount");
  if (!el) return;
  
  let count = 0;
  if (typeof Store !== "undefined" && typeof Store.getCart === "function") {
    const cart = Store.getCart() || [];
    count = cart.reduce(function(sum, item) {
      const q = Number(item && item.qty);
      return sum + (q > 0 ? q : 0);
    }, 0);
  }

  if (count > 0) {
    el.textContent = count;
    el.style.display = "inline-flex";
    el.classList.add("has-items");
  } else {
    el.textContent = "";
    el.style.display = "none";
    el.classList.remove("has-items");
  }
};

function showToast(message, type = 'success') {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = "toast show";
  
  if (type === 'success') {
      toast.classList.add("toast-success");
  } else if (type === 'error') {
      toast.classList.add("toast-error");
  }

  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.classList.remove("show"); }, 2400);
}

function initBackToTop() {
  let btn = document.getElementById("backToTopBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "backToTopBtn";
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block;margin:auto;"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    btn.setAttribute("aria-label", "العودة للأعلى");
    btn.title = "العودة للأعلى";
    document.body.appendChild(btn);
  }
  
  let ticking = false;
  window.addEventListener("scroll", function() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      btn.style.display = window.scrollY > 400 ? "block" : "none";
      ticking = false;
    });
  }, { passive: true });

  btn.addEventListener("click", function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function refreshChrome() {
  const mount = document.getElementById("site-header");
  if (mount && mount.dataset.ready === "1") {
    const raw = Store.getSettings() || {};
    const name = raw.storeName || "متجرك الإلكتروني";
    const tagline = raw.storeTagline || "تسوّق بسهولة وثقة";
    const brandName = mount.querySelector(".brand-name");
    if (brandName && brandName.firstChild) {
      brandName.firstChild.nodeValue = name;
      const tag = brandName.querySelector("span");
      if (tag) tag.textContent = tagline;
    }
    const brand = mount.querySelector(".brand");
    if (brand) brand.setAttribute("aria-label", name);
    const logo = mount.querySelector(".brand img");
    if (logo) logo.alt = name;
    renderSidebarNav(mount.dataset.active || "");
  }
  renderFooter();
  window.updateCartBadge();
}

function bootChrome() {
  renderHeader();
  renderFooter();
  window.updateCartBadge();
  initBackToTop();
  window.initProgressiveImages();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootChrome);
else bootChrome();

window.addEventListener("pageshow", function() {
  window.updateCartBadge();
});

document.addEventListener("cart:updated", function() {
  window.updateCartBadge();
});

window.addEventListener("storage", function (e) {
  if (e.key === "ws_cart") window.updateCartBadge();
});

document.addEventListener("store:synced", refreshChrome);
