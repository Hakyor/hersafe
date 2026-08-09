/**
 * HerSafe shared behavior (all pages) + home page dynamic sections.
 */
(function () {
  function initNav() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".site-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));

    const current = document.body.getAttribute("data-page");
    if (current) {
      const link = nav.querySelector(`a[data-page="${current}"]`);
      if (link) link.setAttribute("aria-current", "page");
    }
  }

  // Toast function now lives in js/toast.js (loaded on every page) so it's
  // always available regardless of which other scripts a page includes.

  async function loadHomeStats() {
    const el = document.querySelector("[data-home-stats]");
    if (!el) return;
    try {
      const stats = await HerSafeAPI.getStatistics("?summary=1");
      el.querySelector("[data-stat-reports]").textContent = stats.total_reports ?? "—";
      el.querySelector("[data-stat-areas]").textContent = stats.total_areas ?? "—";
      el.querySelector("[data-stat-countries]").textContent = stats.total_countries ?? "—";
    } catch (_) {
      // Leave placeholder dashes if the API isn't reachable yet.
    }
  }

  async function loadRecentReports() {
    const list = document.querySelector("[data-recent-reports]");
    if (!list) return;
    try {
      const reports = await HerSafeAPI.getReports("?limit=5");
      if (!Array.isArray(reports) || reports.length === 0) {
        list.innerHTML = `<li class="report-item">${HerSafeI18n.t("home.recent_empty")}</li>`;
        return;
      }
      list.innerHTML = reports
        .map(
          (r) => `
        <li class="report-item">
          <span class="report-tag">${HerSafeI18n.t("incident_types." + r.incident_type) || r.incident_type}</span>
          <span class="report-meta">${r.city || ""} · ${new Date(r.created_at).toLocaleDateString()}</span>
        </li>`
        )
        .join("");
    } catch (_) {
      list.innerHTML = `<li class="report-item">${HerSafeI18n.t("home.recent_empty")}</li>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    loadHomeStats();
    loadRecentReports();
  });
})();
