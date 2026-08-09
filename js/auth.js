/**
 * HerSafe — auth.html page logic, plus a shared HerSafeAuth helper other
 * pages use to reflect signed-in state (name, sign-out) without a full
 * accounts system getting in the way of guest usage.
 */
(function () {
  function redirectBack() {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    window.location.href = next && next.startsWith("/") === false && !next.includes("://") ? next : "index.html";
  }

  function initTabs() {
    const tabs = document.querySelectorAll("[data-auth-tab]");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
        tab.setAttribute("aria-selected", "true");
        document.querySelectorAll("[data-auth-panel]").forEach((p) => (p.hidden = true));
        document.querySelector(`[data-auth-panel="${tab.dataset.authTab}"]`).hidden = false;
      });
    });
  }

  function initForms() {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById("login-error");
      errorBox.textContent = "";
      try {
        await HerSafeAPI.login(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
        HerSafeToast(HerSafeI18n.t("auth.success_login"));
        redirectBack();
      } catch (err) {
        errorBox.textContent = err.message;
      }
    });

    registerForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById("register-error");
      errorBox.textContent = "";
      try {
        await HerSafeAPI.register(
          document.getElementById("register-name").value.trim(),
          document.getElementById("register-email").value.trim(),
          document.getElementById("register-password").value
        );
        HerSafeToast(HerSafeI18n.t("auth.success_register"));
        redirectBack();
      } catch (err) {
        errorBox.textContent = err.message;
      }
    });

    document.getElementById("continue-guest")?.addEventListener("click", redirectBack);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("login-form")) {
      initTabs();
      initForms();
    }
  });
})();

/**
 * Shared across every page: reflects signed-in state in the nav drawer
 * (injected by bottom-nav.js) once both scripts have loaded.
 */
(function () {
  function applyAuthState() {
    const signedIn = window.HerSafeAPI && HerSafeAPI.isUserAuthed();
    const user = signedIn ? HerSafeAPI.getStoredUser() : null;

    document.querySelectorAll("[data-auth-signed-out]").forEach((el) => (el.hidden = !!signedIn));
    document.querySelectorAll("[data-auth-signed-in]").forEach((el) => (el.hidden = !signedIn));
    document.querySelectorAll("[data-auth-name]").forEach((el) => {
      if (user) el.textContent = user.name;
    });

    document.querySelectorAll("[data-action='sign-out']").forEach((btn) => {
      btn.addEventListener("click", () => {
        HerSafeAPI.logout();
        window.location.reload();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Runs after bottom-nav.js injects the drawer (same DOMContentLoaded
    // tick, synchronous DOM work, so query selectors below will find it).
    setTimeout(applyAuthState, 0);
  });
})();
