/* ==========================================================================
   whatsapp.js
   تنسيق العملة (دينار عراقي) + بناء روابط واتساب مع نافذة معلومات التوصيل والملاحظات
   ========================================================================== */

function formatPrice(amount) {
  const symbol = (typeof Store !== "undefined" && Store.getSettings && Store.getSettings().currencySymbol) || "د.ع";
  const num = Number(amount) || 0;
  return num.toLocaleString("en-US") + " " + symbol;
}

/* سعر المنتج للعرض: عند العرض الخاص وتوفر سعر قديم أكبر من الجديد يظهر السعر الجديد مع القديم مشطوباً */
function priceHtml(product) {
  const price = Number(product && product.price) || 0;
  const old = Number(product && product.oldPrice) || 0;
  if (product && product.isOffer && price > 0 && old > price) {
    return '<span class="price-sale">' + formatPrice(price) + '</span><span class="price-old">' + formatPrice(old) + '</span>';
  }
  return formatPrice(price);
}

/* رابط الخرائط: يُقبل http/https فقط */
function safeMapUrl(url) {
  const u = String(url || "").trim();
  return /^https?:\/\/\S+$/i.test(u) ? u : "";
}

function whatsappDigitsOnly(number) {
  return String(number || "").replace(/[^0-9]/g, "");
}

/* فحص منع تكرار الطلبات السريعة (Rate Limiting 30s) */
function checkOrderRateLimit() {
  const lastOrderTime = Number(localStorage.getItem("ws_last_order_ts") || 0);
  const now = Date.now();
  if (lastOrderTime && (now - lastOrderTime) < 30000) {
    const waitSec = Math.ceil((30000 - (now - lastOrderTime)) / 1000);
    if (typeof showToast === "function") {
      showToast("تم إرسال طلبك مؤخراً. يرجى الانتظار " + waitSec + " ثانية قبل إرسال طلب جديد.", "error");
    } else {
      alert("تم إرسال طلبك مؤخراً. يرجى الانتظار " + waitSec + " ثانية قبل إرسال طلب جديد.");
    }
    return false;
  }
  localStorage.setItem("ws_last_order_ts", String(now));
  return true;
}

