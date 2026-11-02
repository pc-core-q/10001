/* Firebase Authentication — حساب الأدمن الحقيقي */

let adminAuthReadyResolve;
const adminAuthReady = new Promise(resolve => { adminAuthReadyResolve = resolve; });

function isAllowedAdminEmail(email) {
  const allowed = Array.isArray(STORE_CONFIG.adminEmails) ? STORE_CONFIG.adminEmails : [];
  return allowed.length > 0 && allowed.map(e => String(e).trim().toLowerCase()).includes(String(email || "").trim().toLowerCase());
}

function initAdminAuthGuard() {
  if (typeof firebase === "undefined" || typeof firebase.auth !== "function") {
    adminAuthReadyResolve(false);
    return;
  }
  firebase.auth().onAuthStateChanged(async function(user) {
    if (user && isAllowedAdminEmail(user.email)) {
      sessionStorage.setItem("ws_admin_session", "1");
      adminAuthReadyResolve(true);
      document.dispatchEvent(new CustomEvent("admin:auth-ready"));
      return;
    }
    sessionStorage.removeItem("ws_admin_session");
    adminAuthReadyResolve(false);
    if (document.getElementById("adminApp")) {
      window.location.replace("login.html");
    }
  });
}

async function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const errorBox = document.getElementById("loginError");
  if (typeof firebase === "undefined" || typeof firebase.auth !== "function") {
    if (errorBox) {
      errorBox.textContent = "لم يتم إعداد Firebase Authentication بعد.";
      errorBox.style.display = "block";
    }
    return;
  }

  firebase.auth().onAuthStateChanged(function(user) {
    if (user && isAllowedAdminEmail(user.email)) window.location.replace("admin.html");
  });

  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    if (errorBox) errorBox.style.display = "none";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = "جارٍ التحقق..."; }

    try {
      await Store.login(email, password);
      window.location.replace("admin.html");
    } catch (error) {
      console.error("Admin login error:", error);
      const code = error && error.code || "";
      const message = code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
        ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
        : (error && error.message) || "تعذر تسجيل الدخول.";
      if (errorBox) { errorBox.textContent = message; errorBox.style.display = "block"; }
      if (submit) { submit.disabled = false; submit.textContent = "دخول"; }
    }
  });
}

async function requireAdminAuth() {
  const ok = await adminAuthReady;
  if (!ok) {
    window.location.replace("login.html");
    return false;
  }
  return true;
}

async function handleAdminLogout() {
  await Store.logout();
  window.location.replace("login.html");
}

document.addEventListener("DOMContentLoaded", function() {
  initAdminAuthGuard();
  initLoginPage();
});
