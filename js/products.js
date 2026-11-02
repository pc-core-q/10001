/* ==========================================================================
   products.js (معمارية هجينة معتمدة على الفهرس المصغر حتى 2000 منتج)
   + فرز وترتيب لحظي في ذاكرة الهاتف + بحث سريع يدعم كيبورد الموبايل
   ========================================================================== */

function productMediaHtml(product) {
  if (product.image) {
    const fullImg = window.getIkUrl(product.image, 700, 85);
    return '<img src="' + escapeHtml(fullImg) + '" ' +
           'alt="' + escapeHtml(product.name || "") + '" ' +
           'class="product-media-img progressive-img" loading="lazy" decoding="async" ' +
           'onerror="this.onerror=null; this.src=window.IMG_PLACEHOLDER;">';
  }
  const cat = Store.getCategories().find(function (c) { return c.id === product.categoryId; });
  const key = cat ? cat.icon : "box";
  return '<div class="placeholder-icon">' + iconSvg(key) + "</div>";
}

function renderSkeletonCards(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += '<article class="product-card skeleton-card"></article>';
  }
  return html;
}

function productHasOptions(product) {
  if (!product) return false;
  const hasColors = Array.isArray(product.colors) && product.colors.length > 0;
  const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const hasMatrix = typeof Store !== "undefined" && typeof Store.hasVariantMatrix === "function" && Store.hasVariantMatrix(product);
  return hasColors || hasSizes || hasVariants || hasMatrix;
}

function renderProductCard(product) {
  const outOfStock = !Store.isProductAvailable(product);
  const badges = [];
  
  if (product.isOffer) badges.push('<span class="badge badge-offer">عرض🔥</span>');
  else if (product.isNew) badges.push('<span class="badge badge-new">جديد</span>');
  else if (product.featured) badges.push('<span class="badge badge-featured">مميز</span>');
  if (outOfStock) badges.push('<span class="badge badge-out-abs">غير متوفر</span>');

  let colorsHtml = "";
  if (product.colors && product.colors.length > 0) {
    const maxShow = 4;
    const slice = product.colors.slice(0, maxShow);
    const remaining = product.colors.length - maxShow;
    
    let dots = slice.map(function(c) {
      const bg = c.hex || "#ccc";
      return '<span class="card-color-dot" style="background:' + escapeHtml(bg) + ';" title="' + escapeHtml(c.name || "") + '"></span>';
    }).join("");

    if (remaining > 0) {
      dots += '<span class="card-color-more">+' + remaining + '</span>';
    }

    colorsHtml = '<div class="product-body-colors">' + dots + '</div>';
  } else {
    const optionsCount = (product.variants && product.variants.length) || 0;
    if (optionsCount > 1) {
      badges.push('<span class="badge badge-variants">' + iconSvg("layers") + optionsCount + ' خيارات</span>');
    }
  }

  const hasOptions = productHasOptions(product);

  const actionIcon = hasOptions
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:block;margin:auto;"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>'
    : iconSvg("cart");

  const actionTitle = outOfStock ? "غير متوفر" : (hasOptions ? "اختر الخيارات والمواصفات" : "أضف للسلة");
  const actionLabel = outOfStock ? "غير متوفر" : (hasOptions ? "اختر الخيارات" : "أضف للسلة");

  const productId = product.id || product.objectID;

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + encodeURIComponent(productId) + '" class="product-media" data-product-link="1">' +
        productMediaHtml(product) +
        badges.join("") +
      "</a>" +
      '<div class="product-body">' +
        '<span class="product-cat">' + escapeHtml(Store.getCategoryName(product.categoryId)) + "</span>" +
        '<h3 class="product-name"><a href="product.html?id=' + encodeURIComponent(productId) + '" data-product-link="1">' + escapeHtml(product.name) + "</a></h3>" +
        colorsHtml +
        '<div class="product-foot">' +
          '<span class="price">' + priceHtml(product) + "</span>" +
          '<div class="product-actions">' +
            '<button class="btn btn-primary" ' + (outOfStock ? "disabled" : "") +
              ' title="' + actionTitle + '"' +
              ' onclick="quickAddToCart(' + jsStr(productId) + ')">' +
              actionIcon +
            '<span class="btn-label">' + actionLabel + "</span>" +
            "</button>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</article>"
  );
}

async function quickAddToCart(productId) {
  let product = Store.getProduct(productId);
  if (!product) {
    product = await Store.loadProductById(productId);
  }

  if (!product || !Store.isProductAvailable(product)) return;

  if (productHasOptions(product)) {
      window.location.href = 'product.html?id=' + encodeURIComponent(productId);
      return;
  }
  const res = Store.addToCart(productId, 1);
  if (res && res.blocked) showToast("هذا المنتج غير متوفر حاليًا", "error");
  else if (res && res.capped) showToast("وصلت للحد الأقصى المتوفر من هذا المنتج", "error");
  else showToast(product.name + " أُضيف إلى السلة", "success");
  if (typeof window.updateCartBadge === "function") {
    window.updateCartBadge();
  }
}

function renderGridInto(containerId, products, emptyMessage) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!products || !products.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">' + iconSvg("box") + "<p>" + (emptyMessage || "لا توجد منتجات لعرضها حاليًا.") + "</p></div>";
    return;
  }
  el.innerHTML = products.map(renderProductCard).join("");
  if (typeof window.initProgressiveImages === "function") {
    window.initProgressiveImages(el);
  }
}

const SHOP_PAGE_SIZE = 24;
const shopState = {
  search: "", categoryId: "all", sort: "default", filterMode: "",
  pagination: { page: 0, nbPages: 1, loading: false, done: false, products: [] }
};