function showDeliveryModal(onConfirm) {
  let modal = document.getElementById("deliveryModal");
  const STORAGE_KEY = "ws_saved_customer_info";

  // استرجاع البيانات المحفوظة مسبقاً إن وجدت
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (err) {
    saved = {};
  }
  
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "deliveryModal";
    modal.className = "modal-overlay";
    modal.innerHTML =
      '<div class="modal-card" style="max-width: 400px; width: 90%; max-height: 90vh; overflow-y: auto;">' +
        '<div class="modal-head">' +
          '<h3 style="margin:0;">معلومات التوصيل</h3>' +
          '<button class="close-modal" id="closeDeliveryModal" type="button">' + iconSvg("close") + '</button>' +
        '</div>' +
        '<p style="font-size: .85rem; margin-top: -10px; margin-bottom: 20px;">يرجى إدخال معلوماتك لإكمال الطلب عبر واتساب.</p>' +
        '<form id="deliveryForm">' +
          '<div class="field"><label>الاسم الكامل *</label><input type="text" id="delName" placeholder="مثال: أحمد علي" autocomplete="name" required></div>' +
          '<div class="field"><label>المحافظة *</label><input type="text" id="delGov" placeholder="مثال: بغداد / كربلاء" autocomplete="address-level1" required></div>' +
          '<div class="field"><label>المنطقة *</label><input type="text" id="delArea" placeholder="مثال: حي الحسين" autocomplete="address-level2" required></div>' +
          '<div class="field"><label>أقرب نقطة دالة (اختياري)</label><input type="text" id="delLandmark" placeholder="مثال: قرب مجسر..."></div>' +
          '<div class="field">' +
            '<label>رقم الهاتف (عراقي 11 رقم) *</label>' +
            '<input type="tel" id="delPhone" placeholder="07XXXXXXXXX" dir="ltr" inputmode="tel" autocomplete="tel" required style="text-align: right;">' +
            '<small id="phoneValidationHint" style="display:none; font-size:12px; margin-top:5px; font-weight:500;"></small>' +
          '</div>' +
          '<div class="field"><label>ملاحظات (اختياري)</label><textarea id="delNotes" placeholder="مثال: التوصيل مساءً، أو أي تفاصيل أخرى..." style="min-height: 60px;"></textarea></div>' +
          '<button type="submit" class="btn btn-whatsapp btn-block" id="delSubmitBtn" style="margin-top:20px;">تأكيد وإرسال عبر واتساب</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById("closeDeliveryModal").addEventListener("click", function() {
      modal.classList.remove("open");
    });
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.classList.remove("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") modal.classList.remove("open"); });
  }

  const oldForm = document.getElementById("deliveryForm");
  const newForm = oldForm.cloneNode(true);
  oldForm.parentNode.replaceChild(newForm, oldForm);

  const nameInput = document.getElementById("delName");
  const phoneInput = document.getElementById("delPhone");
  const phoneHint = document.getElementById("phoneValidationHint");
  const submitBtn = document.getElementById("delSubmitBtn");

  function validatePhoneNumber(value) {
    const clean = String(value || "").replace(/[^0-9]/g, "");
    const regex = /^07[3-9][0-9]{8}$/;

    if (!clean) {
      phoneHint.style.display = "none";
      phoneInput.style.borderColor = "var(--border)";
      if (submitBtn) submitBtn.disabled = false;
      return false;
    }

    if (regex.test(clean)) {
      phoneHint.style.display = "block";
      phoneHint.style.color = "var(--success)";
      phoneHint.textContent = "✓ رقم هاتف صحيح";
      phoneInput.style.borderColor = "var(--success)";
      if (submitBtn) submitBtn.disabled = false;
      return true;
    } else {
      phoneHint.style.display = "block";
      phoneHint.style.color = "var(--error)";
      phoneHint.textContent = "يجب أن يبدأ بـ 07 ويتكون من 11 رقماً";
      phoneInput.style.borderColor = "var(--error)";
      if (submitBtn) submitBtn.disabled = true;
      return false;
    }
  }

  if (nameInput) nameInput.value = saved.name || "";
  document.getElementById("delGov").value = saved.gov || "";
  document.getElementById("delArea").value = saved.area || "";
  document.getElementById("delLandmark").value = saved.landmark && saved.landmark !== "لا يوجد" ? saved.landmark : "";
  phoneInput.value = saved.phone || "";
  const notesField = document.getElementById("delNotes");
  if (notesField) notesField.value = saved.notes || "";
  if (submitBtn) submitBtn.disabled = false;
  phoneHint.style.display = "none";
  phoneInput.style.borderColor = "";

  if (phoneInput.value) {
    validatePhoneNumber(phoneInput.value);
  }

  phoneInput.oninput = function(e) {
    validatePhoneNumber(e.target.value);
  };

  modal.classList.add("open");

  newForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const rawPhone = document.getElementById("delPhone").value.trim();
    if (!validatePhoneNumber(rawPhone)) {
      document.getElementById("delPhone").focus();
      return;
    }

    if (!checkOrderRateLimit()) {
      return;
    }

    const info = {
      name: (document.getElementById("delName") ? document.getElementById("delName").value.trim() : ""),
      gov: document.getElementById("delGov").value.trim(),
      area: document.getElementById("delArea").value.trim(),
      landmark: document.getElementById("delLandmark").value.trim() || "لا يوجد",
      phone: rawPhone,
      notes: document.getElementById("delNotes") ? document.getElementById("delNotes").value.trim() : ""
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    } catch (err) {}

    modal.classList.remove("open"); 
    onConfirm(info); 
  });
}

function variantLineText(item) {
  const parts = [];
  if (item.color) parts.push("اللون: " + item.color);
  if (item.size) parts.push("المقاس: " + item.size);
  if (!parts.length && item.variant) parts.push("الخيار: " + item.variant);
  return parts.join(" — ");
}

