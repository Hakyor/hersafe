/**
 * HerSafe header controls guarantee.
 * Several pages were hand-written without a language toggle in their
 * header (relying only on the mobile drawer, which is hidden on desktop
 * ≥860px). This fills in whatever's missing so every page works the same
 * way regardless of what its own HTML happens to contain.
 */
(function () {
  function ensureButton(container, selector, html, beforeSelector) {
    if (container.querySelector(selector)) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    const el = wrapper.firstElementChild;
    const beforeEl = beforeSelector ? container.querySelector(beforeSelector) : null;
    if (beforeEl) container.insertBefore(el, beforeEl);
    else container.appendChild(el);
  }

  function run() {
    document.querySelectorAll(".header-actions").forEach((actions) => {
      ensureButton(
        actions,
        "[data-action='toggle-theme']",
        `<button class="icon-btn" data-action="toggle-theme" aria-label="Toggle dark mode"><span data-theme-icon>☀️</span></button>`,
        ".nav-toggle"
      );
      ensureButton(
        actions,
        "[data-action='toggle-lang']",
        `<button class="icon-btn" data-action="toggle-lang" data-i18n="common.language" aria-label="Toggle language">العربية</button>`,
        ".nav-toggle"
      );
    });

    // Apply current translations to anything just injected.
    if (window.HERSAFE_DICT) {
      const dict = window.HERSAFE_DICT;
      const get = (obj, path) => path.split(".").reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj);
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const val = get(dict, el.getAttribute("data-i18n"));
        if (val != null) el.textContent = val;
      });
    }
    if (window.HerSafeTheme) window.HerSafeTheme.apply(window.HerSafeTheme.detect());
  }

  document.addEventListener("DOMContentLoaded", run);
})();