function setupScrollPreservation() {
  document.addEventListener("click", function(e) {
    const link = e.target.closest("a[data-product-link='1'], a[href*='product.html']");
    if (link) {
      sessionStorage.setItem("shop_scroll_pos", String(window.scrollY));
    }
  });
}

function restoreShopScrollPosition() {
  const savedPos = sessionStorage.getItem("shop_scroll_pos");
  if (savedPos !== null) {
    setTimeout(function() {
      window.scrollTo({
        top: parseInt(savedPos, 10),
        behavior: "instant"
      });
      sessionStorage.removeItem("shop_scroll_pos");
    }, 120);
  }
}

function resetShopPagination() {
  shopState.pagination = {
    page: 0,
    nbPages: 1,
    loading: false,
    done: false,
    products: []
  };
}

function showShopLoading(show) {
  const btn = document.getElementById("shopLoadMoreBtn");
  if (btn) {
    if (show) {
      btn.textContent = "جاري التحميل...";
      btn.disabled = true;
    } else {
      btn.textContent = "تحميل المزيد";
      btn.disabled = false;
    }
  }
}

function ensureShopPaginationUI() {
  const grid = document.getElementById("shopGrid");
  if (!grid || document.getElementById("shopLoadMoreWrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "shopLoadMoreWrap";
  wrap.style.cssText = "grid-column:1/-1;text-align:center;padding:24px 0;";
  
  const btn = document.createElement("button");
  btn.id = "shopLoadMoreBtn";
  btn.className = "btn btn-outline";
  btn.textContent = "تحميل المزيد";
  btn.style.cssText = "min-width: 200px;";
  
  btn.addEventListener("click", function() {
    loadNextShopPage();
  });

  wrap.appendChild(btn);
  grid.parentNode.insertBefore(wrap, grid.nextSibling);
}

async function queryProductsUnified(pageToFetch) {
  const cfg = typeof STORE_CONFIG !== "undefined" ? STORE_CONFIG : {};
  const isAlgoliaReady = cfg.useAlgolia === true && cfg.algoliaAppId && !String(cfg.algoliaAppId).startsWith("YOUR_") && cfg.algoliaSearchKey;
  if (isAlgoliaReady) return queryAlgoliaDirect(pageToFetch, cfg);
  return queryFallbackStore(pageToFetch);
}

async function queryAlgoliaDirect(pageToFetch, cfg) {
  let targetIndex = cfg.algoliaIndexName || "products";
  if (shopState.sort === "price-asc") targetIndex += "_price_asc";
  else if (shopState.sort === "price-desc") targetIndex += "_price_desc";

  const filters = [];
  filters.push("available:true");

  if (shopState.categoryId && shopState.categoryId !== "all") {
    filters.push('categoryId:"' + String(shopState.categoryId).replace(/[\\"]/g, "") + '"');
  }
  if (shopState.filterMode === "featured") filters.push("featured:true");
  else if (shopState.filterMode === "offer") filters.push("isOffer:true");
  else if (shopState.filterMode === "new") filters.push("isNew:true");

  const url = `https://${cfg.algoliaAppId}-dsn.algolia.net/1/indexes/${encodeURIComponent(targetIndex)}/query`;
  const body = {
    query: shopState.search || "",
    filters: filters.join(" AND "),
    hitsPerPage: SHOP_PAGE_SIZE,
    page: pageToFetch
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": cfg.algoliaAppId,
      "X-Algolia-API-Key": cfg.algoliaSearchKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error("فشل طلب البحث من Algolia");
  const data = await response.json();

  return {
    products: (data.hits || []).map(h => ({
      id: h.objectID || h.id,
      objectID: h.objectID || h.id,
      name: h.name,
      price: h.price,
      oldPrice: h.oldPrice || 0,
      categoryId: h.categoryId,
      image: h.image,
      colors: h.colors || [],
      sizes: h.sizes || [],
      variants: h.variants || [],
      featured: !!h.featured,
      isOffer: !!h.isOffer,
      isNew: !!h.isNew,
      available: h.available !== false,
      stock: h.stock || 1
    })),
    nbPages: data.nbPages || 1
  };
}

const _collator = (typeof Intl !== "undefined" && Intl.Collator) ? new Intl.Collator("ar", { numeric: true }) : null;
let _listMemo = null;

function categoryIdsWithChildren(catId) {
  const ids = [catId];
  Store.getCategories().forEach(function (c) { if (c && c.parentId === catId) ids.push(c.id); });
  return ids;
}

/* قائمة المتجر من الفهرس. limit (اختياري) = أقصى عدد نحتاجه للصفحة الحالية:
   عند الفرز الافتراضي (بلا فرز سعر/اسم) نتوقف فور اكتمال الشريحة المطلوبة (+1 لمعرفة وجود المزيد)
   بدل تصفية كل الفهرس. الفرز بالسعر/الاسم يحتاج كل النتائج فيُمسح كاملاً. _listMemo.complete = هل القائمة كاملة. */
function buildShopList(pool, limit) {
  const key = [shopState.categoryId, shopState.filterMode, shopState.search, shopState.sort].join("\u0001");
  if (_listMemo && _listMemo.pool === pool && _listMemo.key === key && (_listMemo.complete || (limit && _listMemo.list.length >= limit))) return _listMemo.list;

  const catIds = (shopState.categoryId && shopState.categoryId !== "all") ? categoryIdsWithChildren(shopState.categoryId) : null;
  const mode = shopState.filterMode;
  const q = normalizeSearch(shopState.search);
  const tokens = q ? q.split(" ") : [];
  const sort = shopState.sort;
  const sorted = sort === "price-asc" || sort === "price-desc" || sort === "name";

  function pass(p) {
    if (!p || !Store.isProductAvailable(p)) return false;
    if (catIds && catIds.indexOf(p.categoryId) === -1) return false;
    if (mode === "featured" && !p.featured) return false;
    if (mode === "offer" && !p.isOffer) return false;
    if (mode === "new" && !p.isNew) return false;
    for (let i = 0; i < tokens.length; i++) if (p._k.indexOf(tokens[i]) === -1) return false;
    return true;
  }

  let list, complete = true;
  if (sorted || !limit) {
    list = pool.filter(pass);
    if (sort === "price-asc") list.sort(function (a, b) { return (Number(a.price) || 0) - (Number(b.price) || 0); });
    else if (sort === "price-desc") list.sort(function (a, b) { return (Number(b.price) || 0) - (Number(a.price) || 0); });
    else if (sort === "name") list.sort(function (a, b) { return _collator ? _collator.compare(a._n, b._n) : (a._n < b._n ? -1 : (a._n > b._n ? 1 : 0)); });
    else if (tokens.length) {
      const rank = function (p) { return p._n.indexOf(q) === 0 ? 0 : (p._n.indexOf(q) !== -1 ? 1 : 2); };
      list.sort(function (a, b) { return rank(a) - rank(b); });
    }
  } else {
    // ترتيب الصلة (يبدأ بالكلمة ثم يحويها ثم الباقي) بدفعات: نتوقف حين تمتلئ الدفعة الأولى بالكامل
    const b0 = [], b1 = [], b2 = [];
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!pass(p)) continue;
      const r = tokens.length ? (p._n.indexOf(q) === 0 ? 0 : (p._n.indexOf(q) !== -1 ? 1 : 2)) : 0;
      (r === 0 ? b0 : (r === 1 ? b1 : b2)).push(p);
      if (b0.length >= limit) { complete = (i === pool.length - 1); break; }
    }
    list = b0.concat(b1, b2);
  }

  _listMemo = { pool: pool, key: key, list: list, complete: complete };
  return list;
}

async function queryFallbackStore(pageToFetch) {
  try { await Store.ensureIndexFresh(); } catch (e) { console.error("Index refresh error:", e); }
  const need = (pageToFetch + 1) * SHOP_PAGE_SIZE + 1;
  const list = buildShopList(Store.getIndexItems() || [], need);
  const complete = !_listMemo || _listMemo.complete;

  const start = pageToFetch * SHOP_PAGE_SIZE;
  return {
    products: list.slice(start, start + SHOP_PAGE_SIZE),
    // قائمة مقطوعة مبكراً = يوجد المزيد حتماً (حصلنا على أكثر من الشريحة المطلوبة)
    nbPages: complete ? (Math.ceil(list.length / SHOP_PAGE_SIZE) || 1) : pageToFetch + 2
  };
}

async function fetchNextShopBatch() {
  const page = shopState.pagination;
  if (page.loading || page.done) return;
  page.loading = true;
  showShopLoading(true);

  try {
    const result = await queryProductsUnified(page.page);
    const added = result.products || [];

    const seen = new Set(page.products.map(p => String(p.id || p.objectID)));
    added.forEach(p => {
      const pKey = String(p.id || p.objectID);
      if (p && !seen.has(pKey)) {
        seen.add(pKey);
        page.products.push(p);
      }
    });

    page.page += 1;
    page.nbPages = result.nbPages;
    if (page.page >= page.nbPages || added.length === 0) {
      page.done = true;
    }
  } catch (err) {
    console.error("فشل جلب المنتجات:", err);
    page.done = true;
  } finally {
    page.loading = false;
    showShopLoading(false);
  }
}

async function renderShopResults(options) {
  options = options || {};
  ensureShopPaginationUI();

  if (options.reset) {
    resetShopPagination();
  }

  await fetchNextShopBatch();

  const list = shopState.pagination.products;

  const subCatContainerId = "subCategoryScroller";
  let subCatContainer = document.getElementById(subCatContainerId);
  if (shopState.categoryId !== "all" && !shopState.filterMode) {
    const currentCat = Store.getCategories().find(function(c) { return c.id === shopState.categoryId; });
    const parentId = currentCat ? (currentCat.parentId || currentCat.id) : null;
    if (parentId) {
      const subCats = Store.getCategories().filter(function(c) { return c.parentId === parentId; });
      if (subCats.length > 0) {
        if (!subCatContainer) {
          subCatContainer = document.createElement("div");
          subCatContainer.id = subCatContainerId;
          subCatContainer.style.cssText = "display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:15px;scrollbar-width:none;";
          const grid = document.getElementById("shopGrid");
          if (grid && grid.parentNode) grid.parentNode.insertBefore(subCatContainer, grid);
        }
        let subHtml = '<button class="cat-sub-chip ' + (shopState.categoryId === parentId ? 'active' : '') + '" style="' + (shopState.categoryId === parentId ? 'background:var(--primary);color:var(--on-primary);' : '') + '" onclick="updateCategory(' + jsStr(parentId) + ')">كل التفرعات</button>';
        subHtml += subCats.map(function(sub) { 
          const isAct = shopState.categoryId === sub.id;
          return '<button class="cat-sub-chip ' + (isAct ? 'active' : '') + '" style="' + (isAct ? 'background:var(--primary);color:var(--on-primary);' : '') + '" onclick="updateCategory(' + jsStr(sub.id) + ')">' + escapeHtml(sub.name) + '</button>'; 
        }).join('');
        subCatContainer.innerHTML = subHtml;
        subCatContainer.style.display = "flex";
      } else if (subCatContainer) subCatContainer.style.display = "none";
    }
  } else if (subCatContainer) subCatContainer.style.display = "none";

  let emptyMsg = "لا توجد منتجات مطابقة لهذا القسم حاليًا.";
  if (shopState.filterMode === "featured") emptyMsg = "عذراً، لا توجد منتجات مميزة في المتجر حالياً.";
  else if (shopState.filterMode === "offer") emptyMsg = "عذراً، لا توجد عروض وتخفيضات حالياً.";
  else if (shopState.filterMode === "new") emptyMsg = "عذراً، لا توجد منتجات جديدة في المتجر حالياً.";

  renderGridInto("shopGrid", list, emptyMsg);
  
  const countEl = document.getElementById("resultCount");
  if (countEl) countEl.style.display = "none";

  const wrap = document.getElementById("shopLoadMoreWrap");
  if (wrap) wrap.style.display = (shopState.pagination.done || list.length === 0) ? "none" : "block";

  restoreShopScrollPosition();
}

async function loadNextShopPage() {
  if (shopState.pagination.loading || shopState.pagination.done) return;
  await renderShopResults();
}

async function initShopPage() {
  const grid = document.getElementById("shopGrid");
  if (!grid) return;

  setupScrollPreservation();
  grid.innerHTML = renderSkeletonCards(8);

  if (typeof Store !== "undefined" && typeof Store.loadCategories === "function") {
    if (!Store.getCategories() || Store.getCategories().length === 0) {
      try { await Store.loadCategories(); } catch (e) {}
    }
  }

  const params = new URLSearchParams(location.search);
  if (params.get("cat")) shopState.categoryId = params.get("cat");
  if (params.get("q")) shopState.search = params.get("q");
  if (params.get("filter")) shopState.filterMode = params.get("filter");

  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");

  if (searchInput) {
    searchInput.value = shopState.search;
    searchInput.placeholder = "ابحث عن أي منتج...";

    let searchTimer = null;
    const executeSearch = (val) => {
      val = (val || "").trim();
      if (val === shopState.search) return;
      if (val.length > 0 && val.length < 3) return;
      shopState.search = val;
      renderShopResults({ reset: true });
    };

    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      const val = searchInput.value.trim();

      if (val === "") {
        executeSearch("");
        return;
      }

      if (val.length >= 3) {
        searchTimer = setTimeout(() => {
          executeSearch(val);
        }, 400);
      }
    });

    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13 || e.which === 13) {
        e.preventDefault();
        clearTimeout(searchTimer);
        searchInput.blur();
        executeSearch(searchInput.value);
      }
    });

    searchInput.addEventListener("search", function () {
      clearTimeout(searchTimer);
      searchInput.blur();
      executeSearch(searchInput.value);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      shopState.sort = sortSelect.value;
      renderShopResults({ reset: true });
    });
  }

  renderCategoryFilterPanel();
  await renderShopResults({ reset: true });
}

