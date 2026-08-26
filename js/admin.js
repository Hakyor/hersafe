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
  const STATUS_LABEL_KEY = { pending: "report_status.pending", reviewed: "report_status.reviewed", verified: "report_status.verified", archived: "report_status.archived" };

  function buildReportsQuery() {
    const search = document.getElementById("reports-search")?.value.trim() || "";
    const type = document.getElementById("reports-filter-type")?.value || "";
    const status = document.getElementById("reports-filter-status")?.value || "";
    const flagged = document.getElementById("reports-filter-flagged")?.checked;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (flagged) params.set("flagged", "1");
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  async function loadReports() {
    const tbody = document.querySelector("#admin-reports-table tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8">${HerSafeI18n.t("common.loading")}</td></tr>`;
    try {
      const reports = await HerSafeAPI.getAdminReports(buildReportsQuery());
      if (!reports.length) {
        tbody.innerHTML = `<tr><td colspan="8">${HerSafeI18n.t("admin.no_reports")}</td></tr>`;
        return;
      }
      tbody.innerHTML = reports
        .map(
          (r) => `
        <tr data-id="${r.id}">
          <td>${r.id} ${r.flagged ? `<span title="${escapeHtml(r.flag_reason || "")}">🚩</span>` : ""}</td>
          <td>${escapeHtml(r.incident_type)}</td>
          <td>${escapeHtml(r.city)}</td>
          <td>${escapeHtml(r.reporter_name)}</td>
          <td><span class="status-pill status-${r.review_status}">${HerSafeI18n.t(STATUS_LABEL_KEY[r.review_status]) || r.review_status}</span></td>
          <td>${new Date(r.created_at).toLocaleDateString()}</td>
          <td>${r.evidence_count ?? 0}</td>
          <td class="flex gap-8">
            <button class="btn btn-ghost btn-sm" data-view-report="${r.id}">View</button>
            <button class="btn btn-danger btn-sm" data-delete-report="${r.id}">${HerSafeI18n.t("admin.delete")}</button>
          </td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function handleReportsClick(e) {
    const delBtn = e.target.closest("[data-delete-report]");
    const viewBtn = e.target.closest("[data-view-report]");

    if (delBtn) {
      const id = delBtn.getAttribute("data-delete-report");
      if (!confirm(HerSafeI18n.t("admin.confirm_delete"))) return;
      try {
        await HerSafeAPI.deleteReport(id);
        HerSafeToast("Deleted");
        loadReports();
      } catch (err) {
        HerSafeToast(err.message);
      }
      return;
    }
    if (viewBtn) openReportModal(viewBtn.getAttribute("data-view-report"));
  }

  async function openReportModal(id) {
    const root = document.getElementById("report-detail-modal-root");
    root.innerHTML = `<div class="modal-overlay" id="report-modal-overlay"><div class="modal-box"><p>${HerSafeI18n.t("common.loading")}</p></div></div>`;
    const overlay = document.getElementById("report-modal-overlay");
    overlay.addEventListener("click", (e) => { if (e.target === overlay) root.innerHTML = ""; });

    try {
      const r = await HerSafeAPI.getAdminReportDetail(id);
      const evidenceHtml = r.evidence_links.length
        ? r.evidence_links.map((l) => `<li><a href="${escapeHtml(l.google_drive_url)}" target="_blank" rel="noopener">${l.type}</a></li>`).join("")
        : `<li class="hint">None</li>`;
      const flagHtml = r.flagged
        ? `<div class="notice notice-warning">🚩 Flagged for review: ${escapeHtml((r.flag_reason || "").split(",").join(", "))}</div>`
        : "";

      root.querySelector(".modal-box").innerHTML = `
        <button class="icon-btn modal-close" data-close-modal aria-label="Close">✕</button>
        <h2>Report #${r.id}</h2>
        <p><span class="status-pill status-${r.review_status}">${HerSafeI18n.t(STATUS_LABEL_KEY[r.review_status]) || r.review_status}</span></p>
        ${flagHtml}
        <div class="rating-row"><span>Type</span><strong>${escapeHtml(r.incident_type)}</strong></div>
        <div class="rating-row"><span>City</span><strong>${escapeHtml(r.city || "—")}</strong></div>
        <div class="rating-row"><span>Date / Time</span><strong>${escapeHtml(r.incident_date || "—")} ${escapeHtml(r.incident_time || "")}</strong></div>
        <div class="rating-row"><span>Reporter</span><strong>${escapeHtml(r.reporter_name)}</strong></div>
        ${r.reporter_email ? `<div class="rating-row"><span>Email</span><strong>${escapeHtml(r.reporter_email)}</strong></div>` : ""}
        <p style="margin-top:12px"><strong>Description</strong></p>
        <p>${escapeHtml(r.description || "—")}</p>
        <p style="margin-top:12px"><strong>Evidence links</strong> <span class="hint">(private — never shown publicly)</span></p>
        <ul style="padding-inline-start:18px">${evidenceHtml}</ul>

        <div class="notice" style="margin-top:14px" data-i18n="admin.trust_note">Trust score reflects community activity, not proof this report is accurate.</div>

        <div class="flex gap-8 wrap" style="margin-top:12px">
          <button class="btn btn-primary" data-set-status="verified" data-id="${r.id}">✅ ${HerSafeI18n.t("admin.approve")}</button>
          <button class="btn btn-danger" data-set-status="archived" data-id="${r.id}">🚫 ${HerSafeI18n.t("admin.reject")}</button>
          <button class="btn btn-ghost" data-set-status="reviewed" data-id="${r.id}">${HerSafeI18n.t("report_status.reviewed")}</button>
        </div>
      `;

      root.querySelector("[data-close-modal]").addEventListener("click", () => (root.innerHTML = ""));
      root.querySelectorAll("[data-set-status]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await HerSafeAPI.updateReportStatus(btn.dataset.id, btn.dataset.setStatus);
            HerSafeToast(HerSafeI18n.t("admin.status_updated"));
            root.innerHTML = "";
            loadReports();
          } catch (err) {
            HerSafeToast(err.message);
          }
        });
      });
    } catch (err) {
      root.querySelector(".modal-box").innerHTML = `<p>${escapeHtml(err.message)}</p>`;
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
    tbody.innerHTML = `<tr><td colspan="5">${HerSafeI18n.t("common.loading")}</td></tr>`;
    const statusFilter = document.getElementById("places-filter-status")?.value || "";
    try {
      const places = await HerSafeAPI.getAdminSafePlaces(statusFilter ? `?status=${statusFilter}` : "");
      if (!places.length) {
        tbody.innerHTML = `<tr><td colspan="5">${HerSafeI18n.t("admin.no_places")}</td></tr>`;
        return;
      }
      tbody.innerHTML = places
        .map(
          (p) => `
        <tr data-id="${p.id}">
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${HerSafeI18n.t("categories." + p.category) || p.category}</td>
          <td><span class="status-pill status-${p.review_status === "approved" ? "verified" : p.review_status === "rejected" ? "archived" : p.review_status}">${HerSafeI18n.t("place_status." + p.review_status) || p.review_status}</span></td>
          <td class="flex gap-8 wrap">
            ${p.review_status === "pending" ? `<button class="btn btn-primary btn-sm" data-place-status="approved" data-place-id="${p.id}">✅ ${HerSafeI18n.t("admin.approve")}</button>
            <button class="btn btn-danger btn-sm" data-place-status="rejected" data-place-id="${p.id}">🚫 ${HerSafeI18n.t("admin.reject")}</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-edit-place="${p.id}">${HerSafeI18n.t("common.edit")}</button>
            <button class="btn btn-danger btn-sm" data-delete-place="${p.id}">${HerSafeI18n.t("common.delete")}</button>
          </td>
        </tr>`
        )
        .join("");
      tbody._places = places; // cache for edit lookups
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
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
    const statusBtn = e.target.closest("[data-place-status]");
    const tbody = document.querySelector("#admin-places-table tbody");

    if (statusBtn) {
      try {
        await HerSafeAPI.updatePlaceStatus(statusBtn.dataset.placeId, statusBtn.dataset.placeStatus);
        HerSafeToast(HerSafeI18n.t("admin.status_updated"));
        loadPlacesTable();
      } catch (err) {
        HerSafeToast(err.message);
      }
      return;
    }
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
  // Campaigns tab
  // ---------------------------------------------------------------------
  async function loadCampaignsTable() {
    const tbody = document.querySelector("#admin-campaigns-table tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5">${HerSafeI18n.t("common.loading")}</td></tr>`;
    try {
      const campaigns = await HerSafeAPI.getAdminCampaigns();
      if (!campaigns.length) {
        tbody.innerHTML = `<tr><td colspan="5">${HerSafeI18n.t("common.no_results")}</td></tr>`;
        return;
      }
      tbody.innerHTML = campaigns
        .map(
          (c) => `
        <tr data-id="${c.id}">
          <td>${c.id}</td>
          <td>${escapeHtml(c.title)}</td>
          <td>${escapeHtml(c.platform || "—")}</td>
          <td><span class="status-pill status-${c.status === "active" ? "verified" : "archived"}">${HerSafeI18n.t("campaigns.status_" + c.status) || c.status}</span></td>
          <td class="flex gap-8">
            <button class="btn btn-ghost btn-sm" data-edit-campaign="${c.id}">${HerSafeI18n.t("common.edit")}</button>
            <button class="btn btn-danger btn-sm" data-delete-campaign="${c.id}">${HerSafeI18n.t("common.delete")}</button>
          </td>
        </tr>`
        )
        .join("");
      tbody._campaigns = campaigns;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function resetCampaignForm() {
    const form = document.getElementById("campaign-form");
    form.reset();
    document.getElementById("campaign-id").value = "";
    document.getElementById("campaign-error").textContent = "";
    document.getElementById("campaign-form-title").textContent = HerSafeI18n.t("campaigns.add_new");
  }

  function fillCampaignForm(c) {
    document.getElementById("campaign-id").value = c.id;
    document.getElementById("campaign-title").value = c.title || "";
    document.getElementById("campaign-description").value = c.description || "";
    document.getElementById("campaign-platform").value = c.platform || "";
    document.getElementById("campaign-url").value = c.official_report_url || "";
    document.getElementById("campaign-instructions").value = c.instructions || "";
    document.getElementById("campaign-status").value = c.status || "active";
    document.getElementById("campaign-form-title").textContent = c.title;
  }

  async function handleCampaignsTableClick(e) {
    const editBtn = e.target.closest("[data-edit-campaign]");
    const delBtn = e.target.closest("[data-delete-campaign]");
    const tbody = document.querySelector("#admin-campaigns-table tbody");

    if (editBtn) {
      const id = Number(editBtn.getAttribute("data-edit-campaign"));
      const campaign = (tbody._campaigns || []).find((c) => c.id === id);
      if (campaign) fillCampaignForm(campaign);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (delBtn) {
      const id = delBtn.getAttribute("data-delete-campaign");
      if (!confirm(HerSafeI18n.t("admin.confirm_delete"))) return;
      try {
        await HerSafeAPI.deleteCampaign(id);
        HerSafeToast("Deleted");
        loadCampaignsTable();
      } catch (err) {
        HerSafeToast(err.message);
      }
    }
  }

  async function handleCampaignFormSubmit(e) {
    e.preventDefault();
    const errorBox = document.getElementById("campaign-error");
    errorBox.textContent = "";

    const id = document.getElementById("campaign-id").value;
    const payload = {
      title: document.getElementById("campaign-title").value.trim(),
      description: document.getElementById("campaign-description").value.trim(),
      platform: document.getElementById("campaign-platform").value.trim(),
      official_report_url: document.getElementById("campaign-url").value.trim(),
      instructions: document.getElementById("campaign-instructions").value.trim(),
      status: document.getElementById("campaign-status").value,
    };

    try {
      if (id) await HerSafeAPI.updateCampaign(id, payload);
      else await HerSafeAPI.createCampaign(payload);
      HerSafeToast(HerSafeI18n.t("common.save"));
      resetCampaignForm();
      loadCampaignsTable();
    } catch (err) {
      errorBox.textContent = err.message;
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
        <div class="card stat-card"><div class="stat-number">${summary.pending_reports}</div><div class="stat-label">Pending Reports</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.flagged_reports}</div><div class="stat-label">Flagged Reports</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_safe_places}</div><div class="stat-label">Approved Help Places</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.pending_places}</div><div class="stat-label">Pending Help Places</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_street_ratings}</div><div class="stat-label">Street Ratings</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_active_alerts}</div><div class="stat-label">Active Alerts</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_registered_users}</div><div class="stat-label">Registered Users</div></div>
        <div class="card stat-card"><div class="stat-number">${summary.total_anonymous_reports}</div><div class="stat-label">Anonymous Reports</div></div>
      `;
      document.getElementById("riskiest-streets").innerHTML = streetListHtml(summary.riskiest_streets);
      document.getElementById("safest-streets").innerHTML = streetListHtml(summary.safest_streets);
      const topBox = document.getElementById("top-contributors");
      if (topBox) {
        topBox.innerHTML = summary.top_contributors.length
          ? summary.top_contributors.map((c) => `<div class="rating-row"><span>${escapeHtml(c.name)}</span><strong>${c.points} pts</strong></div>`).join("")
          : `<p class="empty-state">${HerSafeI18n.t("common.no_results")}</p>`;
      }
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
        if (tab.dataset.tab === "campaigns") loadCampaignsTable();
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
      document.getElementById("report-detail-modal-root")?.addEventListener("click", () => {});
      let searchTimer;
      document.getElementById("reports-search")?.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadReports, 300);
      });
      document.getElementById("reports-filter-type")?.addEventListener("change", loadReports);
      document.getElementById("reports-filter-status")?.addEventListener("change", loadReports);
      document.getElementById("reports-filter-flagged")?.addEventListener("change", loadReports);
      document.getElementById("admin-places-table")?.addEventListener("click", handlePlacesTableClick);
      document.getElementById("places-filter-status")?.addEventListener("change", loadPlacesTable);
      document.getElementById("admin-ratings-table")?.addEventListener("click", handleRatingsTableClick);
      document.getElementById("place-form")?.addEventListener("submit", handlePlaceFormSubmit);
      document.getElementById("place-form-reset")?.addEventListener("click", resetPlaceForm);
      document.getElementById("admin-campaigns-table")?.addEventListener("click", handleCampaignsTableClick);
      document.getElementById("campaign-form")?.addEventListener("submit", handleCampaignFormSubmit);
      document.getElementById("campaign-form-reset")?.addEventListener("click", resetCampaignForm);
      document.getElementById("admin-logout")?.addEventListener("click", () => {
        HerSafeAPI.adminLogout();
        window.location.href = "admin-login.html";
      });
    }
  });
})();
