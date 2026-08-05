/**
 * HerSafe — Admin panel.
 * admin-login.html handles the login form; admin.html (this file, dashboard
 * section) handles the authenticated dashboard. Both are guarded client-side
 * AND server-side (the Worker re-validates the bearer token on every call).
 */
(function () {
  const isLoginPage = !!document.getElementById("admin-login-form");
  const isDashboard = !!document.getElementById("admin-dashboard");

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
          <td>${r.incident_type}</td>
          <td>${r.city || ""}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
          <td>${r.evidence_count ?? 0}</td>
          <td><button class="btn btn-danger btn-sm" data-delete="${r.id}">${HerSafeI18n.t("admin.delete")}</button></td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">${err.message}</td></tr>`;
    }
  }

  async function handleDeleteClick(e) {
    const btn = e.target.closest("[data-delete]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete");
    if (!confirm(HerSafeI18n.t("admin.confirm_delete"))) return;
    try {
      await HerSafeAPI.deleteReport(id);
      HerSafeToast("Deleted");
      loadReports();
    } catch (err) {
      HerSafeToast(err.message);
    }
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
        tab.setAttribute("aria-selected", "true");
        document.querySelectorAll("[data-tab-panel]").forEach((p) => (p.hidden = true));
        const panel = document.querySelector(`[data-tab-panel="${tab.dataset.tab}"]`);
        if (panel) panel.hidden = false;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (isLoginPage) initLogin();
    if (isDashboard && guardDashboard()) {
      initTabs();
      loadReports();
      document.getElementById("admin-reports-table")?.addEventListener("click", handleDeleteClick);
      document.getElementById("admin-logout")?.addEventListener("click", () => {
        HerSafeAPI.adminLogout();
        window.location.href = "admin-login.html";
      });
    }
  });
})();
