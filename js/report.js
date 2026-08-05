/**
 * HerSafe — Report Incident page.
 */
(function () {
  let picker = null;
  let marker = null;
  let selectedLat = null;
  let selectedLng = null;

  const DRIVE_LINK_RE = /^https:\/\/(drive|docs)\.google\.com\//i;

  // HerSafe currently serves Egypt only. Bounding box is intentionally a
  // little generous around the borders (includes Sinai and the Red Sea
  // coast) to avoid rejecting valid edge-of-country reports.
  const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 31.9, minLng: 24.5, maxLng: 37.0 };

  function isInEgypt(lat, lng) {
    return (
      lat >= EGYPT_BOUNDS.minLat &&
      lat <= EGYPT_BOUNDS.maxLat &&
      lng >= EGYPT_BOUNDS.minLng &&
      lng <= EGYPT_BOUNDS.maxLng
    );
  }

  function initMapPicker() {
    const el = document.getElementById("picker-map");
    if (!el || typeof L === "undefined") return;
    picker = L.map(el, { zoomControl: true }).setView([26.8, 30.8], 6); // Egypt center
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(picker);

    const egyptBounds = L.latLngBounds(
      [EGYPT_BOUNDS.minLat, EGYPT_BOUNDS.minLng],
      [EGYPT_BOUNDS.maxLat, EGYPT_BOUNDS.maxLng]
    );
    picker.setMaxBounds(egyptBounds.pad(0.15));
    picker.on("drag", () => picker.panInsideBounds(egyptBounds, { animate: false }));

    picker.on("click", (e) => setSelectedLocation(e.latlng.lat, e.latlng.lng));
  }

  function setSelectedLocation(lat, lng) {
    if (!isInEgypt(lat, lng)) {
      HerSafeToast(HerSafeI18n.t("report.error_outside_egypt"));
      return;
    }
    selectedLat = lat;
    selectedLng = lng;
    if (!picker) return;
    if (marker) picker.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(picker);
    picker.setView([lat, lng], 13);
    document.getElementById("field-lat").value = lat.toFixed(6);
    document.getElementById("field-lng").value = lng.toFixed(6);
  }

  function useGps() {
    if (!navigator.geolocation) {
      HerSafeToast(HerSafeI18n.t("report.error_location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isInEgypt(pos.coords.latitude, pos.coords.longitude)) {
          HerSafeToast(HerSafeI18n.t("report.error_outside_egypt"));
          return;
        }
        setSelectedLocation(pos.coords.latitude, pos.coords.longitude);
      },
      () => HerSafeToast(HerSafeI18n.t("report.error_location")),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function addEvidenceRow() {
    const wrap = document.getElementById("evidence-rows");
    const row = document.createElement("div");
    row.className = "evidence-row";
    row.innerHTML = `
      <select class="evidence-type" data-i18n-aria-label="report.evidence_type">
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
      </select>
      <input type="url" class="evidence-url" data-i18n-placeholder="report.evidence_url_placeholder" placeholder="https://drive.google.com/..." />
      <button type="button" class="icon-btn" data-remove-row aria-label="Remove">✕</button>
    `;
    wrap.appendChild(row);
    row.querySelector("[data-remove-row]").addEventListener("click", () => row.remove());
  }

  function collectEvidenceLinks() {
    const rows = document.querySelectorAll("#evidence-rows .evidence-row");
    const links = [];
    rows.forEach((row) => {
      const url = row.querySelector(".evidence-url").value.trim();
      const type = row.querySelector(".evidence-type").value;
      if (url) links.push({ type, url });
    });
    return links;
  }

  function validateEvidenceLinks(links) {
    for (const l of links) {
      if (!DRIVE_LINK_RE.test(l.url)) return false;
    }
    return true;
  }

  function sanitizeText(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');
    const errorBox = document.getElementById("form-error");
    errorBox.textContent = "";

    const evidenceLinks = collectEvidenceLinks();
    if (!validateEvidenceLinks(evidenceLinks)) {
      errorBox.textContent = "Evidence links must be Google Drive links.";
      return;
    }

    const lat = selectedLat ?? Number(document.getElementById("field-lat").value) ?? null;
    const lng = selectedLng ?? Number(document.getElementById("field-lng").value) ?? null;

    if (lat != null && lng != null && !isInEgypt(lat, lng)) {
      errorBox.textContent = HerSafeI18n.t("report.error_outside_egypt");
      return;
    }

    const payload = {
      incident_type: form.incident_type.value,
      description: sanitizeText(form.description.value.trim()).slice(0, 2000),
      date: form.date.value,
      time: form.time.value,
      latitude: lat,
      longitude: lng,
      city: form.city.value.trim().slice(0, 120),
      country: "Egypt",
      anonymous: form.anonymous.checked,
      evidence_links: evidenceLinks,
    };

    if (!payload.incident_type) {
      errorBox.textContent = HerSafeI18n.t("report.field_type");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = HerSafeI18n.t("report.submitting");

    try {
      await HerSafeAPI.submitReport(payload);
      document.getElementById("report-form-wrap").hidden = true;
      document.getElementById("report-success").hidden = false;
    } catch (err) {
      errorBox.textContent = HerSafeI18n.t("report.error_generic");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = HerSafeI18n.t("report.submit");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMapPicker();
    document.getElementById("use-gps")?.addEventListener("click", useGps);
    document.getElementById("add-evidence-link")?.addEventListener("click", addEvidenceRow);
    document.getElementById("report-form")?.addEventListener("submit", handleSubmit);
  });
})();