window.updateCategory = function(catId) {
    const grid = document.getElementById("shopGrid");
    if (grid) {
        grid.classList.add("is-updating");
        grid.innerHTML = renderSkeletonCards(4);
    }

    shopState.categoryId = catId;
    shopState.filterMode = "";
    
    const url = new URL(window.location);
    if (catId && catId !== "all") {
      url.searchParams.set("cat", catId);
      url.searchParams.delete("filter");
    } else {
      url.searchParams.delete("cat");
      url.searchParams.delete("filter");
    }
    window.history.pushState({}, '', url);

    renderCategoryFilterPanel();
    renderShopResults({ reset: true });

    setTimeout(() => {
        if (grid) grid.classList.remove("is-updating");
    }, 300);
};

function renderCategoryFilterPanel() {
  const panel = document.getElementById("filterCategories");
  if (!panel) return;
  const categories = Store.getCategories();
  const mainCats = categories.filter(function(c) { return !c.parentId; });

  let html = '';
  html += '<button data-cat="all" class="shop-tab-btn ' + (shopState.categoryId === "all" && !shopState.filterMode ? "active" : "") + '">الكل</button>';
  html += '<button data-filter="featured" class="shop-tab-btn ' + (shopState.filterMode === "featured" ? "active" : "") + '">⭐ المميزة</button>';
  html += '<button data-filter="offer" class="shop-tab-btn ' + (shopState.filterMode === "offer" ? "active" : "") + '">🔥 العروض</button>';
  html += '<button data-filter="new" class="shop-tab-btn ' + (shopState.filterMode === "new" ? "active" : "") + '">✨ وصل حديثاً</button>';
  
  mainCats.forEach(function(main) {
    const isMainActive = shopState.categoryId === main.id && !shopState.filterMode;
    const isChildActive = categories.some(c => c.parentId === main.id && c.id === shopState.categoryId);
    const isActive = isMainActive || (isChildActive && !shopState.filterMode);

    html += '<button data-cat="' + escapeHtml(main.id) + '" class="shop-tab-btn ' + (isActive ? "active" : "") + '">' + escapeHtml(main.name) + '</button>';
  });
  
  panel.innerHTML = html;

  panel.querySelectorAll("button[data-cat], button[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const grid = document.getElementById("shopGrid");
      if (grid) {
          grid.classList.add("is-updating");
          grid.innerHTML = renderSkeletonCards(4);
      }

      if (btn.dataset.filter) { 
        shopState.filterMode = btn.dataset.filter; 
        shopState.categoryId = "all"; 
        const url = new URL(window.location);
        url.searchParams.set("filter", btn.dataset.filter);
        url.searchParams.delete("cat");
        window.history.pushState({}, '', url);
      } else { 
        shopState.filterMode = ""; 
        shopState.categoryId = btn.dataset.cat; 
        const url = new URL(window.location);
        if (btn.dataset.cat !== "all") url.searchParams.set("cat", btn.dataset.cat);
        else url.searchParams.delete("cat");
        url.searchParams.delete("filter");
        window.history.pushState({}, '', url);
      }
      
      renderCategoryFilterPanel();
      renderShopResults({ reset: true });

      setTimeout(() => {
        if (grid) grid.classList.remove("is-updating");
      }, 300);
    });
  });
}

