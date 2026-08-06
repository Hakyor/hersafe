/**
 * HerSafe — Safety Hub page (safety.html): Safe Places list.
 */
(function () {
  const CATEGORY_ICON = {
    police: "👮", hospital: "🏥", pharmacy: "💊", safe_shop: "🛍️",
    university: "🎓", security_point: "🛡️", trusted_place: "📍",
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadPlaces() {
    const list = document.getElementById("safe-places-list");
    if (!list) return;
    const category = document.getElementById("safety-category-filter")?.value || "";
    try {
      const places = await HerSafeAPI.getSafePlaces(category ? `?category=${encodeURIComponent(category)}` : "");
      if (!places || !places.length) {
        list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🗺️</div>
          <p data-i18n="safe_places.empty">No Safe Places added yet.</p>
        </div>`;
        return;
      }
      list.innerHTML = places
        .map(
          (p) => `
        <div class="card">
          <div class="flex gap-8" style="align-items:center;margin-bottom:8px">
            <span style="font-size:1.4rem">${CATEGORY_ICON[p.category] || "📍"}</span>
            <strong>${escapeHtml(p.name)}</strong>
          </div>
          <span class="category-chip">${HerSafeI18n.t("categories." + p.category) || p.category}</span>
          ${p.description ? `<p style="margin-top:8px">${escapeHtml(p.description)}</p>` : ""}
          ${p.opening_hours ? `<p class="hint">🕒 ${escapeHtml(p.opening_hours)}</p>` : ""}
          ${p.phone_number ? `<p class="hint">📞 ${escapeHtml(p.phone_number)}</p>` : ""}
          <a class="btn btn-ghost btn-block" style="margin-top:8px" href="map.html">📍 ${HerSafeI18n.t("home.view_full_map")}</a>
        </div>`
        )
        .join("");
    } catch (_) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p data-i18n="safe_places.empty">No Safe Places added yet.</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadPlaces();
    document.getElementById("safety-category-filter")?.addEventListener("change", loadPlaces);
  });
})();
