/**
 * HerSafe — Suggest a Help Place page.
 */
(function () {
  const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 31.9, minLng: 24.5, maxLng: 37.0 };
  let picker = null;
  let marker = null;
  let selectedLat = null;
  let selectedLng = null;

  function isInEgypt(lat, lng) {
    return lat >= EGYPT_BOUNDS.minLat && lat <= EGYPT_BOUNDS.maxLat && lng >= EGYPT_BOUNDS.minLng && lng <= EGYPT_BOUNDS.maxLng;
  }

  function initMapPicker() {
    const el = document.getElementById("picker-map");
    if (!el || typeof L === "undefined") return;
    picker = L.map(el).setView([26.8, 30.8], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(picker);
    const egyptBounds = L.latLngBounds([EGYPT_BOUNDS.minLat, EGYPT_BOUNDS.minLng], [EGYPT_BOUNDS.maxLat, EGYPT_BOUNDS.maxLng]);
    picker.setMaxBounds(egyptBounds.pad(0.15));
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
    picker.setView([lat, lng], 14);
    document.getElementById("field-lat").value = lat.toFixed(6);
    document.getElementById("field-lng").value = lng.toFixed(6);
  }

  function useGps() {
    if (!navigator.geolocation) {
      HerSafeToast(HerSafeI18n.t("report.error_location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setSelectedLocation(pos.coords.latitude, pos.coords.longitude),
      () => HerSafeToast(HerSafeI18n.t("report.error_location")),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function resetForm() {
    document.getElementById("suggest-place-form")?.reset();
    if (marker && picker) { picker.removeLayer(marker); marker = null; }
    selectedLat = null;
    selectedLng = null;
    document.getElementById("suggest-success").hidden = true;
    document.getElementById("suggest-form-wrap").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const errorBox = document.getElementById("form-error");
    errorBox.textContent = "";

    if (!selectedLat || !selectedLng) {
      errorBox.textContent = HerSafeI18n.t("safe_places.pick_location");
      return;
    }

    const payload = {
      name: form.name.value.trim(),
      category: form.category.value,
      note: form.note.value.trim(),
      latitude: selectedLat,
      longitude: selectedLng,
    };

    if (!payload.name) {
      errorBox.textContent = HerSafeI18n.t("safe_places.field_name");
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    try {
      await HerSafeAPI.suggestHelpPlace(payload);
      document.getElementById("suggest-form-wrap").hidden = true;
      document.getElementById("suggest-success").hidden = false;
    } catch (err) {
      errorBox.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMapPicker();
    document.getElementById("use-gps")?.addEventListener("click", useGps);
    document.getElementById("suggest-place-form")?.addEventListener("submit", handleSubmit);
    document.getElementById("suggest-another")?.addEventListener("click", resetForm);
  });
})();
