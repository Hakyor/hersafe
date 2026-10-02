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
    police: "#372937",
    hospital: "#be4a4f",
    pharmacy: "#7a9b78",
    safe_shop: "#e1a49a",
    university: "#b8acc9",
    security_point: "#92333c",
    trusted_place: "#c9a227",
  };
  const ICON_STROKE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">%PATH%</svg>';
  const CATEGORY_ICON = {
    police: ICON_STROKE.replace("%PATH%", '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>'),
    hospital: ICON_STROKE.replace("%PATH%", '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>'),
    pharmacy: ICON_STROKE.replace("%PATH%", '<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-30 12 12)"/><path d="M9.5 8.5l5 7"/>'),
    safe_shop: ICON_STROKE.replace("%PATH%", '<path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/>'),
    university: ICON_STROKE.replace("%PATH%", '<path d="M2 9 12 4l10 5-10 5-10-5Z"/><path d="M6 11.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.5"/>'),
    security_point: ICON_STROKE.replace("%PATH%", '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/>'),
    trusted_place: ICON_STROKE.replace("%PATH%", '<path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/>'),
  };

  function colorFor(count) { return count >= 10 ? "#be4a4f" : count >= 4 ? "#c9a227" : "#7a9b78"; }
  function radiusFor(count) { return Math.min(10 + count * 1.5, 34); }

  function scoreColor(score) {
    if (score >= 80) return "#7a9b78";
    if (score >= 60) return "#a6b466";
    if (score >= 40) return "#c9a227";
    return "#be4a4f";
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
        const dateNote = p.last_report_at
          ? `<br><span class="hint">${HerSafeI18n.t("alerts.last_report")}: ${new Date(p.last_report_at).toLocaleDateString()}</span>`
          : "";
        L.circleMarker([p.latitude, p.longitude], {
          radius: radiusFor(p.count), color: colorFor(p.count), fillColor: colorFor(p.count),
          fillOpacity: 0.5, weight: 1,
        })
          .bindPopup(
            `<strong>${escapeHtml(p.city || "")}</strong><br>${HerSafeI18n.t("map.reports_count").replace("{count}", p.count)}${dateNote}` +
              `<br><span class="hint">${HerSafeI18n.t("map.fact_disclaimer")}</span>`
          )
          .addTo(incidentLayer);
      });
    } catch (_) { /* leave layer empty */ }
  }

  // ---------------- Safe Places / Help Places ----------------
  function safePlaceIcon(category) {
    const fallbackIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>';
    return L.divIcon({
      className: "hs-safeplace-icon",
      html: `<div style="background:${CATEGORY_COLOR[category] || "#372937"};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);">
               <span style="display:block;transform:rotate(45deg);">${CATEGORY_ICON[category] || fallbackIcon}</span>
             </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
    });
  }

  const ICO_CLOCK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
  const ICO_PHONE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M6 3h3l1.5 4.5-2 1.5a11 11 0 0 0 5 5l1.5-2L19 13.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 4.5 4.6 1.5 1.5 0 0 1 6 3Z"/></svg>';
  const ICO_UP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M8 10v10H4V10Z"/><path d="M8 10l3.5-6.5a1.6 1.6 0 0 1 3 .7L14 8h4.3a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17 19H8"/></svg>';
  const ICO_DOWN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M8 14V4H4v10Z"/><path d="M8 14l3.5 6.5a1.6 1.6 0 0 0 3-.7L14 16h4.3a2 2 0 0 0 2-2.4l-1.4-7A2 2 0 0 0 17 5H8"/></svg>';

  function placePopupHtml(p) {
    const lastConfirmed = p.last_confirmed_at
      ? `${HerSafeI18n.t("safe_places.last_confirmed")}: ${new Date(p.last_confirmed_at).toLocaleDateString()}`
      : HerSafeI18n.t("safe_places.never_confirmed");
    return `
      <div style="min-width:200px">
        <strong>${escapeHtml(p.name)}</strong><br>
        <span class="category-chip">${HerSafeI18n.t("categories." + p.category) || p.category}</span><br>
        ${p.description ? `<p style="margin:6px 0">${escapeHtml(p.description)}</p>` : ""}
        ${p.opening_hours ? `${ICO_CLOCK} ${escapeHtml(p.opening_hours)}<br>` : ""}
        ${p.phone_number ? `${ICO_PHONE} ${escapeHtml(p.phone_number)}<br>` : ""}
        ${p.safety_notes ? `<em>${escapeHtml(p.safety_notes)}</em><br>` : ""}
        <p class="hint" style="margin:8px 0 4px">${lastConfirmed} (${ICO_UP} ${p.confirm_yes || 0} · ${ICO_DOWN} ${p.confirm_no || 0})</p>
        <p style="margin:4px 0"><strong>${HerSafeI18n.t("safe_places.confirm_prompt")}</strong></p>
        <div class="flex gap-8" data-confirm-place="${p.id}">
          <button type="button" class="btn btn-ghost btn-sm" data-confirm-response="yes">${HerSafeI18n.t("safe_places.confirm_yes")}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-confirm-response="no">${HerSafeI18n.t("safe_places.confirm_no")}</button>
        </div>
        <p class="hint" style="margin-top:8px">${HerSafeI18n.t("safe_places.disclaimer")}</p>
      </div>
    `;
  }

  async function loadSafePlaces() {
    const category = document.getElementById("filter-place-category")?.value || "";
    try {
      const places = await HerSafeAPI.getSafePlaces(category ? `?category=${encodeURIComponent(category)}` : "");
      safePlacesLayer.clearLayers();
      (places || []).forEach((p) => {
        const marker = L.marker([p.latitude, p.longitude], { icon: safePlaceIcon(p.category) });
        marker.bindPopup(placePopupHtml(p));
        marker.on("popupopen", (e) => {
          const el = e.popup.getElement();
          el.querySelectorAll("[data-confirm-response]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              try {
                await HerSafeAPI.confirmPlace(p.id, btn.dataset.confirmResponse);
                HerSafeToast(HerSafeI18n.t("safe_places.confirm_thanks"));
                marker.closePopup();
                loadSafePlaces();
              } catch (err) {
                HerSafeToast(err.status === 429 ? HerSafeI18n.t("safe_places.already_confirmed") : err.message);
              }
            });
          });
        });
        marker.addTo(safePlacesLayer);
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
          ${escapeHtml(s.city || "")} · ${s.count}<br>
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
        const text = a.severity === "elevated" ? HerSafeI18n.t("alerts.elevated_text") : HerSafeI18n.t("alerts.banner_text");
        const windowNote = HerSafeI18n.t("alerts.window_note").replace("{days}", a.window_days);
        const lastReport = a.last_report_at
          ? `<br><span class="hint">${HerSafeI18n.t("alerts.last_report")}: ${new Date(a.last_report_at).toLocaleDateString()}</span>`
          : "";
        L.circle([a.latitude, a.longitude], {
          radius: 400,
          color: a.severity === "elevated" ? "#c0392b" : "#d9a531",
          fillOpacity: 0.08,
          dashArray: "6 6",
        })
          .bindPopup(`${text}<br><span class="hint">${windowNote}</span>${lastReport}`)
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
