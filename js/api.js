/**
 * HerSafe API client.
 * Set window.HERSAFE_API_BASE (see config below) to your deployed Worker URL,
 * e.g. "https://hersafe-api.yourname.workers.dev".
 */
(function () {
  const API_BASE = window.HERSAFE_API_BASE || "https://hersafe-api.example.workers.dev";
  const TOKEN_KEY = "hersafe:admin_token";

  async function request(path, { method = "GET", body, auth = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) headers["Authorization"] = "Bearer " + token;
    }
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const HerSafeAPI = {
    submitReport: (payload) => request("/report", { method: "POST", body: payload }),
    getReports: (query = "") => request("/reports" + query),
    getStatistics: (query = "") => request("/statistics" + query),
    getMapData: (query = "") => request("/map" + query),

    adminLogin: (username, password) =>
      request("/admin/login", { method: "POST", body: { username, password } }).then((data) => {
        if (data && data.token) sessionStorage.setItem(TOKEN_KEY, data.token);
        return data;
      }),
    adminLogout: () => sessionStorage.removeItem(TOKEN_KEY),
    isAdminAuthed: () => !!sessionStorage.getItem(TOKEN_KEY),
    getAdminReports: (query = "") => request("/admin/reports" + query, { auth: true }),
    deleteReport: (id) => request(`/admin/report/${id}`, { method: "DELETE", auth: true }),
  };

  window.HerSafeAPI = HerSafeAPI;
})();
