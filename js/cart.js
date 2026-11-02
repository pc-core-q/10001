/* ==========================================================================
   cart.js
   منطق صفحة السلة (cart.html) فقط.
   تم التحديث: توحيد مقاسات الصور لمنع استهلاك ImageKit + إلغاء الرسم المزدوج.
   ========================================================================== */

function cartLineMediaUrl(line, product) {
  if (line.color && product.colors && product.colors.length) {
    const c = product.colors.find(function (cc) { return cc.name === line.color; });
    if (c && c.image) return c.image;
  }
  if (line.variant && product.variantImages && product.variantImages[line.variant]) {
    return product.variantImages[line.variant];
  }
  return product.image || null;
}

function cartLineVariantLabel(line) {
  const parts = [];
  if (line.color) parts.push(line.color);
  if (line.size) parts.push(line.size);
  if (!parts.length && line.variant) parts.push(line.variant);
  return parts.join(" / ");
}

function cartLineHtml(line, product, unavailable) {
  const mediaUrl = cartLineMediaUrl(line, product);
  const optimizedMediaUrl = typeof window.getIkUrl === 'function' ? window.getIkUrl(mediaUrl, 160, 70) : mediaUrl;
  const media = optimizedMediaUrl
    ? '<img src="' + escapeHtml(optimizedMediaUrl) + '" alt="' + escapeHtml(product.name) + '" width="150" height="150" loading="lazy" decoding="async" style="background:var(--surface-2);">'
    : '<div class="placeholder-icon-wrap">' + iconSvg(
        (Store.getCategories().find(function (c) { return c.id === product.categoryId; }) || {}).icon || "box"
      ) + "</div>";

  const variantLabel = cartLineVariantLabel(line);
  const displayName = escapeHtml(product.name) + (variantLabel ? ' <span style="color:var(--olive-600); font-size: 0.85em;">(' + escapeHtml(variantLabel) + ')</span>' : '');
  const unavailableHtml = unavailable
    ? '<div style="color:var(--danger);font-size:.85rem;font-weight:700;margin-bottom:4px;">غير متوفر حاليًا — لن يُضاف إلى الطلب</div>'
    : '';
  const maxStock = Math.max(1, Math.floor(Store.getVariantStock(product, line.color, line.size)));

  return (
    '<div class="cart-item" data-id="' + escapeHtml(line.itemKey) + '">' +
      media +
      '<div>' +
        "<h4>" + displayName + "</h4>" +
        unavailableHtml +
        '<div class="unit-price">' + formatPrice(product.price) + " / قطعة</div>" +
        '<button type="button" class="remove-btn" onclick="removeCartLine(' + jsStr(line.itemKey) + ')">' + 
          iconSvg("trash") + ' <span>إزالة من السلة</span>' + 
        '</button>' +
      "</div>" +
      '<div class="qty-stepper">' +
        '<button type="button" onclick="stepCartQty(' + jsStr(line.itemKey) + ', -1)">−</button>' +
        '<input type="number" min="1" max="' + maxStock + '" value="' + line.qty + '" ' +
          'onchange="setCartQty(' + jsStr(line.itemKey) + ', this.value)">' +
        '<button type="button" onclick="stepCartQty(' + jsStr(line.itemKey) + ', 1)">+</button>' +
      "</div>" +
      '<div class="price">' + formatPrice(product.price * line.qty) + "</div>" +
    "</div>"
  );
}

let cartRefreshing = false;   // true أثناء تحديث الأسعار/المخزون من Firebase

function cartMissingLineHtml(line) {
  if (cartRefreshing) {
    return '<div class="cart-item" aria-hidden="true" style="display:block"><span class="skeleton-line" style="height:76px"></span></div>';
  }
  return '<div class="cart-item" data-id="' + escapeHtml(line.itemKey) + '" style="display:block">' +
    '<div style="color:var(--danger);font-weight:700;margin-bottom:6px;">هذا المنتج لم يعد متوفرًا في المتجر — لن يُضاف إلى الطلب</div>' +
    '<button type="button" class="remove-btn" onclick="removeCartLine(' + jsStr(line.itemKey) + ')">' +
      iconSvg("trash") + ' <span>إزالة من السلة</span></button></div>';
}

