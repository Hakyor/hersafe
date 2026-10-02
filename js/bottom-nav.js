/**
 * HerSafe navigation — single source of truth for both breakpoints.
 *
 * Desktop (>=860px): fills the existing <nav class="site-nav"> in each
 * page's header with a grouped nav (direct links + two dropdown groups),
 * so every feature has a real, visible path instead of only living in the
 * mobile drawer or a card buried inside another page.
 *
 * Mobile (<860px): a bottom tab bar (Home/Map/+Report/Safety/Profile) plus
 * a slide-out drawer — opened from the header hamburger — organized into
 * labeled sections (Community / Safety Resources / More) instead of one
 * long flat list, so features are scannable instead of buried.
 *
 * Icons come from js/icons.js (HerSafeIcons) — no emoji anywhere.
 */
(function () {
  const page = document.body.getAttribute("data-page") || "";
  const ic = (name, size) => (window.HerSafeIcons ? HerSafeIcons.get(name, size) : "");

  const TAB_FOR_PAGE = {
    home: "home",
    map: "map",
    safety: "safety",
    "street-rating": "safety",
    "street-details": "safety",
    "suggest-help-place": "safety",
    "online-safety": "safety",
    campaigns: "safety",
    "safe-route": "map",
    support: "safety",
    guide: "safety",
    report: "report",
  };
  const activeTab = TAB_FOR_PAGE[page] || "";

  // ---------------------------------------------------------------------
  // Bottom tab bar (mobile)
  // ---------------------------------------------------------------------
  function buildBottomNav() {
    if (document.querySelector(".hs-bottom-nav")) return;
    const signedIn = window.HerSafeAPI && HerSafeAPI.isUserAuthed();
    const profileHref = signedIn ? "profile.html" : "auth.html";
    const profileIcon = ic(signedIn ? "person" : "key", 22);

    const nav = document.createElement("nav");
    nav.className = "hs-bottom-nav";
    nav.setAttribute("aria-label", "Primary");
    nav.innerHTML = `
      <a class="hs-nav-item" href="index.html" data-tab="home" ${activeTab === "home" ? 'aria-current="page"' : ""}>
        <span class="hs-nav-icon" aria-hidden="true">${ic("home", 22)}</span><span data-i18n="nav.home">Home</span>
      </a>
      <a class="hs-nav-item" href="map.html" data-tab="map" ${activeTab === "map" ? 'aria-current="page"' : ""}>
        <span class="hs-nav-icon" aria-hidden="true">${ic("map", 22)}</span><span data-i18n="nav.map">Map</span>
      </a>
      <a class="hs-nav-fab" href="report.html" data-i18n-aria-label="nav.report" aria-label="Report an incident">${ic("plus", 26)}</a>
      <a class="hs-nav-item" href="safety.html" data-tab="safety" ${activeTab === "safety" ? 'aria-current="page"' : ""}>
        <span class="hs-nav-icon" aria-hidden="true">${ic("shield", 22)}</span><span data-i18n="nav.safety">Safety</span>
      </a>
      <a class="hs-nav-item" href="${profileHref}" id="hs-profile-btn">
        <span class="hs-nav-icon" aria-hidden="true">${profileIcon}</span><span data-i18n="${signedIn ? "nav.profile_page" : "auth.sign_in"}">${signedIn ? "Profile" : "Sign In"}</span>
      </a>
    `;
    document.body.appendChild(nav);
    document.body.classList.add("hs-has-bottom-nav");
  }

  // ---------------------------------------------------------------------
  // Mobile drawer — grouped so features are scannable, not a wall of links
  // ---------------------------------------------------------------------
  function buildDrawer() {
    if (document.getElementById("hs-drawer")) return;
    const overlay = document.createElement("div");
    overlay.className = "hs-drawer-overlay";
    overlay.id = "hs-drawer-overlay";

    const drawer = document.createElement("div");
    drawer.className = "hs-drawer";
    drawer.id = "hs-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Menu");
    drawer.innerHTML = `
      <button class="icon-btn hs-drawer-close" id="hs-drawer-close" aria-label="Close menu">${ic("close", 18)}</button>
      <h2 data-i18n="nav.menu">Menu</h2>

      <div data-auth-signed-out style="margin-bottom:16px">
        <a href="auth.html" class="btn btn-primary btn-block" data-i18n="auth.sign_in">Sign In</a>
        <p class="hint center" style="margin-top:8px" data-i18n="auth.guest_note">You don't need an account to report incidents or rate streets — accounts just add a profile, points, and badges on top.</p>
      </div>
      <div data-auth-signed-in hidden style="padding:8px;margin-bottom:16px;border-bottom:1px solid var(--border)">
        <strong data-i18n="auth.signed_in_as">Signed in as</strong> <span data-auth-name></span>
        <a href="profile.html" class="btn btn-ghost btn-block" style="margin-top:8px" data-i18n="nav.profile_page">My Profile</a>
      </div>

      <span class="hs-drawer-section-label" data-i18n="nav.section_explore">Explore</span>
      <a href="index.html" data-i18n="nav.home">Home</a>
      <a href="report.html" data-i18n="nav.report">Report Incident</a>
      <a href="map.html" data-i18n="nav.map">Safety Map</a>
      <a href="safety.html" data-i18n="nav.safety">Safety Hub</a>

      <span class="hs-drawer-section-label" data-i18n="nav.section_community">Community</span>
      <a href="street-rating.html" data-i18n="nav.rate_street">Rate a Street</a>
      <a href="suggest-help-place.html" data-i18n="nav.suggest_place">Suggest a Help Place</a>
      <a href="leaderboard.html" data-i18n="nav.leaderboard">Leaderboard</a>
      <a href="statistics.html" data-i18n="nav.statistics">Statistics</a>

      <span class="hs-drawer-section-label" data-i18n="nav.section_resources">Safety Resources</span>
      <a href="guide.html" data-i18n="nav.guide">Safety Guide</a>
      <a href="support.html" data-i18n="nav.support">After Harassment</a>
      <a href="online-safety.html" data-i18n="nav.online_safety">Online Safety</a>
      <a href="campaigns.html" data-i18n="nav.campaigns">Campaigns</a>

      <span class="hs-drawer-section-label" data-i18n="nav.section_more">More</span>
      <a href="about.html" data-i18n="nav.about">About</a>
      <a href="contact.html" data-i18n="nav.contact">Contact</a>
      <a href="notifications.html" data-auth-signed-in hidden data-i18n="notifications.title">Notifications</a>

      <hr style="border-color:var(--border);margin:12px 0" />
      <button type="button" class="hs-drawer-action" data-action="sign-out" data-auth-signed-in hidden data-i18n="auth.sign_out">Sign out</button>
      <button type="button" class="hs-drawer-action" data-action="toggle-lang" data-i18n="common.language">العربية</button>
      <button type="button" class="hs-drawer-action" data-action="toggle-theme">
        <span data-theme-icon></span> <span data-i18n="common.theme_light">Light</span> / <span data-i18n="common.theme_dark">Dark</span>
      </button>

      <div class="hs-drawer-muted" style="margin-top:16px;display:flex;flex-direction:column">
        <a href="privacy.html" data-i18n="nav.privacy">Privacy Policy</a>
        <a href="terms.html" data-i18n="nav.terms">Terms</a>
        <a href="admin-login.html" data-i18n="nav.admin">Admin</a>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    if (window.HERSAFE_DICT) {
      document.dispatchEvent(new CustomEvent("hersafe:i18n-ready", { detail: { dict: window.HERSAFE_DICT } }));
    }
    if (window.HerSafeTheme) window.HerSafeTheme.apply(document.documentElement.getAttribute("data-theme") || window.HerSafeTheme.detect());
  }

  // ---------------------------------------------------------------------
  // Desktop nav — direct links + two dropdown groups, so every feature is
  // one click away instead of hidden in the mobile drawer only.
  // ---------------------------------------------------------------------
  function buildDesktopNav() {
    const nav = document.querySelector(".site-nav");
    if (!nav || nav.dataset.hsBuilt) return;
    nav.dataset.hsBuilt = "1";

    function link(href, i18nKey, label) {
      const current = href.replace(".html", "") === page || (page === "home" && href === "index.html");
      return `<li><a href="${href}" data-i18n="${i18nKey}" ${current ? 'aria-current="page"' : ""}>${label}</a></li>`;
    }

    function group(id, i18nKey, label, items) {
      const hasCurrent = items.some((it) => it.href.replace(".html", "") === page);
      return `
        <li class="nav-group" data-nav-group="${id}">
          <span class="nav-group-label" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">
            <span data-i18n="${i18nKey}" ${hasCurrent ? 'style="color:var(--primary)"' : ""}>${label}</span>
            <span class="caret" aria-hidden="true">${ic("arrow", 12)}</span>
          </span>
          <ul class="nav-group-menu" role="menu">
            ${items
              .map(
                (it) =>
                  `<li><a href="${it.href}" data-i18n="${it.i18nKey}" ${it.href.replace(".html", "") === page ? 'aria-current="page"' : ""}>${it.label}</a></li>`
              )
              .join("")}
          </ul>
        </li>
      `;
    }

    nav.innerHTML = `
      <ul>
        ${link("index.html", "nav.home", "Home")}
        ${link("report.html", "nav.report", "Report Incident")}
        ${link("map.html", "nav.map", "Safety Map")}
        ${link("safety.html", "nav.safety", "Safety")}
        ${group("community", "nav.section_community", "Community", [
          { href: "street-rating.html", i18nKey: "nav.rate_street", label: "Rate a Street" },
          { href: "suggest-help-place.html", i18nKey: "nav.suggest_place", label: "Suggest a Help Place" },
          { href: "leaderboard.html", i18nKey: "nav.leaderboard", label: "Leaderboard" },
          { href: "statistics.html", i18nKey: "nav.statistics", label: "Statistics" },
        ])}
        ${group("resources", "nav.section_resources", "Safety Resources", [
          { href: "guide.html", i18nKey: "nav.guide", label: "Safety Guide" },
          { href: "support.html", i18nKey: "nav.support", label: "After Harassment" },
          { href: "online-safety.html", i18nKey: "nav.online_safety", label: "Online Safety" },
          { href: "campaigns.html", i18nKey: "nav.campaigns", label: "Campaigns" },
        ])}
        ${link("about.html", "nav.about", "About")}
        ${link("contact.html", "nav.contact", "Contact")}
      </ul>
    `;
  }

  // ---------------------------------------------------------------------
  // Event delegation for everything: bottom-nav profile link, drawer
  // open/close, and desktop dropdown groups (click AND keyboard).
  // ---------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const overlay = document.getElementById("hs-drawer-overlay");
    const drawer = document.getElementById("hs-drawer");

    if (overlay && drawer) {
      if (e.target.closest(".nav-toggle")) {
        overlay.classList.add("open");
        drawer.classList.add("open");
        document.querySelectorAll(".nav-toggle").forEach((btn) => btn.setAttribute("aria-expanded", "true"));
        return;
      }
      if (e.target.closest("#hs-drawer-close") || e.target === overlay || e.target.closest("#hs-drawer a")) {
        overlay.classList.remove("open");
        drawer.classList.remove("open");
        document.querySelectorAll(".nav-toggle").forEach((btn) => btn.setAttribute("aria-expanded", "false"));
      }
    }

    const groupLabel = e.target.closest(".nav-group-label");
    document.querySelectorAll(".nav-group.open").forEach((g) => {
      if (!groupLabel || g !== groupLabel.closest(".nav-group")) {
        g.classList.remove("open");
        g.querySelector(".nav-group-label")?.setAttribute("aria-expanded", "false");
      }
    });
    if (groupLabel) {
      const g = groupLabel.closest(".nav-group");
      const isOpen = g.classList.toggle("open");
      groupLabel.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const label = e.target.closest(".nav-group-label");
      if (label) {
        e.preventDefault();
        label.click();
      }
    }
    if (e.key === "Escape") {
      document.querySelectorAll(".nav-group.open").forEach((g) => g.classList.remove("open"));
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    buildBottomNav();
    buildDrawer();
    buildDesktopNav();
  });
})();
