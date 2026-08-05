/**
 * HerSafe — Safety Map page.
 * Markers reflect aggregated, anonymous report density per area only.
 */
(function () {
  let map = null;
  let markersLayer = null;

  function colorFor(count) {
    if (count >= 10) return "var(--status-risk)".includes("var") ? "#c0392b" : "#c0392b";
    if (count >= 4) return "#d9a531";
    return "#3f9142";
  }

  function radiusFor(count) {
    return Math.min(10 + count * 1.5, 34);
  }

  // HerSafe currently serves Egypt only.
  const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 31.9, minLng: 24.5, maxLng: 37.0 };

  function initMap() {
    const el = document.getElementById("map");
    if (!el || typeof L === "undefined") return;
    map = L.map(el).setView([26.8, 30.8], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    const egyptBounds = L.latLngBounds(
      [EGYPT_BOUNDS.minLat, EGYPT_BOUNDS.minLng],
      [EGYPT_BOUNDS.maxLat, EGYPT_BOUNDS.maxLng]
    );
    map.setMaxBounds(egyptBounds.pad(0.15));
    map.setMinZoom(5);
    markersLayer = L.layerGroup().addTo(map);
  }

  function renderMarkers(points) {
    markersLayer.clearLayers();
    points.forEach((p) => {
      const circle = L.circleMarker([p.latitude, p.longitude], {
        radius: radiusFor(p.count),
        color: colorFor(p.count),
        fillColor: colorFor(p.count),
        fillOpacity: 0.55,
        weight: 1,
      });
      circle.bindPopup(
        `<strong>${p.city || ""}</strong><br>${HerSafeI18n.t("map.reports_count").replace("{count}", p.count)}`
      );
      circle.addTo(markersLayer);
    });
  }

  async function loadData() {
    const typeFilter = document.getElementById("filter-type")?.value || "";
    const periodFilter = document.getElementById("filter-period")?.value || "all";
    const query = `?type=${encodeURIComponent(typeFilter)}&period=${encodeURIComponent(periodFilter)}`;
    try {
      const data = await HerSafeAPI.getMapData(query);
      renderMarkers(Array.isArray(data) ? data : []);
    } catch (_) {
      renderMarkers([]);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadData();
    document.getElementById("filter-type")?.addEventListener("change", loadData);
    document.getElementById("filter-period")?.addEventListener("change", loadData);
  });
})();
