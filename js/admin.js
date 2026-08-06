/**
 * HerSafe — Admin panel.
 * admin-login.html handles the login form; admin.html (this file) handles
 * the authenticated dashboard: reports, Safe Places CRUD, street rating
 * moderation, community alerts, and summary statistics.
 */
(function () {
  const isLoginPage = !!document.getElementById("admin-login-form");
  const isDashboard = !!document.getElementById("admin-dashboard");
  const EGYPT_CENTER = [26.8, 30.8];

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------
  function initLogin() {
    const form = document.getElementById("admin-login-form");
    const errorBox = document.getElementById("login-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.textContent = "";
      const username = form.username.value.trim();
      const password = form.password.value;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await HerSafeAPI.adminLogin(username, password);
        window.location.href = "admin.html";
      } catch (err) {
        errorBox.textContent = err.message || "Login failed";
      } finally {
        btn.disabled = false;
      }
    });
  }

  function guardDashboard() {
    if (!HerSafeAPI.isAdminAuthed()) {
      window.location.href = "admin-login.html";
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Reports tab
  // ---------------------------------------------------------------------
  async function loadReports() {
    const tbody = document.querySelector("#admin-reports-table tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6">${HerSafeI18n.t("common.loading")}</td></tr>`;
    try {
      const reports = await HerSafeAPI.getAdminReports();
      if (!reports.length) {
        tbody.innerHTML = `<tr><td colspan="6">${HerSafeI18n.t("admin.no_reports")}</td></tr>`;
        return;
      }
      tbody.innerHTML = reports
        .map(
          (r) => `
        <tr data-id="${r.id}">
          <td>${r.id}</td>
          <td>${escapeHtml(r.incident_type)}</td>
          <td>${escapeHtml(r.city)}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
          <td>${r.evidence_count ?? 0}</td>
          <td><button class="btn btn-danger btn-sm" data-delete-report="${r.id}">${HerSafeI18n.t("admin.delete")}</button></td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function handleReportsClick(e) {
    const btn = e.target.closest("[data-delete-report]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete-report");
    if (!confirm(HerSafeI18n.t("admin.confirm_delete"))) return;
    try {
      await HerSafeAPI.deleteReport(id);
      HerSafeToast("Deleted");
      loadReports();
    } catch (err) {
      HerSafeToast(err.message);
    }
  }

  // ---------------------------------------------------------------------
  // Safe Places tab
  // ---------------------------------------------------------------------
  let placeMap = null;
  let placeMarker = null;

  function initPlaceMap() {
    const el = document.getElementById("place-picker-map");
    if (!el || typeof L === "undefined" || placeMap) return;
    placeMap = L.map(el).setView(EGYPT_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(placeMap);
    placeMap.on("click", (e) => setPlaceLocation(e.latlng.lat, e.latlng.lng));
  }

  function setPlaceLocation(lat, lng) {
    document.getElementById("place-lat").value = lat.toFixed(6);
    document.getElementById("place-lng").value = lng.toFixed(6);
    if (placeMarker) placeMap.removeLayer(placeMarker);
    placeMarker = L.marker([lat, lng]).addTo(placeMap);
  }

  function resetPlaceForm() {
    const form = document.getElementById("place-form");
    form.reset();
    document.getElementById("place-id").value = "";
    document.getElementById("place-error").textContent = "";
    document.getElementById("place-form-title").textContent = HerSafeI18n.t("safe_places.add_new");
    if (placeMarker) { placeMap.removeLayer(placeMarker); placeMarker = null; }
  }

  async function loadPlacesTable() {
    const tbody = document.querySelector("#admin-places-table tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4">${HerSafeI18n.t("common.loading")}</td></tr>`;
    try {
      const places = await HerSafeAPI.getSafePlaces();
      if (!places.length) {
        tbody.innerHTML = `<tr><td colspan="4">${HerSafeI18n.t("admin.no_places")}</td></tr>`;
        return;
      }
      tbody.innerHTML = places
        .map(
          (p) => `
        <tr data-id="${p.id}">
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${HerSafeI18n.t("categories." + p.category) || p.category}</td>
          <td class="flex gap-8">
            <button class="btn btn-ghost btn-sm" data-edit-place="${p.id}">${HerSafeI18n.t("common.edit")}</button>
            <button class="btn btn-danger btn-sm" data-delete-place="${p.id}">${HerSafeI18n.t("common.delete")}</button>
          </td>
        </tr>`
        )
        .join("");
      tbody._places = places; // cache for edit lookups
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function fillPlaceForm(p) {
    document.getElementById("place-id").value = p.id;
    document.getElementById("place-name").value = p.name || "";
    document.getElementById("place-category").value = p.category || "police";
    document.getElementById("place-description").value = p.description || "";
    document.getElementById("place-hours").value = p.opening_hours || "";
    document.getElementById("place-phone").value = p.phone_number || "";
    document.getElementById("place-image").value = p.image_url || "";
    document.getElementById("place-notes").value = p.safety_notes || "";
    document.getElementById("place-lat").value = p.latitude;
    document.getElementById("place-lng").value = p.longitude;
    document.getElementById("place-form-title").textContent = p.name;
    if (placeMap) {
      setPlaceLocation(p.latitude, p.longitude);
      placeMap.setView([p.latitude, p.longitude], 14);
    }
  }

  async function handlePlacesTableClick(e) {
    const editBtn = e.target.closest("[data-edit-place]");
    const delBtn = e.target.closest("[data-delete-place]");
    const tbody = document.querySelector("#admin-places-table tbody");

    if (editBtn) {
      const id = Number(editBtn.getAttribute("data-edit-place"));
      const place = (tbody._places || []).find((p) => p.id === id);
      if (place) fillPlaceForm(place);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (delBtn) {
      const id = delBtn.getAttribute("data-delete-place");
      if (!confirm(HerSafeI18n.t("admin.confirm_delete_place"))) return;
      try {
        await HerSafeAPI.deleteSafePlace(id);
        HerSafeToast("Deleted");
        loadPlacesTable();
      } catch (err) {
        HerSafeToast(err.message);
      }
    }
  }

  async function handlePlaceFormSubmit(e) {
    e.preventDefault();
    const errorBox = document.getElementById("place-error");
    errorBox.textContent = "";

    const id = document.getElementById("place-id").value;
    const lat = parseFloat(document.getElementById("place-lat").value);
    const lng = parseFloat(document.getElementById("place-lng").value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errorBox.textContent = HerSafeI18n.t("safe_places.pick_location");
      return;
    }

    const payload = {
      name: document.getElementById("place-name").value.trim(),
      category: document.getElementById("place-category").value,
      description: document.getElementById("place-description").value.trim(),
      latitude: lat,
      longitude: lng,
      opening_hours: document.getElementById("place-hours").value.trim(),
      phone_number: document.getElementById("place-phone").value.trim(),
      image_url: document.getElementById("place-image").value.trim(),
      safety_notes: document.getElementById("place-notes").value.trim(),
    };

    try {
      if (id) await HerSafeAPI.updateSafePlace(id, payload);
      else await HerSafeAPI.createSafePlace(payload);
      HerSafeToast(HerSafeI18n.t("common.save"));
      resetPlaceForm();
      loadPlacesTable();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  }

  // ---------------------------------------------------------------------
  // Street Ratings tab
  // ---------------------------------------------------------------------
  async function loadRatingsTable() {
    const tbody = document.querySelector("#admin-ratings-table tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6">${HerSafeI18n.t("common.loading")}</td></tr>`;
    try {
      const ratings = await HerSafeAPI.getAdminStreetRatings();
      const visible = ratings.filter((r) => r.status === "visible");
      if (!visible.length) {
        tbody.innerHTML = `<tr><td colspan="6">${HerSafeI18n.t("admin.no_ratings")}</td></tr>`;
        return;
      }
      tbody.innerHTML = visible
        .map(
          (r) => `
        <tr data-id="${r.id}">
          <td>${r.id}</td>
          <td>${escapeHtml(r.city || r.street_key)}</td>
          <td>${r.score}/100</td>
          <td>${escapeHtml((r.comment || "").slice(0, 60))}</td>
          <td>${new Date(r.created_at).toLocaleDateString()}</td>
          <td><button class="btn btn-danger btn-sm" data-hide-rating="${r.id}">${HerSafeI18n.t("admin.delete")}</button></td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function handleRatingsTableClick(e) {
    const btn = e.target.closest("[data-hide-rating]");
    if (!btn) return;
    const id = btn.getAttribute("data-hide-rating");
    if (!confirm(HerSafeI18n.t("admin.confirm_hide_rating"))) return;
    try {
      await HerSafeAPI.hideStreetRating(id);
      HerSafeToast("Hidden");
      loadRatingsTable();
    } catch (err) {
      HerSafeToast(err.message);
    }
  }

  // ---------------------------------------------------------------------
  // Alerts tab
  // ---------------------------------------------------------------------
  async function loadAlertsTable() {
    const tbody = document.querySelector("#admin-alerts-table tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4">${HerSafeI18n.t("common.loading")}</td></tr>`;
    try {
      const alerts = await HerSafeAPI.getCommunityAlerts();
      if (!alerts.length) {
        tbody.innerHTML = `<tr><td colspan="4">${HerSafeI18n.t("admin.no_alerts")}</td></tr>`;
        return;
      }
      tbody.innerHTML = alerts
        .map(
          (a) => `<tr>
          <td>${a.latitude}, ${a.longitude}</td>
          <td>${escapeHtml(a.city)}</td>
          <td>${a.report_count}</td>
          <td>${a.severity}</td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------
  // Stats tab
  // ---------------------------------------------------------------------
  function streetListHtml(list) {
    if (!list || !list.length) return `<p class="empty-state">${HerSafeI18n.t("common.no_results")}</p>`;
    return list
      .map((s) => `<div class="rating-row"><span>${escapeHtml(s.city || s.street_key)}</span><strong>${s.score}/100</strong></div>`)
      .join("");
  }

  async function loadStats() {
    const cardsBox = document.getElementById("admin-stats-cards");
    try {
      const summary = await HerSafeAPI.getAdminDashboardSummary();
      cardsBox.innerHTML = `
        <div class="card stat-card"><div class="stat-number">${summary.total_reports}</div><div class="stat-label">Reports</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_safe_places}</div><div class="stat-label">Safe Places</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_street_ratings}</div><div class="stat-label">Street Ratings</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_active_alerts}</div><div class="stat-label">Active Alerts</div></div>
      `;
      document.getElementById("riskiest-streets").innerHTML = streetListHtml(summary.riskiest_streets);
      document.getElementById("safest-streets").innerHTML = streetListHtml(summary.safest_streets);
    } catch (err) {
      cardsBox.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
        tab.setAttribute("aria-selected", "true");
        document.querySelectorAll("[data-tab-panel]").forEach((p) => (p.hidden = true));
        const panel = document.querySelector(`[data-tab-panel="${tab.dataset.tab}"]`);
        if (panel) panel.hidden = false;

        if (tab.dataset.tab === "places") { initPlaceMap(); loadPlacesTable(); }
        if (tab.dataset.tab === "ratings") loadRatingsTable();
        if (tab.dataset.tab === "alerts") loadAlertsTable();
        if (tab.dataset.tab === "stats") loadStats();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (isLoginPage) initLogin();
    if (isDashboard && guardDashboard()) {
      initTabs();
      loadReports();
      document.getElementById("admin-reports-table")?.addEventListener("click", handleReportsClick);
      document.getElementById("admin-places-table")?.addEventListener("click", handlePlacesTableClick);
      document.getElementById("admin-ratings-table")?.addEventListener("click", handleRatingsTableClick);
      document.getElementById("place-form")?.addEventListener("submit", handlePlaceFormSubmit);
      document.getElementById("place-form-reset")?.addEventListener("click", resetPlaceForm);
      document.getElementById("admin-logout")?.addEventListener("click", () => {
        HerSafeAPI.adminLogout();
        window.location.href = "admin-login.html";
      });
    }
  });
})();