async function initHomeCollections() {
  const featuredEl = document.getElementById("featuredGrid");
  const offerEl = document.getElementById("offerGrid"); 
  const newEl = document.getElementById("newGrid");
  const catEl = document.getElementById("homeCategories");

  if (!featuredEl && !offerEl && !newEl && !catEl) return;

  if (catEl) {
    const categories = Store.getCategories();
    const mainCategories = categories.filter(function(c) { return !c.parentId; });
    catEl.innerHTML = mainCategories.map(function (c) {
      const media = c.image ? '<img src="' + escapeHtml(c.image) + '" alt="' + escapeHtml(c.name) + '" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : iconSvg(c.icon || "box");
      return '<a href="products.html?cat=' + encodeURIComponent(c.id) + '" class="cat-chip"><span class="cat-icon" style="padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + media + '</span><span class="name">' + escapeHtml(c.name) + "</span></a>";
    }).join("");
  }

  if(featuredEl) featuredEl.innerHTML = renderSkeletonCards(4);
  if(offerEl) offerEl.innerHTML = renderSkeletonCards(4);
  if(newEl) newEl.innerHTML = renderSkeletonCards(4);

  try {
    if (featuredEl) {
      const featuredRes = await Store.loadProductsPageByField("featured", true, 4, null);
      renderGridInto("featuredGrid", featuredRes.products, "لا توجد منتجات مميزة حاليًا.");
    }
    if (offerEl) {
      const offerRes = await Store.loadProductsPageByField("isOffer", true, 4, null);
      renderGridInto("offerGrid", offerRes.products, "لا توجد عروض حاليًا.");
    }
    if (newEl) {
      const newRes = await Store.loadProductsPageByField("isNew", true, 4, null);
      renderGridInto("newGrid", newRes.products, "لا توجد منتجات جديدة حاليًا.");
    }
  } catch (err) {
    console.error("Home collections load error:", err);
  }
}

