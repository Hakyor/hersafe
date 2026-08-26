/**
 * HerSafe — Campaigns page (public list).
 */
(function () {
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  async function load() {
    const list = document.getElementById("campaigns-list");
    if (!list) return;
    try {
      const campaigns = await HerSafeAPI.getCampaigns();
      if (!campaigns.length) {
        list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p data-i18n="campaigns.empty">No active campaigns right now.</p></div>`;
        return;
      }
      list.innerHTML = campaigns
        .map(
          (c) => `
        <div class="card">
          <h3>${escapeHtml(c.title)}</h3>
          ${c.platform ? `<span class="category-chip">${escapeHtml(c.platform)}</span>` : ""}
          <p style="margin-top:8px">${escapeHtml(c.description)}</p>
          ${c.instructions ? `<p class="hint" style="margin-top:6px">${escapeHtml(c.instructions)}</p>` : ""}
          ${
            c.official_report_url
              ? `<a class="btn btn-primary btn-block" style="margin-top:10px" href="${escapeHtml(c.official_report_url)}" target="_blank" rel="noopener">${HerSafeI18n.t("campaigns.official_link")}</a>`
              : ""
          }
        </div>`
        )
        .join("");
    } catch (_) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p data-i18n="campaigns.empty">No active campaigns right now.</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
