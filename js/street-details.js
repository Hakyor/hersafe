/**
 * HerSafe — Street Details page.
 */
(function () {
  function scoreClass(score) {
    if (score >= 80 || score >= 60) return "score-good";
    if (score >= 40) return "score-caution";
    return "score-risk";
  }

  function getParams() {
    const params = new URLSearchParams(location.search);
    return { lat: parseFloat(params.get("lat")), lng: parseFloat(params.get("lng")) };
  }

  async function load() {
    const { lat, lng } = getParams();
    const emptyBox = document.getElementById("details-empty");
    const content = document.getElementById("details-content");

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      emptyBox.hidden = false;
      content.hidden = true;
      return;
    }

    document.getElementById("rate-this-street-link").href = `street-rating.html?lat=${lat}&lng=${lng}`;
    document.getElementById("rate-again-link").href = `street-rating.html?lat=${lat}&lng=${lng}`;

    try {
      const data = await HerSafeAPI.getStreetDetails(lat, lng);
      if (data.safety_score == null) {
        emptyBox.hidden = false;
        content.hidden = true;
        return;
      }
      emptyBox.hidden = true;
      content.hidden = false;

      const badge = document.getElementById("score-badge");
      badge.className = "safety-score-badge " + scoreClass(data.safety_score);
      document.getElementById("score-num").textContent = data.safety_score;
      document.getElementById("confidence-num").textContent = data.confidence != null ? `${data.confidence}%` : "—";
      document.getElementById("stat-reports").textContent = data.report_count;
      document.getElementById("stat-ratings").textContent = data.rating_count;
      document.getElementById("stat-lighting").textContent = data.lighting_score != null ? `${data.lighting_score}/100` : "—";
      document.getElementById("stat-camera").textContent = data.camera_score != null ? `${data.camera_score}/100` : "—";
      document.getElementById("stat-crowd").textContent = data.crowd_score != null ? `${data.crowd_score}/100` : "—";

      const nearby = document.getElementById("nearby-places");
      if (!data.nearby_safe_places.length) {
        nearby.innerHTML = `<p class="empty-state" style="grid-column:1/-1" data-i18n="street_details.no_places_nearby">No Safe Places recorded nearby yet.</p>`;
      } else {
        nearby.innerHTML = data.nearby_safe_places
          .map((p) => `<div class="card"><strong>${escapeHtml(p.name)}</strong><br><span class="category-chip">${HerSafeI18n.t("categories." + p.category) || p.category}</span></div>`)
          .join("");
      }

      initVerify(data.street_key);
    } catch (_) {
      emptyBox.hidden = false;
      content.hidden = true;
    }
  }

  function initVerify(streetKey) {
    const note = document.getElementById("verify-note");
    document.querySelectorAll("[data-verify]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!HerSafeAPI.isUserAuthed()) {
          note.textContent = HerSafeI18n.t("verification.sign_in_required");
          return;
        }
        try {
          const result = await HerSafeAPI.verifyRating(streetKey, btn.dataset.verify);
          note.textContent = HerSafeI18n.t("verification.thanks");
          document.getElementById("confidence-num").textContent = result.confidence != null ? `${result.confidence}%` : "—";
        } catch (err) {
          note.textContent = err.message;
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", load);
})();