function productNotFoundHtml() {
  return '<div class="empty-state">' + iconSvg("box") + "<p>هذا المنتج غير موجود أو تم حذفه.</p>" + '<a href="products.html" class="btn btn-outline">العودة إلى المتجر</a></div>';
}

function productDetailSignature(p) {
  return JSON.stringify([p.name, p.price, p.oldPrice, p.isOffer, p.available, p.stock, p.inventory, p.image, p.images, p.colors, p.sizes, p.variants, p.description, p.categoryId]);
}

function refreshDetailCategoryLabels() {
  const el = document.getElementById("productDetail");
  if (!el || !el._product) return;
  const name = Store.getCategoryName(el._product.categoryId);
  el.querySelectorAll("[data-cat-label]").forEach(function (n) { n.textContent = name; });
}

let _detailDropdownCloserBound = false;

async function initProductDetailPage() {
  const mount = document.getElementById("productDetail");
  if (!mount) return;
  if (mount.dataset.ready === "1") { refreshDetailCategoryLabels(); return; }

  const id = new URLSearchParams(location.search).get("id");
  const hadLocal = !!(id && Store.getProduct(id));
  const product = id ? await Store.loadProductById(id) : null;

  if (!product) {
    mount.innerHTML = productNotFoundHtml();
    return;
  }

  mount.dataset.ready = "1";
  renderProductDetail(mount, product);

  if (hadLocal) {
    Store.loadProductById(id, true).then(function (fresh) {
      if (!fresh) { mount.innerHTML = productNotFoundHtml(); return; }
      if (productDetailSignature(fresh) !== productDetailSignature(product)) renderProductDetail(mount, fresh);
    }).catch(function () {});
  }
}

