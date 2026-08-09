/**
 * HerSafe API client.
 * Set window.HERSAFE_API_BASE (see config below) to your deployed Worker URL,
 * e.g. "https://hersafe-api.yourname.workers.dev".
 */
(function () {
  const API_BASE = window.HERSAFE_API_BASE || "https://hersafe-api.example.workers.dev";
  const TOKEN_KEY = "hersafe:admin_token";
  const USER_TOKEN_KEY = "hersafe:user_token";
  const USER_PROFILE_KEY = "hersafe:user_profile";

  async function request(path, { method = "GET", body, auth = false, userAuth = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) headers["Authorization"] = "Bearer " + token;
    }
    if (userAuth) {
      const token = localStorage.getItem(USER_TOKEN_KEY);
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

      // Session expired mid-use: clear the stale token and send the admin
      // back to login instead of leaving every tab showing a raw error.
      // (User accounts are optional/guest-friendly, so we don't force a
      // redirect for expired user tokens — pages that require sign-in
      // already handle that themselves, e.g. profile.js's guest view.)
      if (auth && (res.status === 401 || res.status === 403)) {
        sessionStorage.removeItem(TOKEN_KEY);
        if (!location.pathname.endsWith("admin-login.html")) {
          location.href = "admin-login.html";
        }
      }

      throw err;
    }
    return data;
  }

  const HerSafeAPI = {
    submitReport: (payload) => request("/report", { method: "POST", body: payload, userAuth: true }),
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
    getAdminReportDetail: (id) => request(`/admin/report/${id}`, { auth: true }),
    updateReportStatus: (id, status) => request(`/admin/report/${id}/status`, { method: "PATCH", body: { status }, auth: true }),
    deleteReport: (id) => request(`/admin/report/${id}`, { method: "DELETE", auth: true }),

    // Safe Places
    getSafePlaces: (query = "") => request("/safe-places" + query),
    createSafePlace: (payload) => request("/safe-places", { method: "POST", body: payload, auth: true }),
    updateSafePlace: (id, payload) => request(`/safe-places/${id}`, { method: "PUT", body: payload, auth: true }),
    deleteSafePlace: (id) => request(`/safe-places/${id}`, { method: "DELETE", auth: true }),

    // Street Ratings
    getStreetRatings: (query = "") => request("/street-ratings" + query),
    submitStreetRating: (payload) => request("/street-rating", { method: "POST", body: payload, userAuth: true }),
    getAdminStreetRatings: () => request("/admin/street-ratings", { auth: true }),
    hideStreetRating: (id) => request(`/admin/street-rating/${id}`, { method: "DELETE", auth: true }),
    voteHelpful: (ratingId) => request(`/rating-helpful/${ratingId}`, { method: "POST", userAuth: true }),
    verifyRating: (streetKey, response) => request("/verify-rating", { method: "POST", body: { street_key: streetKey, response }, userAuth: true }),

    // Street details
    getStreetDetails: (lat, lng) => request(`/street-details?lat=${lat}&lng=${lng}`),

    // Community Alerts
    getCommunityAlerts: () => request("/community-alerts"),

    // Safer Route
    getSaferRoute: (query = "") => request("/safe-route" + query),

    // Admin dashboard
    getAdminDashboardSummary: () => request("/admin/dashboard-summary", { auth: true }),

    // Accounts / auth (optional — guests can do everything without these)
    register: (name, email, password) =>
      request("/register", { method: "POST", body: { name, email, password } }).then(saveUserSession),
    login: (email, password) =>
      request("/login", { method: "POST", body: { email, password } }).then(saveUserSession),
    logout: () => {
      localStorage.removeItem(USER_TOKEN_KEY);
      localStorage.removeItem(USER_PROFILE_KEY);
    },
    isUserAuthed: () => !!localStorage.getItem(USER_TOKEN_KEY),
    getStoredUser: () => {
      try { return JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || "null"); } catch (_) { return null; }
    },
    getProfile: () => request("/profile", { userAuth: true }),
    getLeaderboard: (query = "") => request("/leaderboard" + query),
    getUserPoints: () => request("/user-points", { userAuth: true }),
    getUserBadges: () => request("/user-badges", { userAuth: true }),

    // Notifications
    getNotifications: () => request("/notifications", { userAuth: true }),
    markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH", userAuth: true }),
  };

  function saveUserSession(data) {
    if (data && data.token) {
      localStorage.setItem(USER_TOKEN_KEY, data.token);
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify({ name: data.name, email: data.email }));
    }
    return data;
  }

  window.HerSafeAPI = HerSafeAPI;
})();
