/**
 * HerSafe theme controller — light/dark, persisted, respects system preference.
 */
(function () {
  const STORAGE_KEY = "hersafe:theme";

  function detect() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    document.querySelectorAll("[data-action='toggle-theme']").forEach((btn) => {
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      const icon = btn.querySelector("[data-theme-icon]");
      if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
    });
  }

  function toggle() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    apply(current === "dark" ? "light" : "dark");
  }

  window.HerSafeTheme = { apply, toggle, detect };

  apply(detect());

  // Event delegation: works for buttons injected later (drawer, header
  // chip) regardless of script load order — same reasoning as i18n.js.
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='toggle-theme']")) toggle();
  });
})();
