/**
 * HerSafe — Safety Map page.
 * Layers: aggregated incident density, Safe Places, Street Ratings,
 * Community Alerts, and an optional Safer Route planner.
 */
(function () {
  let map = null;
  let incidentLayer = null;
  let safePlacesLayer = null;
  let streetRatingsLayer = null;
  let alertsLayer = null;
  let routeLayer = null;

  const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 31.9, minLng: 24.5, maxLng: 37.0 };

  const CATEGORY_COLOR = {
    police: "#1b4fd9",
    hospital: "#c0392b",
    pharmacy: "#3f9142",
    safe_shop: "#d9a24b",
    university: "#7b4fd9",
    security_point: "#0e3d37",
    trusted_place: "#4fa696",
  };
  const CATEGORY_ICON = {
    police: "👮", hospital: "🏥", pharmacy: "💊", safe_shop: "🛍️",
    university: "🎓", security_point: "🛡️", trusted_place: "📍",
  };

  function colorFor(count) { return count >= 10 ? "#c0392b" : count >= 4 ? "#d9a531" : "#3f9142"; }
  function radiusFor(count) { return Math.min(10 + count * 1.5, 34); }

  function scoreColor(score) {
    if (score >= 80) return "#3f9142";
    if (score >= 60) return "#8ab13f";
    if (score >= 40) return "#d9a531";
    return "#c0392b";
  }

  function initMap() {
    const el = document.getElementById("map");
    if (!el || typeof L === "undefined") return;
    map = L.map(el).setView([26.8, 30.8], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const egyptBounds = L.latLngBounds([EGYPT_BOUNDS.minLat, EGYPT_BOUNDS.minLng], [EGYPT_BOUNDS.maxLat, EGYPT_BOUNDS.maxLng]);
    map.setMaxBounds(egyptBounds.pad(0.15));
    map.setMinZoom(5);

    incidentLayer = L.layerGroup().addTo(map);
    safePlacesLayer = L.layerGroup();
    streetRatingsLayer = L.layerGroup();
    alertsLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }

  // ---------------- Incident density (existing feature) ----------------
  async function loadIncidents() {
    const typeFilter = document.getElementById("filter-type")?.value || "";
    const periodFilter = document.getElementById("filter-period")?.value || "all";
    const query = `?type=${encodeURIComponent(typeFilter)}&period=${encodeURIComponent(periodFilter)}`;
    try {
      const data = await HerSafeAPI.getMapData(query);
      incidentLayer.clearLayers();
      (Array.isArray(data) ? data : []).forEach((p) => {
        L.circleMarker([p.latitude, p.longitude], {
          radius: radiusFor(p.count), color: colorFor(p.count), fillColor: colorFor(p.count),
          fillOpacity: 0.5, weight: 1,
        })
          .bindPopup(`<strong>${p.city || ""}</strong><br>${HerSafeI18n.t("map.reports_count").replace("{count}", p.count)}`)
          .addTo(incidentLayer);
      });
    } catch (_) { /* leave layer empty */ }
  }

  // ---------------- Safe Places ----------------
  function safePlaceIcon(category) {
    return L.divIcon({
      className: "hs-safeplace-icon",
      html: `<div style="background:${CATEGORY_COLOR[category] || "#333"};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);">
               <span style="transform:rotate(45deg);font-size:14px;">${CATEGORY_ICON[category] || "📍"}</span>
             </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
    });
  }

  async function loadSafePlaces() {
    const category = document.getElementById("filter-place-category")?.value || "";
    try {
      const places = await HerSafeAPI.getSafePlaces(category ? `?category=${encodeURIComponent(category)}` : "");
      safePlacesLayer.clearLayers();
      (places || []).forEach((p) => {
        const popup = `
          <strong>${escapeHtml(p.name)}</strong><br>
          <span class="category-chip">${HerSafeI18n.t("categories." + p.category) || p.category}</span><br>
          ${p.description ? `<p style="margin:6px 0">${escapeHtml(p.description)}</p>` : ""}
          ${p.opening_hours ? `🕒 ${escapeHtml(p.opening_hours)}<br>` : ""}
          ${p.phone_number ? `📞 ${escapeHtml(p.phone_number)}<br>` : ""}
          ${p.safety_notes ? `<em>${escapeHtml(p.safety_notes)}</em>` : ""}
        `;
        L.marker([p.latitude, p.longitude], { icon: safePlaceIcon(p.category) }).bindPopup(popup).addTo(safePlacesLayer);
      });
    } catch (_) { /* leave layer empty */ }
  }

  // ---------------- Street Ratings ----------------
  async function loadStreetRatings() {
    try {
      const streets = await HerSafeAPI.getStreetRatings();
      streetRatingsLayer.clearLayers();
      (streets || []).forEach((s) => {
        const marker = L.circleMarker([s.latitude, s.longitude], {
          radius: 10, color: scoreColor(s.score), fillColor: scoreColor(s.score), fillOpacity: 0.85, weight: 2,
        });
        marker.bindPopup(`
          <strong>${s.score}/100</strong> — ${HerSafeI18n.t("street_rating.score_" + s.label) || s.label}<br>
          ${s.city || ""} · ${s.count}<br>
          <a href="street-details.html?lat=${s.latitude}&lng=${s.longitude}">${HerSafeI18n.t("street_details.title")}</a> ·
          <a href="street-rating.html?lat=${s.latitude}&lng=${s.longitude}">${HerSafeI18n.t("nav.rate_street")}</a>
        `);
        marker.addTo(streetRatingsLayer);
      });
    } catch (_) { /* leave layer empty */ }
  }

  // ---------------- Community Alerts ----------------
  async function loadAlerts() {
    const banner = document.getElementById("alert-banner");
    try {
      const alerts = await HerSafeAPI.getCommunityAlerts();
      alertsLayer.clearLayers();
      (alerts || []).forEach((a) => {
        L.circle([a.latitude, a.longitude], {
          radius: 400,
          color: a.severity === "elevated" ? "#c0392b" : "#d9a531",
          fillOpacity: 0.08,
          dashArray: "6 6",
        })
          .bindPopup(a.severity === "elevated" ? HerSafeI18n.t("alerts.elevated_text") : HerSafeI18n.t("alerts.banner_text"))
          .addTo(alertsLayer);
      });
      if (banner) banner.hidden = !alerts.length;
    } catch (_) {
      if (banner) banner.hidden = true;
    }
  }

  // ---------------- Layer toggles ----------------
  function initLayerToggles() {
    document.getElementById("toggle-safe-places")?.addEventListener("change", (e) => {
      if (e.target.checked) { safePlacesLayer.addTo(map); loadSafePlaces(); }
      else map.removeLayer(safePlacesLayer);
    });
    document.getElementById("toggle-street-ratings")?.addEventListener("change", (e) => {
      if (e.target.checked) { streetRatingsLayer.addTo(map); loadStreetRatings(); }
      else map.removeLayer(streetRatingsLayer);
    });
    document.getElementById("filter-place-category")?.addEventListener("change", loadSafePlaces);
  }

  // ---------------- Safer Route planner ----------------
  let routeStart = null;
  let routeEnd = null;
  let routePickMode = null; // 'start' | 'end' | null
  let routeMode = "shortest";

  function initRoutePlanner() {
    const startBtn = document.getElementById("route-set-start");
    const endBtn = document.getElementById("route-set-end");
    const findBtn = document.getElementById("route-find");
    const modeButtons = document.querySelectorAll("[data-route-mode]");
    if (!startBtn || !map) return;

    startBtn.addEventListener("click", () => { routePickMode = "start"; HerSafeToast(HerSafeI18n.t("route.set_start")); });
    endBtn.addEventListener("click", () => { routePickMode = "end"; HerSafeToast(HerSafeI18n.t("route.set_end")); });

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        routeMode = btn.dataset.routeMode;
        modeButtons.forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      });
    });

    map.on("click", (e) => {
      if (!routePickMode) return;
      const { lat, lng } = e.latlng;
      if (lat < EGYPT_BOUNDS.minLat || lat > EGYPT_BOUNDS.maxLat || lng < EGYPT_BOUNDS.minLng || lng > EGYPT_BOUNDS.maxLng) {
        HerSafeToast(HerSafeI18n.t("route.outside_egypt"));
        return;
      }
      if (routePickMode === "start") {
        routeStart = { lat, lng };
        startBtn.textContent = `${HerSafeI18n.t("route.start_label")}: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      } else {
        routeEnd = { lat, lng };
        endBtn.textContent = `${HerSafeI18n.t("route.end_label")}: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      }
      routePickMode = null;
    });

    findBtn?.addEventListener("click", findRoute);
  }

  async function findRoute() {
    const resultBox = document.getElementById("route-result");
    if (!routeStart || !routeEnd) {
      HerSafeToast(HerSafeI18n.t("route.error"));
      return;
    }
    resultBox.textContent = HerSafeI18n.t("route.finding");
    resultBox.hidden = false;

    const query = `?start_lat=${routeStart.lat}&start_lng=${routeStart.lng}&end_lat=${routeEnd.lat}&end_lng=${routeEnd.lng}&mode=${routeMode}`;
    try {
      const result = await HerSafeAPI.getSaferRoute(query);
      routeLayer.clearLayers();
      if (result.geometry && result.geometry.coordinates) {
        const latlngs = result.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const line = L.polyline(latlngs, { color: routeMode === "safer" ? "#1b6e62" : "#d9a24b", weight: 5, opacity: 0.85 });
        line.addTo(routeLayer);
        map.fitBounds(line.getBounds(), { padding: [30, 30] });
      }
      const km = (result.distance_meters / 1000).toFixed(1);
      const mins = Math.round(result.duration_seconds / 60);
      let html = `${HerSafeI18n.t("route.distance")}: ${km} km · ${HerSafeI18n.t("route.duration")}: ${mins} min`;
      if (result.safety) html += `<br>${HerSafeI18n.t("route.safety_score")}: ${result.safety.score}/100`;
      resultBox.innerHTML = html;
    } catch (err) {
      resultBox.textContent = err.message || HerSafeI18n.t("route.error");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadIncidents();
    loadAlerts();
    initLayerToggles();
    initRoutePlanner();
    document.getElementById("filter-type")?.addEventListener("change", loadIncidents);
    document.getElementById("filter-period")?.addEventListener("change", loadIncidents);
  });
})();
