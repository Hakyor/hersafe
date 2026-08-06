/**
 * HerSafe mobile navigation.
 * Injects a native-app-style bottom bar (Home / Map / + Report / Safety /
 * Profile) with a raised center FAB, plus a slide-out drawer for secondary
 * pages. Desktop keeps the existing top nav (hidden via CSS ≥860px).
 */
(function () {
  const page = document.body.getAttribute("data-page") || "";

  // Map each page to the bottom-nav tab it belongs under.
  const TAB_FOR_PAGE = {
    home: "home",
    map: "map",
    safety: "safety",
    "street-rating": "safety",
    "safe-route": "map",
    support: "safety",
    guide: "safety",
    report: "report",
  };
  const activeTab = TAB_FOR_PAGE[page] || "";

  function buildBottomNav() {
    const nav = document.createElement("nav");
    nav.className = "hs-bottom-nav";
    nav.setAttribute("aria-label", "Primary");
    nav.innerHTML = `
      <a class="hs-nav-item" href="index.html" data-tab="home" ${activeTab === "home" ? 'aria-current="page"' : ""}>
        <span class="hs-nav-icon" aria-hidden="true">🏠</span><span data-i18n="nav.home">Home</span>
      </a>
      <a class="hs-nav-item" href="map.html" data-tab="map" ${activeTab === "map" ? 'aria-current="page"' : ""}>
        <span class="hs-nav-icon" aria-hidden="true">🗺️</span><span data-i18n="nav.map">Map</span>
      </a>
      <a class="hs-nav-fab" href="report.html" data-i18n-aria-label="nav.report" aria-label="Report an incident">+</a>
      <a class="hs-nav-item" href="safety.html" data-tab="safety" ${activeTab === "safety" ? 'aria-current="page"' : ""}>
        <span class="hs-nav-icon" aria-hidden="true">🛡️</span><span data-i18n="nav.safety">Safety</span>
      </a>
      <button type="button" class="hs-nav-item" data-tab="profile" id="hs-profile-btn">
        <span class="hs-nav-icon" aria-hidden="true">☰</span><span data-i18n="nav.profile">Profile</span>
      </button>
    `;
    document.body.appendChild(nav);
    document.body.classList.add("hs-has-bottom-nav");
  }

  function buildDrawer() {
    const overlay = document.createElement("div");
    overlay.className = "hs-drawer-overlay";
    overlay.id = "hs-drawer-overlay";

    const drawer = document.createElement("div");
    drawer.className = "hs-drawer";
    drawer.id = "hs-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Menu");
    drawer.innerHTML = `
      <button class="icon-btn hs-drawer-close" id="hs-drawer-close" aria-label="Close menu">✕</button>
      <h2 data-i18n="nav.menu">Menu</h2>
      <a href="index.html" data-i18n="nav.home">Home</a>
      <a href="report.html" data-i18n="nav.report">Report Incident</a>
      <a href="map.html" data-i18n="nav.map">Safety Map</a>
      <a href="safety.html" data-i18n="nav.safety">Safety Hub</a>
      <a href="street-rating.html" data-i18n="nav.rate_street">Rate a Street</a>
      <a href="statistics.html" data-i18n="nav.statistics">Statistics</a>
      <a href="guide.html" data-i18n="nav.guide">Safety Guide</a>
      <a href="support.html" data-i18n="nav.support">After Harassment</a>
      <a href="about.html" data-i18n="nav.about">About</a>
      <a href="privacy.html" data-i18n="nav.privacy">Privacy Policy</a>
      <a href="terms.html" data-i18n="nav.terms">Terms</a>
      <a href="admin-login.html" data-i18n="nav.admin">Admin</a>
      <hr style="border-color:var(--border);margin:12px 0" />
      <button type="button" class="hs-drawer-action" data-action="toggle-lang" data-i18n="common.language">العربية</button>
      <button type="button" class="hs-drawer-action" data-action="toggle-theme">
        <span data-theme-icon>☀️</span> <span data-i18n="common.theme_light">Light</span> / <span data-i18n="common.theme_dark">Dark</span>
      </button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    function openDrawer() {
      overlay.classList.add("open");
      drawer.classList.add("open");
    }
    function closeDrawer() {
      overlay.classList.remove("open");
      drawer.classList.remove("open");
    }

    document.getElementById("hs-profile-btn")?.addEventListener("click", openDrawer);
    document.getElementById("hs-drawer-close")?.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);
    drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeDrawer));

    // Re-apply translations to the newly injected drawer/nav if i18n already ran.
    if (window.HERSAFE_DICT) {
      document.dispatchEvent(new CustomEvent("hersafe:i18n-ready", { detail: { dict: window.HERSAFE_DICT } }));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildBottomNav();
    buildDrawer();
    // If i18n runs after us, its own DOMContentLoaded listener will still
    // catch these new [data-i18n] nodes since it queries the whole document.
  });
})();