function renderProductDetail(mount, product) {
  mount._product = product;

  document.title = product.name + " — " + (Store.getSettings().storeName || "متجرك الإلكتروني");

  const hasColors = !!(product.colors && product.colors.length);
  const hasSizes = !!(product.sizes && product.sizes.length);
  const hasMatrix = hasColors || hasSizes;
  const hasLegacyVariants = !hasMatrix && product.variants && product.variants.length > 0;
  const productAvailable = product.available !== false;

  let galleryHtml = "";
  let thumbnailsHtml = "";
  const allImages = [];
  
  if (product.image) allImages.push(product.image);
  if (product.images && Array.isArray(product.images)) {
      product.images.forEach(img => {
          if (img && !allImages.includes(img)) allImages.push(img);
      });
  }

  if (allImages.length > 0) {
    const fullFirst = window.getIkUrl(allImages[0], 1000, 85);
    galleryHtml = '<div class="detail-gallery"><img id="mainProductDetailImage" src="' + escapeHtml(fullFirst) + '" alt="' + escapeHtml(product.name) + '" class="detail-gallery-img progressive-img"></div>';
    
    if (allImages.length > 1) {
        thumbnailsHtml = '<div class="gallery-thumbnails">';
        allImages.forEach((img, index) => {
            const activeClass = index === 0 ? "active" : "";
            thumbnailsHtml += `<img src="${escapeHtml(window.getIkUrl(img, 150, 70))}" class="gallery-thumb ${activeClass}" data-src="${escapeHtml(window.getIkUrl(img, 1000, 85))}" alt="صورة ${index + 1}">`;
        });
        thumbnailsHtml += '</div>';
    }
  } else {
    const cat = Store.getCategories().find(function (c) { return c.id === product.categoryId; });
    const key = cat ? cat.icon : "box";
    galleryHtml = '<div class="placeholder-icon" style="height: 100%; display: flex; align-items: center; justify-content: center; background: var(--olive-50); border-radius: 16px; min-height:300px;">' + iconSvg(key) + "</div>";
  }

  let colorsHtml = "";
  if (hasColors) {
    colorsHtml =
      '<div class="detail-media-colors" style="margin-top:24px; padding:4px 0;">' +
        '<div class="color-head" style="margin-bottom:12px; font-size:.95rem;">' +
          '<span class="color-label" style="color:var(--ink-500);">اللون:</span> ' +
          '<strong id="selectedColorLabel" class="color-name" style="color:var(--olive-900); font-weight:700;">' + escapeHtml(product.colors[0] ? product.colors[0].name : "") + '</strong>' +
        '</div>' +
        '<div id="colorSwatches" class="color-swatches-wrap" style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">' +
          product.colors.map(function (c, i) {
            const bg = c.hex || "#ccc";
            return '<button type="button" class="color-swatch' + (i === 0 ? " is-selected" : "") + '" data-color="' + escapeHtml(c.name) + '" title="' + escapeHtml(c.name) + '" ' +
              'style="background:' + escapeHtml(bg) + '; width:42px; height:42px; border-radius:50%; border:2px solid #fff; padding:0; cursor:pointer; flex-shrink:0;"></button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  let sizesHtml = "";
  if (hasSizes) {
    sizesHtml =
      '<div class="field" style="margin-bottom:16px;">' +
        '<label style="display:block;margin-bottom:8px;font-weight:600;">الحجم:</label>' +
        '<div id="sizeButtons" style="display:flex;flex-wrap:wrap;gap:8px;">' +
          product.sizes.map(function (sz, i) {
            return '<button type="button" class="size-btn' + (i === 0 ? " is-selected" : "") + '" data-size="' + escapeHtml(sz) + '">' + escapeHtml(sz) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  let legacyVariantsHtml = "";
  if (hasLegacyVariants) {
      legacyVariantsHtml =
        '<div class="field" style="margin-bottom:20px;">' +
          '<label class="variant-label" style="display:block;margin-bottom:8px;font-weight:600;">الخيارات المتوفرة:</label>' +
          '<div id="customDropdown" style="position:relative;">' +
            '<button type="button" id="dropdownBtn" style="width:100%;padding:12px 16px;border-radius:var(--radius-sm);border:1px solid var(--line-strong);background:var(--white);font-family:var(--font-body);font-size:1rem;color:var(--ink-900);cursor:pointer;display:flex;justify-content:space-between;align-items:center;text-align:right;">' +
              '<span id="dropdownSelected">' + escapeHtml(product.variants[0]) + '</span>' +
              '<span id="dropdownArrow" style="transition:transform 0.3s;">&#9660;</span>' +
            '</button>' +
            '<ul id="dropdownList" style="display:none;position:absolute;top:calc(100% + 4px);right:0;left:0;background:var(--white);border:1px solid var(--line-strong);border-radius:var(--radius-sm);z-index:999;list-style:none;margin:0;padding:0;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:220px;overflow-y:auto;">' +
              product.variants.map(function (v, i) {
                return '<li data-variant="' + escapeHtml(v) + '" style="padding:12px 16px;cursor:pointer;font-family:var(--font-body);font-size:1rem;color:var(--ink-900);border-bottom:1px solid var(--line-soft);text-align:right;' + (i === 0 ? 'font-weight:700;' : '') + '">' + escapeHtml(v) + '</li>';
              }).join('') +
            '</ul>' +
          '</div>' +
        '</div>';
  }

  const initialStock = hasMatrix
    ? Store.getVariantStock(product, hasColors ? product.colors[0].name : null, hasSizes ? product.sizes[0] : null)
    : Store.getTotalStock(product);
  const initiallyOutOfStock = !productAvailable || initialStock <= 0;

  mount.innerHTML =
    '<div class="detail-grid">' +
      '<div class="detail-media">' +
        galleryHtml +
        thumbnailsHtml + 
        colorsHtml +
      '</div>' +
      '<div class="detail-info">' +
        '<span class="product-cat" data-cat-label="1">' + escapeHtml(Store.getCategoryName(product.categoryId)) + "</span>" +
        "<h1>" + escapeHtml(product.name) + "</h1>" +
        '<div class="stock-line" id="stockLine"><span class="dot' + (initiallyOutOfStock ? " dot-out" : "") + '"></span><span id="stockLineText">' + (initiallyOutOfStock ? "غير متوفر حاليًا" : "متوفر حاليًا") + "</span></div>" +
        '<div class="detail-price">' + priceHtml(product) + "</div>" +
        '<div id="descWrapper" style="position:relative; overflow:hidden; max-height:80px; transition: max-height 0.4s ease;">' +
          '<p style="margin:0; white-space: pre-wrap;">' + escapeHtml(product.description || "") + '</p>' +
          '<div id="descFade" style="position:absolute; bottom:0; left:0; right:0; height:40px; background:linear-gradient(transparent, var(--cream));"></div>' +
        '</div>' +
        '<button id="descToggle" style="background:none; border:none; color:var(--olive-700); font-weight:700; font-size:0.9rem; padding:4px 0; margin-bottom:12px; cursor:pointer;">قراءة المزيد ↓</button>' +
        sizesHtml +
        legacyVariantsHtml +
        '<div class="qty-stepper" id="qtyStepperWrap" style="' + (initiallyOutOfStock ? "display:none;" : "") + '"><button type="button" id="qtyMinus">−</button><input type="number" id="qtyInput" value="1" min="1" max="' + Math.max(initialStock, 1) + '"><button type="button" id="qtyPlus">+</button></div>' +
        '<div class="detail-actions" id="detailActions">' +
          (initiallyOutOfStock
            ? '<button class="btn btn-outline" disabled>غير متوفر حاليًا</button>'
            : '<button class="btn btn-primary" id="addToCartBtn">' + iconSvg("cart") + "أضف للسلة</button>" + '<button class="btn btn-whatsapp" id="orderNowBtn">' + iconSvg("whatsapp") + "طلب عبر واتساب</button>"
          ) +
        "</div>" +
        '<div class="detail-meta"><span>القسم: <span data-cat-label="1">' + escapeHtml(Store.getCategoryName(product.categoryId)) + '</span></span><span id="availabilityMeta">حالة التوفر: ' + (initiallyOutOfStock ? "غير متوفر" : "متوفر") + '</span></div>' +
      "</div>" +
    "</div>";

  if (typeof window.initProgressiveImages === "function") {
    window.initProgressiveImages(mount);
  }

  const thumbs = document.querySelectorAll(".gallery-thumb");
  const mainImage = document.getElementById("mainProductDetailImage");
  if (thumbs.length > 0 && mainImage) {
      thumbs.forEach(thumb => {
          thumb.addEventListener("click", function() {
              thumbs.forEach(t => t.classList.remove("active"));
              this.classList.add("active");
              mainImage.src = this.dataset.src;
          });
      });
  }

  let selectedColor = hasColors ? product.colors[0].name : null;
  let selectedSize = hasSizes ? product.sizes[0] : null;
  let selectedVariant = hasLegacyVariants ? product.variants[0] : null;

  function updateSmartSizesAvailability() {
    if (!hasSizes) return;
    const sizeBtns = document.querySelectorAll("#sizeButtons .size-btn");
    let hasAvailableSelected = false;

    sizeBtns.forEach(btn => {
      const sz = btn.dataset.size;
      const stock = Store.getVariantStock(product, selectedColor, sz);
      const isOut = stock <= 0;

      btn.classList.toggle("is-out-of-stock", isOut);
      btn.disabled = isOut;
      if (isOut) {
        btn.style.opacity = "0.38";
        btn.style.textDecoration = "line-through";
        btn.title = "غير متوفر بهذا اللون";
      } else {
        btn.style.opacity = "1";
        btn.style.textDecoration = "none";
        btn.title = "";
        if (sz === selectedSize) hasAvailableSelected = true;
      }
    });

    if (!hasAvailableSelected) {
      const firstAvailableBtn = document.querySelector("#sizeButtons .size-btn:not(.is-out-of-stock)");
      if (firstAvailableBtn) {
        sizeBtns.forEach(b => b.classList.remove("is-selected"));
        firstAvailableBtn.classList.add("is-selected");
        selectedSize = firstAvailableBtn.dataset.size;
      }
    }
  }

  function refreshAvailabilityUI() {
    updateSmartSizesAvailability();

    const stock = hasMatrix ? Store.getVariantStock(product, selectedColor, selectedSize) : Store.getTotalStock(product);
    const outOfStock = !productAvailable || stock <= 0;

    const stockLine = document.getElementById("stockLine");
    const stockLineText = document.getElementById("stockLineText");
    if (stockLine && stockLineText) {
      stockLine.querySelector(".dot").classList.toggle("dot-out", outOfStock);
      stockLineText.textContent = outOfStock ? "غير متوفر حاليًا" : "متوفر حاليًا";
    }
    const availabilityMeta = document.getElementById("availabilityMeta");
    if (availabilityMeta) availabilityMeta.textContent = "حالة التوفر: " + (outOfStock ? "غير متوفر" : "متوفر");

    const qtyWrap = document.getElementById("qtyStepperWrap");
    const qtyInput = document.getElementById("qtyInput");
    if (qtyWrap) qtyWrap.style.display = outOfStock ? "none" : "";
    if (qtyInput) {
      qtyInput.max = Math.max(stock, 1);
      if (Number(qtyInput.value) > stock) qtyInput.value = Math.max(stock, 1);
    }

    const actions = document.getElementById("detailActions");
    if (actions) {
      actions.innerHTML = outOfStock
        ? '<button class="btn btn-outline" disabled>غير متوفر حاليًا</button>'
        : '<button class="btn btn-primary" id="addToCartBtn">' + iconSvg("cart") + "أضف للسلة</button>" + '<button class="btn btn-whatsapp" id="orderNowBtn">' + iconSvg("whatsapp") + "طلب عبر واتساب</button>";
      wireActionButtons();
    }
    return outOfStock;
  }

  function wireActionButtons() {
    const addBtn = document.getElementById("addToCartBtn");
    const orderBtn = document.getElementById("orderNowBtn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        const qty = readSelectedQty();
        const meta = { color: selectedColor, size: selectedSize, variant: selectedVariant };
        const itemKey = buildCartItemKey(product.id, meta);
        const res = Store.addToCart(itemKey, qty, meta);
        if (res && res.blocked) showToast("هذا الخيار غير متوفر حاليًا", "error");
        else if (res && res.capped) showToast("وصلت للحد الأقصى المتوفر من هذا المنتج", "error");
        else showToast(product.name + " أُضيف إلى السلة", "success");
        if (typeof window.updateCartBadge === "function") {
          window.updateCartBadge();
        }
      });
    }
    if (orderBtn) {
      orderBtn.addEventListener("click", function () {
        const qty = readSelectedQty();
        orderSingleProductViaWhatsApp(product, qty, { color: selectedColor, size: selectedSize, variant: selectedVariant });
      });
    }
  }

  function readSelectedQty() {
    const qtyInput = document.getElementById("qtyInput");
    const stock = hasMatrix ? Store.getVariantStock(product, selectedColor, selectedSize) : Store.getTotalStock(product);
    let qty = Math.floor(Number(qtyInput ? qtyInput.value : 1)) || 1;
    qty = Math.max(1, Math.min(qty, Math.max(stock, 1)));
    if (qtyInput) qtyInput.value = qty;
    return qty;
  }

  const colorSwatches = document.getElementById("colorSwatches");
  if (colorSwatches) {
    colorSwatches.querySelectorAll(".color-swatch").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedColor = btn.dataset.color;
        colorSwatches.querySelectorAll(".color-swatch").forEach(function (b) { b.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        const label = document.getElementById("selectedColorLabel");
        if (label) label.textContent = selectedColor;
        
        const colorObj = product.colors.find(function (c) { return c.name === selectedColor; });
        if (mainImage && colorObj && colorObj.image) {
            mainImage.src = window.getIkUrl(colorObj.image, 1000, 85);
            thumbs.forEach(t => t.classList.remove("active"));
        }
        
        refreshAvailabilityUI();
      });
    });
  }

  const sizeButtons = document.getElementById("sizeButtons");
  if (sizeButtons) {
    sizeButtons.querySelectorAll(".size-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        selectedSize = btn.dataset.size;
        sizeButtons.querySelectorAll(".size-btn").forEach(function (b) {
          b.classList.remove("is-selected");
        });
        btn.classList.add("is-selected");
        refreshAvailabilityUI();
      });
    });
  }

  const customDropdown = document.getElementById("customDropdown");
  const dropdownBtn = document.getElementById("dropdownBtn");
  const dropdownList = document.getElementById("dropdownList");
  const dropdownSelected = document.getElementById("dropdownSelected");
  const dropdownArrow = document.getElementById("dropdownArrow");

  if (customDropdown && dropdownBtn) {
    dropdownBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const isOpen = dropdownList.style.display === "block";
      dropdownList.style.display = isOpen ? "none" : "block";
      dropdownArrow.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
    });

    dropdownList.querySelectorAll("li").forEach(function (li) {
      li.addEventListener("mouseover", function () { li.style.background = "var(--cream)"; });
      li.addEventListener("mouseout", function () { li.style.background = ""; });
      li.addEventListener("click", function () {
        selectedVariant = li.dataset.variant;
        dropdownSelected.textContent = selectedVariant;
        dropdownList.style.display = "none";
        dropdownArrow.style.transform = "rotate(0deg)";
        dropdownList.querySelectorAll("li").forEach(function (el) { el.style.fontWeight = ""; });
        li.style.fontWeight = "700";
        
        if (mainImage && product.variantImages && product.variantImages[selectedVariant]) {
            mainImage.src = window.getIkUrl(product.variantImages[selectedVariant], 1000, 85);
            thumbs.forEach(t => t.classList.remove("active"));
        }
      });
    });

    if (!_detailDropdownCloserBound) {
      _detailDropdownCloserBound = true;
      document.addEventListener("click", function () {
        const list = document.getElementById("dropdownList");
        const arrow = document.getElementById("dropdownArrow");
        if (list) list.style.display = "none";
        if (arrow) arrow.style.transform = "rotate(0deg)";
      });
    }
  }

  refreshAvailabilityUI();

  const qtyMinus = document.getElementById("qtyMinus");
  const qtyPlus = document.getElementById("qtyPlus");
  if (qtyMinus) qtyMinus.addEventListener("click", function () {
    const qtyInput = document.getElementById("qtyInput");
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  if (qtyPlus) qtyPlus.addEventListener("click", function () {
    const qtyInput = document.getElementById("qtyInput");
    qtyInput.value = Math.min(Number(qtyInput.max) || 1, Number(qtyInput.value) + 1);
  });

  const descWrapper = document.getElementById("descWrapper");
  const descToggle = document.getElementById("descToggle");
  const descFade = document.getElementById("descFade");
  if (descToggle && descWrapper) {
    let expanded = false;
    descToggle.addEventListener("click", function () {
      expanded = !expanded;
      descWrapper.style.maxHeight = expanded ? descWrapper.scrollHeight + "px" : "80px";
      descFade.style.display = expanded ? "none" : "block";
      descToggle.textContent = expanded ? "إخفاء ↑" : "قراءة المزيد ↓";
    });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  initHomeCollections();
  initShopPage();
  initProductDetailPage();
});

document.addEventListener("store:synced", function () {
  initHomeCollections();
  if (document.getElementById("shopGrid")) {
    renderCategoryFilterPanel();
    renderShopResults({ reset: true });
  }
  if (document.getElementById("productDetail")) initProductDetailPage();
});