function getOrderableCartLines(cart, products) {
  const lines = [];
  let skipped = 0;
  cart.forEach(function (line) {
    const p = products.find(function (x) { return x.id === line.productId; });
    if (!p) { skipped++; return; }
    const stock = Store.getVariantStock(p, line.color, line.size);
    if (p.available === false || stock <= 0) { skipped++; return; }
    lines.push(Object.assign({}, line, { qty: Math.max(1, Math.min(line.qty, stock)) }));
  });
  return { lines: lines, skipped: skipped };
}

function isWhatsAppConfigured() {
  return !!whatsappDigitsOnly(Store.getSettings().whatsapp);
}

function buildProductWhatsAppLink(product, qty, info, selection) {
  selection = selection || {};
  const quantity = Math.max(1, qty || 1);
  const total = product.price * quantity;
  const variantLine = variantLineText(selection);

  const lines = [
    "السلام عليكم، أود طلب هذا المنتج:",
    "",
    " *تفاصيل الطلب:*",
    "- اسم المنتج: *" + product.name + "*",
    variantLine ? " " + variantLine : null,
    "- الكمية: " + quantity,
    "- السعر: *" + formatPrice(total) + "* (غير شامل أجور التوصيل)",
    "",
    " *معلومات الزبون والتوصيل:*",
    info.name ? "- اسم الزبون: *" + info.name + "*" : null,
    "- المحافظة: *" + info.gov + "*",
    "- المنطقة: *" + info.area + "*",
    "- أقرب نقطة دالة: " + info.landmark,
    "- رقم الهاتف: *" + info.phone + "*",
    info.notes ? " *ملاحظات:* " + info.notes : null,
    "",
    "أنتظر تأكيدكم لإتمام الطلب، شكراً لكم!"
  ].filter(Boolean);

  return buildWhatsAppUrl(lines.join("\n"));
}

function buildCartWhatsAppLink(cartLines, products, info) {
  const messageLines = [
    "السلام عليكم، أود طلب هذه المنتجات من السلة:",
    "",
    " *تفاصيل الطلب:*"
  ];

  let total = 0;
  cartLines.forEach(function (line) {
    const p = products.find(function (x) { return x.id === line.productId; });
    if (p) {
      const variantLine = variantLineText(line);
      messageLines.push("▪️ *" + p.name + "*" + (variantLine ? " (" + variantLine + ")" : "") + " — الكمية: " + line.qty);
      total += p.price * line.qty;
    }
  });

  messageLines.push("");
  messageLines.push(" *السعر الإجمالي:* *" + formatPrice(total) + "* (غير شامل أجور التوصيل)");
  messageLines.push("");
  messageLines.push(" *معلومات الزبون والتوصيل:*");
  if (info.name) {
    messageLines.push(" اسم الزبون: *" + info.name + "*");
  }
  messageLines.push(" المحافظة: *" + info.gov + "*");
  messageLines.push(" المنطقة: *" + info.area + "*");
  messageLines.push(" أقرب نقطة دالة: " + info.landmark);
  messageLines.push(" رقم الهاتف: *" + info.phone + "*");
  if (info.notes) {
    messageLines.push(" *ملاحظات:* " + info.notes);
  }
  messageLines.push("");
  messageLines.push("أنتظر تأكيدكم لإتمام الطلب، شكراً لكم!");

  return buildWhatsAppUrl(messageLines.join("\n"));
}

function buildWhatsAppUrl(message) {
  const number = whatsappDigitsOnly(Store.getSettings().whatsapp);
  return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
}

