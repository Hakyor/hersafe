/**
 * HerSafe — Street Rating page.
 */
(function () {
  const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 31.9, minLng: 24.5, maxLng: 37.0 };
  const DIMENSIONS = ["lighting", "crowd_level", "security_presence", "camera_coverage", "public_transport", "general_feeling"];

  let picker = null;
  let marker = null;
  let selected = null;
  const values = {};

  function isInEgypt(lat, lng) {
    return lat >= EGYPT_BOUNDS.minLat && lat <= EGYPT_BOUNDS.maxLat && lng >= EGYPT_BOUNDS.minLng && lng <= EGYPT_BOUNDS.maxLng;
  }

  function buildStarFields() {
    const wrap = document.getElementById("rating-fields");
    wrap.innerHTML = DIMENSIONS.map(
      (dim) => `
      <div class="rating-row">
        <label data-i18n="street_rating.${dim}">${dim}</label>
        <div class="star-rating" data-dim="${dim}">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-value="${n}" aria-label="${n}">★</button>`).join("")}
        </div>
      </div>`
    ).join("");

    wrap.querySelectorAll(".star-rating").forEach((group) => {
      const dim = group.dataset.dim;
      group.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = Number(btn.dataset.value);
          values[dim] = val;
          group.querySelectorAll("button").forEach((b) => b.classList.toggle("filled", Number(b.dataset.value) <= val));
        });
      });
    });
  }

  function initMapPicker() {
    const el = document.getElementById("rating-picker-map");
    if (!el || typeof L === "undefined") return;
    picker = L.map(el).setView([26.8, 30.8], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(picker);
    const egyptBounds = L.latLngBounds([EGYPT_BOUNDS.minLat, EGYPT_BOUNDS.minLng], [EGYPT_BOUNDS.maxLat, EGYPT_BOUNDS.maxLng]);
    picker.setMaxBounds(egyptBounds.pad(0.15));
    picker.on("click", (e) => setLocation(e.latlng.lat, e.latlng.lng));

    const params = new URLSearchParams(location.search);
    const qLat = parseFloat(params.get("lat"));
    const qLng = parseFloat(params.get("lng"));
    if (Number.isFinite(qLat) && Number.isFinite(qLng)) setLocation(qLat, qLng);
  }

  function setLocation(lat, lng) {
    if (!isInEgypt(lat, lng)) {
      HerSafeToast(HerSafeI18n.t("report.error_outside_egypt"));
      return;
    }
    selected = { lat, lng };
    if (marker) picker.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(picker);
    picker.setView([lat, lng], 15);
    loadScorePreview(lat, lng);
  }

  function scoreClass(score) {
    if (score >= 80) return "score-good";
    if (score >= 60) return "score-good";
    if (score >= 40) return "score-caution";
    return "score-risk";
  }

  async function loadScorePreview(lat, lng) {
    const box = document.getElementById("street-score-preview");
    const historyBox = document.getElementById("rating-history");
    try {
      const data = await HerSafeAPI.getStreetRatings(`?lat=${lat}&lng=${lng}`);
      if (data.score == null) {
        box.hidden = true;
        historyBox.innerHTML = `<p class="empty-state" data-i18n="street_rating.no_ratings">No ratings yet for this street. Be the first.</p>`;
        return;
      }
      box.hidden = false;
      const badge = document.getElementById("score-badge");
      badge.className = "safety-score-badge " + scoreClass(data.score);
      document.getElementById("score-num").textContent = data.score;
      document.getElementById("score-label").textContent = HerSafeI18n.t("street_rating.score_" + data.label);
      document.getElementById("score-count").textContent = `${data.count} ratings`;

      historyBox.innerHTML = (data.history || [])
        .slice(0, 10)
        .map(
          (h) => `<div class="report-item">
            <span class="report-tag">${h.score}/100</span>
            <span class="report-meta">${new Date(h.created_at).toLocaleDateString()}</span>
            ${h.comment ? `<p style="margin-top:6px">${escapeHtml(h.comment)}</p>` : ""}
          </div>`
        )
        .join("") || `<p class="empty-state" data-i18n="street_rating.no_ratings">No ratings yet for this street. Be the first.</p>`;
    } catch (_) {
      box.hidden = true;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errorBox = document.getElementById("rating-error");
    errorBox.textContent = "";

    if (!selected) {
      errorBox.textContent = HerSafeI18n.t("street_rating.select_location_first");
      return;
    }
    for (const dim of DIMENSIONS) {
      if (!values[dim]) {
        errorBox.textContent = HerSafeI18n.t("street_rating.select_location_first");
        return;
      }
    }

    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    const payload = {
      latitude: selected.lat,
      longitude: selected.lng,
      comment: form.comment.value.trim().slice(0, 500),
      ...values,
    };

    try {
      await HerSafeAPI.submitStreetRating(payload);
      HerSafeToast(HerSafeI18n.t("street_rating.success"));
      loadScorePreview(selected.lat, selected.lng);
      form.reset();
      document.querySelectorAll(".star-rating button").forEach((b) => b.classList.remove("filled"));
      Object.keys(values).forEach((k) => delete values[k]);
    } catch (err) {
      errorBox.textContent = err.status === 429 ? HerSafeI18n.t("street_rating.already_rated") : err.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildStarFields();
    initMapPicker();
    document.getElementById("street-rating-form")?.addEventListener("submit", handleSubmit);
  });
})();