function renderCartPage() {
  const listEl = document.getElementById("cartItems");
  if (!listEl) return;

  const cart = Store.getCart();
  const products = Store.getProducts();

  const rows = [];
  let subtotal = 0;
  let itemCount = 0;
  let hasUnavailable = false;
  let orderableCount = 0;

  cart.forEach(function (line) {
    const product = products.find(function (p) { return p.id === line.productId; });
    if (!product) {
      if (!cartRefreshing) hasUnavailable = true;
      rows.push(cartMissingLineHtml(line));
      return;
    }
    const variantStock = Store.getVariantStock(product, line.color, line.size);
    const unavailable = product.available === false || variantStock <= 0;
    if (unavailable) {
      hasUnavailable = true;
      rows.push(cartLineHtml(line, product, true));
      return;
    }
    const qty = Math.min(line.qty, variantStock);
    subtotal += product.price * qty;
    itemCount += qty;
    orderableCount++;
    rows.push(cartLineHtml(Object.assign({}, line, { qty: qty }), product, false));
  });

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty-state">' + iconSvg("cart") +
      "<p>سلتك فارغة حاليًا.</p>" +
      '<a href="products.html" class="btn btn-primary">تصفح المنتجات</a></div>';
  } else {
    listEl.innerHTML = rows.join("");
  }

  const subtotalEl = document.getElementById("cartSubtotal");
  const totalEl = document.getElementById("cartTotal");
  const countEl = document.getElementById("cartItemCount");
  const checkoutBtn = document.getElementById("checkoutBtn");
  const warningEl = document.getElementById("cartWarning");

  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (totalEl) totalEl.textContent = formatPrice(subtotal);
  if (countEl) countEl.textContent = itemCount;
  if (checkoutBtn) checkoutBtn.disabled = orderableCount === 0 || cartRefreshing;
  if (warningEl) {
    warningEl.style.display = hasUnavailable ? "block" : "none";
  }

  const deliveryNoteEl = document.getElementById("cartDeliveryNote");
  if (deliveryNoteEl) {
    const deliveryInfo = (Store.getSettings().deliveryInfo || "").trim();
    deliveryNoteEl.innerHTML = "<strong>ملاحظة: سعر المنتج غير شامل أجور التوصيل</strong>" +
      (deliveryInfo ? "<br>" + escapeHtml(deliveryInfo) : "");
  }
}

function stepCartQty(itemKey, delta) {
  const cart = Store.getCart();
  const line = cart.find(function (l) { return l.itemKey === itemKey; });
  if (!line) return;
  const product = Store.getProduct(line.productId);
  if (!product) return;
  
  const maxStock = Store.getVariantStock(product, line.color, line.size);
  const next = line.qty + delta;
  
  // إذا كانت الكمية الحالية 1 وتم الضغط على زر الإنقاص، يُحذف المنتج فوراً
  if (next <= 0) {
    removeCartLine(itemKey);
    return;
  }

  if (next > maxStock) {
    if (typeof showToast === "function") showToast("عذراً، هذه هي الكمية القصوى المتوفرة.", "error");
    return;
  }

  // Store.setQty تطلق تلقائياً حدث cart:updated الذي يعيد الرسم
  Store.setQty(itemKey, next);
}

function setCartQty(itemKey, value) {
  const cart = Store.getCart();
  const line = cart.find(function (l) { return l.itemKey === itemKey; });
  if (!line) return;
  const product = Store.getProduct(line.productId);
  if (!product) return;
  
  const maxStock = Store.getVariantStock(product, line.color, line.size);
  let qty = parseInt(value, 10);
  
  if (isNaN(qty) || qty <= 0) {
    removeCartLine(itemKey);
    return;
  }
  
  if (qty > maxStock) {
    qty = maxStock;
    if (typeof showToast === "function") showToast("تم ضبط الكمية إلى الحد الأقصى المتوفر (" + maxStock + ").", "error");
  }
  
  Store.setQty(itemKey, qty);
}

function removeCartLine(itemKey) {
  Store.removeFromCart(itemKey);
  if (typeof showToast === "function") showToast("تمت إزالة المنتج من السلة", "success");
}

async function initCartPage() {
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (!checkoutBtn) return;

  checkoutBtn.addEventListener("click", function () {
    if (!Store.getCart().length || cartRefreshing) return;
    if (!isWhatsAppConfigured()) {
      if (typeof showToast === "function") showToast("لم يتم إعداد رقم واتساب بعد. الرجاء إضافته من لوحة التحكم ← الإعدادات.", "error");
      return;
    }
    orderCartViaWhatsApp();
  });

  const lines = Store.getCart();
  if (lines.length) {
    cartRefreshing = true;
    renderCartPage();                       // عرض فوري من الكاش
    // تحديث كل منتج في السلة من الخادم للتأكد من أحدث سعر ومخزون
    const ids = Array.from(new Set(lines.map(function (l) { return l.productId; })));
    try {
      await Promise.all(ids.map(function (id) { return Store.loadProductById(id, true); }));
    } catch (e) {
      console.error("Cart refresh error:", e);
    }
    cartRefreshing = false;
  }
  renderCartPage();
}

document.addEventListener("DOMContentLoaded", initCartPage);
document.addEventListener("cart:updated", renderCartPage);