function orderSingleProductViaWhatsApp(product, qty, selection) {
  if (!isWhatsAppConfigured()) {
    showToast("لم يتم إعداد رقم واتساب بعد. الرجاء إضافته من لوحة التحكم ← الإعدادات.");
    return;
  }
  selection = selection || {};

  /* إذا كانت السلة تحتوي منتجات أخرى: يُرسل المنتج الحالي + كل ما في السلة في طلب واحد */
  const cartNow = Store.getCart();
  if (cartNow.length) {
    let allProducts = Store.getProducts();
    if (!allProducts.some(function (x) { return x.id === product.id; })) allProducts = allProducts.concat([product]);
    const orderableCart = getOrderableCartLines(cartNow, allProducts);
    const pageKey = buildCartItemKey(product.id, selection);
    const pageLine = {
      itemKey: pageKey,
      productId: product.id,
      qty: qty,
      color: selection.color || null,
      size: selection.size || null,
      variant: selection.variant || null
    };
    /* نفس المنتج بنفس الخيار موجود في السلة: نعتمد الكمية المختارة في الصفحة بدل تكراره */
    const combinedLines = [pageLine].concat(orderableCart.lines.filter(function (l) { return l.itemKey !== pageKey; }));

    if (combinedLines.length > 1) {
      if (orderableCart.skipped > 0) {
        showToast("تم استبعاد " + orderableCart.skipped + " منتج غير متوفر من السلة.");
      }
      showDeliveryModal(function (info) {
        const items = combinedLines.map(function (line) {
          const p = allProducts.find(function (pp) { return pp.id === line.productId; });
          return p ? {
            productId: p.id,
            name: p.name,
            qty: line.qty,
            price: p.price,
            color: line.color || null,
            size: line.size || null,
            variant: line.variant || null
          } : null;
        }).filter(Boolean);
        const total = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);

        Store.logOrder({
          type: "cart",
          customer: {
            name: info.name || "",
            gov: info.gov,
            area: info.area,
            landmark: info.landmark,
            phone: info.phone,
            notes: info.notes || ""
          },
          items: items,
          total: total
        });

        window.open(buildCartWhatsAppLink(combinedLines, allProducts, info), "_blank");
        Store.clearCart();
        if (typeof window.updateCartBadge === "function") window.updateCartBadge();
      });
      return;
    }
  }
  showDeliveryModal(function(info) {
    Store.logOrder({
      type: "single",
      customer: {
        name: info.name || "",
        gov: info.gov,
        area: info.area,
        landmark: info.landmark,
        phone: info.phone,
        notes: info.notes || ""
      },
      items: [{
        productId: product.id,
        name: product.name,
        qty: qty,
        price: product.price,
        color: selection.color || null,
        size: selection.size || null,
        variant: selection.variant || null
      }],
      total: product.price * qty
    });
    window.open(buildProductWhatsAppLink(product, qty, info, selection), "_blank");
  });
}

function orderCartViaWhatsApp() {
  const cart = Store.getCart();
  if (!cart.length) return;
  if (!isWhatsAppConfigured()) {
    showToast("لم يتم إعداد رقم واتساب بعد. الرجاء إضافته من لوحة التحكم ← الإعدادات.");
    return;
  }
  const products = Store.getProducts();

  const orderable = getOrderableCartLines(cart, products);
  if (!orderable.lines.length) {
    showToast("لا توجد منتجات متوفرة في السلة لإتمام الطلب.");
    return;
  }
  if (orderable.skipped > 0) {
    showToast("تم استبعاد " + orderable.skipped + " منتج غير متوفر من الطلب.");
  }
  const orderLines = orderable.lines;

  showDeliveryModal(function(info) {
    const items = orderLines.map(function (line) {
      const p = products.find(function (pp) { return pp.id === line.productId; });
      return p ? {
        productId: p.id,
        name: p.name,
        qty: line.qty,
        price: p.price,
        color: line.color || null,
        size: line.size || null,
        variant: line.variant || null
      } : null;
    }).filter(Boolean);

    const total = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);

    Store.logOrder({
      type: "cart",
      customer: {
        name: info.name || "",
        gov: info.gov,
        area: info.area,
        landmark: info.landmark,
        phone: info.phone,
        notes: info.notes || ""
      },
      items: items,
      total: total
    });

    window.open(buildCartWhatsAppLink(orderLines, products, info), "_blank");
    Store.clearCart();
  });
}
