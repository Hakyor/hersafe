/**
 * HerSafe Cloudflare Worker API
 *
 * Bindings expected (see wrangler.toml):
 *   DB            - D1 database binding
 *   TOKEN_SECRET  - secret string for signing admin session tokens
 *   ALLOWED_ORIGIN - the GitHub Pages origin allowed to call this API
 *
 * Endpoints:
 *   POST   /report
 *   GET    /reports
 *   GET    /statistics
 *   GET    /map
 *   POST   /admin/login
 *   GET    /admin/reports
 *   DELETE /admin/report/:id
 *
 *   GET    /safe-places
 *   POST   /safe-places        (admin)
 *   PUT    /safe-places/:id    (admin)
 *   DELETE /safe-places/:id    (admin)
 *
 *   GET    /street-ratings
 *   POST   /street-rating
 *   GET    /admin/street-ratings   (admin)
 *   DELETE /admin/street-rating/:id (admin)
 *
 *   GET    /community-alerts
 *
 *   GET    /safe-route
 *
 *   GET    /admin/dashboard-summary (admin)
 *   PATCH  /admin/report/:id/status  (admin)
 *   GET    /admin/report/:id         (admin, full detail incl. evidence)
 *
 *   POST   /register
 *   POST   /login
 *   POST   /logout
 *   GET    /profile          (user)
 *   GET    /leaderboard
 *   GET    /user-points      (user)
 *   GET    /user-badges      (user)
 *
 *   POST   /verify-rating       (user)
 *   POST   /rating-helpful/:id  (user)
 *
 *   GET    /street-details
 *
 *   GET    /notifications            (user)
 *   PATCH  /notifications/:id/read   (user)
 */

// Points awarded per action. Kept as one table so values are easy to
// retune later without hunting through handler code.
const POINTS = {
  street_rating: 5,
  report: 15,
  verification: 3,
  helpful_received: 2,
};

// Trust score adjustments and level thresholds.
const TRUST_DEFAULT = 20;
const TRUST_DELTA = { helpful_vote: 2, report_verified: 1, spam_penalty: -10 };
function trustLevelFor(score) {
  if (score >= 90) return "top_contributor";
  if (score >= 70) return "community_helper";
  if (score >= 40) return "trusted_member";
  if (score >= 20) return "contributor";
  return "new_member";
}

// Badge thresholds. Checked after every points-earning event.
const BADGE_POINTS_TIERS = [
  { key: "points_100", min: 100 },
  { key: "points_500", min: 500 },
  { key: "points_1000", min: 1000 },
];

const MAX_DESCRIPTION_LEN = 2000;
const MAX_CITY_LEN = 120;
const VALID_EVIDENCE_TYPES = new Set(["image", "video", "audio"]);
const DRIVE_URL_RE = /^https:\/\/(drive|docs)\.google\.com\//i;
const RATE_LIMIT_PER_HOUR_DEFAULT = 5;
const TOKEN_TTL_SECONDS = 4 * 60 * 60; // 4 hours

// HerSafe currently serves Egypt only. Kept generous around the borders
// (includes Sinai and the Red Sea coast) to avoid rejecting valid
// edge-of-country reports. Update this if the service area ever expands.
const SERVICE_COUNTRY = "Egypt";
const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 31.9, minLng: 24.5, maxLng: 37.0 };

function isInEgypt(lat, lng) {
  return (
    lat >= EGYPT_BOUNDS.minLat &&
    lat <= EGYPT_BOUNDS.maxLat &&
    lng >= EGYPT_BOUNDS.minLng &&
    lng <= EGYPT_BOUNDS.maxLng
  );
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(env, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const response = await route(request, url, env, ctx);
      appendHeaders(response, corsHeaders);
      return response;
    } catch (err) {
      const res = jsonResponse({ error: err.message || "Internal error" }, err.status || 500);
      appendHeaders(res, corsHeaders);
      return res;
    }
  },
};

async function route(request, url, env, ctx) {
  const { pathname } = url;
  const method = request.method;

  if (method === "POST" && pathname === "/report") return handleCreateReport(request, env);
  if (method === "GET" && pathname === "/reports") return handleListReports(request, url, env);
  if (method === "GET" && pathname === "/statistics") return handleStatistics(request, url, env);
  if (method === "GET" && pathname === "/map") return handleMap(request, url, env);
  if (method === "POST" && pathname === "/admin/login") return handleAdminLogin(request, env);
  if (method === "GET" && pathname === "/admin/reports") return handleAdminReports(request, url, env);
  if (method === "DELETE" && /^\/admin\/report\/\d+$/.test(pathname)) {
    const id = Number(pathname.split("/").pop());
    return handleAdminDeleteReport(id, request, env);
  }

  // Safe Places
  if (method === "GET" && pathname === "/safe-places") return handleListSafePlaces(request, url, env);
  if (method === "POST" && pathname === "/safe-places") return handleCreateSafePlace(request, env);
  if (method === "PUT" && /^\/safe-places\/\d+$/.test(pathname)) {
    return handleUpdateSafePlace(Number(pathname.split("/").pop()), request, env);
  }
  if (method === "DELETE" && /^\/safe-places\/\d+$/.test(pathname)) {
    return handleDeleteSafePlace(Number(pathname.split("/").pop()), request, env);
  }

  // Street Ratings
  if (method === "GET" && pathname === "/street-ratings") return handleListStreetRatings(request, url, env);
  if (method === "POST" && pathname === "/street-rating") return handleCreateStreetRating(request, env);
  if (method === "GET" && pathname === "/admin/street-ratings") return handleAdminStreetRatings(request, url, env);
  if (method === "DELETE" && /^\/admin\/street-rating\/\d+$/.test(pathname)) {
    return handleAdminDeleteStreetRating(Number(pathname.split("/").pop()), request, env);
  }

  // Community Alerts
  if (method === "GET" && pathname === "/community-alerts") return handleCommunityAlerts(request, url, env);

  // Safer Route
  if (method === "GET" && pathname === "/safe-route") return handleSafeRoute(request, url, env);

  // Admin dashboard summary
  if (method === "GET" && pathname === "/admin/dashboard-summary") return handleAdminDashboardSummary(request, env);
  if (method === "PATCH" && /^\/admin\/report\/\d+\/status$/.test(pathname)) {
    const id = Number(pathname.split("/")[3]);
    return handleAdminUpdateReportStatus(id, request, env);
  }
  if (method === "GET" && /^\/admin\/report\/\d+$/.test(pathname)) {
    return handleAdminReportDetail(Number(pathname.split("/").pop()), request, env);
  }

  // Accounts / auth
  if (method === "POST" && pathname === "/register") return handleRegister(request, env);
  if (method === "POST" && pathname === "/login") return handleLogin(request, env);
  if (method === "POST" && pathname === "/logout") return jsonResponse({ ok: true });
  if (method === "GET" && pathname === "/profile") return handleProfile(request, env);
  if (method === "GET" && pathname === "/leaderboard") return handleLeaderboard(request, url, env);
  if (method === "GET" && pathname === "/user-points") return handleUserPoints(request, env);
  if (method === "GET" && pathname === "/user-badges") return handleUserBadges(request, env);

  // Community verification + helpful votes
  if (method === "POST" && pathname === "/verify-rating") return handleVerifyRating(request, env);
  if (method === "POST" && /^\/rating-helpful\/\d+$/.test(pathname)) {
    return handleHelpfulVote(Number(pathname.split("/").pop()), request, env);
  }

  // Street details
  if (method === "GET" && pathname === "/street-details") return handleStreetDetails(request, url, env);

  // Notifications
  if (method === "GET" && pathname === "/notifications") return handleListNotifications(request, env);
  if (method === "PATCH" && /^\/notifications\/\d+\/read$/.test(pathname)) {
    return handleMarkNotificationRead(Number(pathname.split("/")[2]), request, env);
  }

  return jsonResponse({ error: "Not found" }, 404);
}

// ---------------------------------------------------------------------
// Public: create report
// ---------------------------------------------------------------------
async function handleCreateReport(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ipHash = await sha256Hex(ip);

  await enforceRateLimit(env, ipHash);

  const body = await safeJson(request);
  const errors = validateReportPayload(body);
  if (errors.length) return jsonResponse({ error: errors.join(" ") }, 400);

  const description = sanitizeText(body.description || "").slice(0, MAX_DESCRIPTION_LEN);
  const city = sanitizeText(body.city || "").slice(0, MAX_CITY_LEN);
  const lat = isFiniteNumber(body.latitude) ? body.latitude : null;
  const lng = isFiniteNumber(body.longitude) ? body.longitude : null;

  // Reports stay anonymous by default (matches the existing "Submit
  // completely anonymously" checkbox). A signed-in user only gets
  // attributed if they explicitly uncheck it.
  const user = await getOptionalUser(request, env);
  const wantsAnonymous = body.anonymous !== false;
  const accountId = user && !wantsAnonymous ? user.accountId : null;

  const insert = await env.DB.prepare(
    `INSERT INTO reports (incident_type, description, latitude, longitude, city, country, incident_date, incident_time, anonymous, ip_hash, account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.incident_type,
      description,
      lat,
      lng,
      city,
      SERVICE_COUNTRY,
      body.date || null,
      body.time || null,
      wantsAnonymous ? 1 : 0,
      ipHash,
      accountId
    )
    .run();

  const reportId = insert.meta.last_row_id;

  const links = Array.isArray(body.evidence_links) ? body.evidence_links.slice(0, 10) : [];
  for (const link of links) {
    if (!link || !VALID_EVIDENCE_TYPES.has(link.type) || !DRIVE_URL_RE.test(link.url || "")) continue;
    await env.DB.prepare(
      `INSERT INTO evidence_links (report_id, type, google_drive_url) VALUES (?, ?, ?)`
    )
      .bind(reportId, link.type, link.url.trim().slice(0, 2048))
      .run();
  }

  if (accountId) {
    await awardPoints(env, accountId, POINTS.report, "report", "reports", reportId);
  }

  return jsonResponse({ ok: true, id: reportId }, 201);
}

function validateReportPayload(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Invalid request body."];
  if (!body.incident_type || typeof body.incident_type !== "string") errors.push("Incident type is required.");
  if (body.description && body.description.length > MAX_DESCRIPTION_LEN) errors.push("Description is too long.");
  if (body.latitude != null && !isFiniteNumber(body.latitude)) errors.push("Invalid latitude.");
  if (body.longitude != null && !isFiniteNumber(body.longitude)) errors.push("Invalid longitude.");
  if (
    body.latitude != null &&
    body.longitude != null &&
    isFiniteNumber(body.latitude) &&
    isFiniteNumber(body.longitude) &&
    !isInEgypt(body.latitude, body.longitude)
  ) {
    errors.push("HerSafe currently only accepts reports located within Egypt.");
  }
  return errors;
}

// ---------------------------------------------------------------------
// Public: list recent reports (safe fields only, no ip_hash)
// ---------------------------------------------------------------------
async function handleListReports(request, url, env) {
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 20);
  const { results } = await env.DB.prepare(
    `SELECT id, incident_type, city, incident_date, created_at
     FROM reports WHERE status = 'visible'
     ORDER BY created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return jsonResponse(results || []);
}

// ---------------------------------------------------------------------
// Public: aggregated statistics
// ---------------------------------------------------------------------
async function handleStatistics(request, url, env) {
  if (url.searchParams.get("summary")) {
    const summary = await getSummary(env);
    return jsonResponse(summary);
  }

  const [byArea, byMonth, byType, total] = await Promise.all([
    env.DB.prepare(
      `SELECT city, COUNT(*) as count FROM reports
       WHERE status = 'visible' AND city IS NOT NULL AND city != ''
       GROUP BY city ORDER BY count DESC LIMIT 10`
    ).all(),
    env.DB.prepare(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM reports
       WHERE status = 'visible'
       GROUP BY month ORDER BY month DESC LIMIT 12`
    ).all(),
    env.DB.prepare(
      `SELECT incident_type, COUNT(*) as count FROM reports
       WHERE status = 'visible'
       GROUP BY incident_type ORDER BY count DESC`
    ).all(),
    env.DB.prepare(`SELECT COUNT(*) as total FROM reports WHERE status = 'visible'`).first(),
  ]);

  return jsonResponse({
    total_reports: total ? total.total : 0,
    by_area: (byArea.results || []).reverse(),
    by_month: (byMonth.results || []).reverse(),
    by_type: byType.results || [],
  });
}

async function getSummary(env) {
  const [total, areas, countries] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'visible'`).first(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT city) as c FROM reports WHERE status = 'visible' AND city IS NOT NULL AND city != ''`
    ).first(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT country) as c FROM reports WHERE status = 'visible' AND country IS NOT NULL AND country != ''`
    ).first(),
  ]);
  return {
    total_reports: total ? total.c : 0,
    total_areas: areas ? areas.c : 0,
    total_countries: countries ? countries.c : 0,
  };
}

// ---------------------------------------------------------------------
// Public: map points (aggregated by rounded coordinate, never per-report)
// ---------------------------------------------------------------------
async function handleMap(request, url, env) {
  const type = url.searchParams.get("type") || "";
  const period = url.searchParams.get("period") || "all";

  let dateClause = "";
  if (period === "month") dateClause = "AND created_at >= datetime('now', '-30 days')";
  if (period === "year") dateClause = "AND created_at >= datetime('now', '-12 months')";

  let typeClause = "";
  const binds = [];
  if (type) {
    typeClause = "AND incident_type = ?";
    binds.push(type);
  }

  const query = `
    SELECT city,
           ROUND(latitude, 2) as latitude,
           ROUND(longitude, 2) as longitude,
           COUNT(*) as count
    FROM reports
    WHERE status = 'visible' AND latitude IS NOT NULL AND longitude IS NOT NULL
    ${typeClause} ${dateClause}
    GROUP BY ROUND(latitude, 2), ROUND(longitude, 2)
  `;

  const stmt = binds.length ? env.DB.prepare(query).bind(...binds) : env.DB.prepare(query);
  const { results } = await stmt.all();
  return jsonResponse(results || []);
}

// ---------------------------------------------------------------------
// Admin: login
// ---------------------------------------------------------------------
async function handleAdminLogin(request, env) {
  const body = await safeJson(request);
  const username = (body && body.username || "").trim();
  const password = body && body.password || "";
  if (!username || !password) return jsonResponse({ error: "Username and password are required." }, 400);

  const user = await env.DB.prepare(`SELECT * FROM admin_users WHERE username = ?`).bind(username).first();
  if (!user) return jsonResponse({ error: "Invalid credentials." }, 401);

  const candidateHash = await sha256Hex(user.password_salt + password);
  if (candidateHash !== user.password_hash) return jsonResponse({ error: "Invalid credentials." }, 401);

  const token = await createToken({ sub: user.username, id: user.id, role: "admin" }, env.TOKEN_SECRET);
  return jsonResponse({ token, expires_in: TOKEN_TTL_SECONDS });
}

// ---------------------------------------------------------------------
// Admin: list reports — supports search (description/city) and filters
// (incident type, review status). Reporter identity is only ever shown
// for reports the reporter explicitly chose not to submit anonymously;
// everything else always reads "Anonymous User".
// ---------------------------------------------------------------------
async function handleAdminReports(request, url, env) {
  await requireAdmin(request, env);

  const search = (url.searchParams.get("search") || "").trim();
  const typeFilter = url.searchParams.get("type") || "";
  const statusFilter = url.searchParams.get("status") || "";

  let query = `
    SELECT r.id, r.incident_type, r.city, r.description, r.incident_date, r.incident_time,
           r.created_at, r.status, r.review_status, r.anonymous,
           a.name as reporter_name, a.email as reporter_email,
           (SELECT COUNT(*) FROM evidence_links e WHERE e.report_id = r.id) as evidence_count
    FROM reports r
    LEFT JOIN accounts a ON a.id = r.account_id AND r.anonymous = 0
    WHERE 1=1
  `;
  const binds = [];
  if (search) {
    query += ` AND (r.description LIKE ? OR r.city LIKE ?)`;
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (typeFilter) {
    query += ` AND r.incident_type = ?`;
    binds.push(typeFilter);
  }
  if (statusFilter) {
    query += ` AND r.review_status = ?`;
    binds.push(statusFilter);
  }
  query += ` ORDER BY r.created_at DESC LIMIT 200`;

  const stmt = binds.length ? env.DB.prepare(query).bind(...binds) : env.DB.prepare(query);
  const { results } = await stmt.all();

  const mapped = (results || []).map((r) => ({
    ...r,
    reporter_name: r.reporter_name || "Anonymous User",
    reporter_email: r.reporter_email || null,
  }));
  return jsonResponse(mapped);
}

// ---------------------------------------------------------------------
// Admin: full report detail, including evidence links
// ---------------------------------------------------------------------
async function handleAdminReportDetail(id, request, env) {
  await requireAdmin(request, env);
  const report = await env.DB.prepare(
    `SELECT r.*, a.name as reporter_name, a.email as reporter_email
     FROM reports r LEFT JOIN accounts a ON a.id = r.account_id AND r.anonymous = 0
     WHERE r.id = ?`
  )
    .bind(id)
    .first();
  if (!report) return jsonResponse({ error: "Report not found." }, 404);

  const { results: evidence } = await env.DB.prepare(
    `SELECT id, type, google_drive_url, created_at FROM evidence_links WHERE report_id = ?`
  )
    .bind(id)
    .all();

  return jsonResponse({
    ...report,
    reporter_name: report.reporter_name || "Anonymous User",
    reporter_email: report.reporter_email || null,
    evidence_links: evidence || [],
  });
}

// ---------------------------------------------------------------------
// Admin: update a report's review status (pending/reviewed/verified/archived)
// ---------------------------------------------------------------------
const REVIEW_STATUSES = new Set(["pending", "reviewed", "verified", "archived"]);

async function handleAdminUpdateReportStatus(id, request, env) {
  const admin = await requireAdmin(request, env);
  const body = await safeJson(request);
  if (!REVIEW_STATUSES.has(body.status)) return jsonResponse({ error: "Invalid status." }, 400);

  const report = await env.DB.prepare(`SELECT account_id, anonymous FROM reports WHERE id = ?`).bind(id).first();
  if (!report) return jsonResponse({ error: "Report not found." }, 404);

  await env.DB.prepare(`UPDATE reports SET review_status = ? WHERE id = ?`).bind(body.status, id).run();
  await logAdminAction(env, admin.sub, "update_report_status", "reports", id, body.status);

  // Notify + reward the reporter only if they chose to be identified.
  if (report.account_id && !report.anonymous) {
    if (body.status === "reviewed" || body.status === "verified") {
      await notify(env, report.account_id, "report_reviewed", `Your report has been ${body.status}.`);
    }
    if (body.status === "verified") {
      await adjustTrust(env, report.account_id, TRUST_DELTA.report_verified);
      await awardPoints(env, report.account_id, POINTS.report, "report", "reports", id);
    }
    if (body.status === "archived") {
      await adjustTrust(env, report.account_id, TRUST_DELTA.spam_penalty);
    }
  }

  return jsonResponse({ ok: true });
}

// ---------------------------------------------------------------------
// Admin: delete report
// ---------------------------------------------------------------------
async function handleAdminDeleteReport(id, request, env) {
  const admin = await requireAdmin(request, env);
  const report = await env.DB.prepare(`SELECT account_id, anonymous FROM reports WHERE id = ?`).bind(id).first();
  await env.DB.prepare(`DELETE FROM reports WHERE id = ?`).bind(id).run();
  await logAdminAction(env, admin.sub, "delete_report", "reports", id, null);
  if (report && report.account_id && !report.anonymous) {
    await adjustTrust(env, report.account_id, TRUST_DELTA.spam_penalty);
  }
  return jsonResponse({ ok: true });
}

// =======================================================================
// Safe Places
// =======================================================================
const SAFE_PLACE_CATEGORIES = new Set([
  "police", "hospital", "pharmacy", "safe_shop", "university", "security_point", "trusted_place",
]);

async function handleListSafePlaces(request, url, env) {
  const category = url.searchParams.get("category") || "";
  let query = `SELECT id, name, category, description, latitude, longitude, opening_hours, phone_number, image_url, safety_notes
               FROM safe_places WHERE active = 1`;
  const binds = [];
  if (category && SAFE_PLACE_CATEGORIES.has(category)) {
    query += ` AND category = ?`;
    binds.push(category);
  }
  query += ` ORDER BY name ASC LIMIT 500`;
  const stmt = binds.length ? env.DB.prepare(query).bind(...binds) : env.DB.prepare(query);
  const { results } = await stmt.all();
  return jsonResponse(results || []);
}

async function handleCreateSafePlace(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await safeJson(request);
  const errors = validateSafePlacePayload(body);
  if (errors.length) return jsonResponse({ error: errors.join(" ") }, 400);

  const insert = await env.DB.prepare(
    `INSERT INTO safe_places (name, category, description, latitude, longitude, opening_hours, phone_number, image_url, safety_notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sanitizeText(body.name).slice(0, 150),
      body.category,
      sanitizeText(body.description || "").slice(0, 1000),
      body.latitude,
      body.longitude,
      sanitizeText(body.opening_hours || "").slice(0, 200),
      sanitizeText(body.phone_number || "").slice(0, 40),
      sanitizeText(body.image_url || "").slice(0, 2048),
      sanitizeText(body.safety_notes || "").slice(0, 500),
      admin.id || null
    )
    .run();

  return jsonResponse({ ok: true, id: insert.meta.last_row_id }, 201);
}

async function handleUpdateSafePlace(id, request, env) {
  await requireAdmin(request, env);
  const body = await safeJson(request);
  const errors = validateSafePlacePayload(body, true);
  if (errors.length) return jsonResponse({ error: errors.join(" ") }, 400);

  await env.DB.prepare(
    `UPDATE safe_places SET name = ?, category = ?, description = ?, latitude = ?, longitude = ?,
      opening_hours = ?, phone_number = ?, image_url = ?, safety_notes = ?, active = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      sanitizeText(body.name).slice(0, 150),
      body.category,
      sanitizeText(body.description || "").slice(0, 1000),
      body.latitude,
      body.longitude,
      sanitizeText(body.opening_hours || "").slice(0, 200),
      sanitizeText(body.phone_number || "").slice(0, 40),
      sanitizeText(body.image_url || "").slice(0, 2048),
      sanitizeText(body.safety_notes || "").slice(0, 500),
      body.active === false ? 0 : 1,
      id
    )
    .run();

  return jsonResponse({ ok: true });
}

async function handleDeleteSafePlace(id, request, env) {
  const admin = await requireAdmin(request, env);
  await env.DB.prepare(`DELETE FROM safe_places WHERE id = ?`).bind(id).run();
  await logAdminAction(env, admin.sub, "delete_place", "safe_places", id, null);
  return jsonResponse({ ok: true });
}

function validateSafePlacePayload(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Invalid request body."];
  if (!body.name || typeof body.name !== "string") errors.push("Name is required.");
  if (!body.category || !SAFE_PLACE_CATEGORIES.has(body.category)) errors.push("A valid category is required.");
  if (!isFiniteNumber(body.latitude) || !isFiniteNumber(body.longitude)) errors.push("A valid location is required.");
  if (isFiniteNumber(body.latitude) && isFiniteNumber(body.longitude) && !isInEgypt(body.latitude, body.longitude)) {
    errors.push("Safe Places must be located within Egypt.");
  }
  // Defense in depth: only allow http(s) image URLs, never javascript:/data:
  // schemes, even though the field is also HTML-escaped on every render.
  if (body.image_url && !/^https?:\/\//i.test(body.image_url)) {
    errors.push("Image URL must start with http:// or https://.");
  }
  return errors;
}

// =======================================================================
// Street Ratings
// =======================================================================
// Street segments are identified by rounding coordinates to 3 decimal
// places (~110m grid cells). This is a simple, swappable approximation —
// a future version could snap to real street geometry (e.g. OSM way IDs).
function streetKeyFor(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function computeSafetyScore(row) {
  const dims = [row.lighting, row.crowd_level, row.security_presence, row.camera_coverage, row.public_transport, row.general_feeling];
  const avg = dims.reduce((a, b) => a + b, 0) / dims.length; // 1..5
  return Math.round(((avg - 1) / 4) * 100); // 0..100
}

function scoreLabel(score) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "caution";
  return "needs_caution";
}

async function handleListStreetRatings(request, url, env) {
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const key = streetKeyFor(lat, lng);
    const { results } = await env.DB.prepare(
      `SELECT sr.id, lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling, comment, created_at,
              (SELECT COUNT(*) FROM rating_helpful_votes v WHERE v.rating_id = sr.id) as helpful_count
       FROM street_ratings sr WHERE street_key = ? AND status = 'visible' ORDER BY created_at DESC LIMIT 50`
    )
      .bind(key)
      .all();
    const rows = results || [];
    const confidence = await computeConfidence(env, key);
    if (!rows.length) return jsonResponse({ street_key: key, score: null, count: 0, history: [], confidence: confidence.confidence, verification_count: confidence.verification_count });
    const avgScore = Math.round(rows.map(computeSafetyScore).reduce((a, b) => a + b, 0) / rows.length);
    return jsonResponse({
      street_key: key,
      score: avgScore,
      label: scoreLabel(avgScore),
      count: rows.length,
      confidence: confidence.confidence,
      verification_count: confidence.verification_count,
      history: rows.map((r) => ({ ...r, score: computeSafetyScore(r) })),
    });
  }

  // No specific point requested — return a map overview of rated streets.
  const { results } = await env.DB.prepare(
    `SELECT street_key,
            AVG(latitude) as latitude, AVG(longitude) as longitude, city,
            AVG(lighting) as lighting, AVG(crowd_level) as crowd_level,
            AVG(security_presence) as security_presence, AVG(camera_coverage) as camera_coverage,
            AVG(public_transport) as public_transport, AVG(general_feeling) as general_feeling,
            COUNT(*) as count
     FROM street_ratings WHERE status = 'visible'
     GROUP BY street_key
     LIMIT 500`
  ).all();

  const streets = (results || []).map((r) => {
    const score = computeSafetyScore(r);
    return {
      street_key: r.street_key,
      latitude: r.latitude,
      longitude: r.longitude,
      city: r.city,
      score,
      label: scoreLabel(score),
      count: r.count,
    };
  });
  return jsonResponse(streets);
}

async function handleCreateStreetRating(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ipHash = await sha256Hex(ip);

  const body = await safeJson(request);
  const errors = validateStreetRatingPayload(body);
  if (errors.length) return jsonResponse({ error: errors.join(" ") }, 400);

  const key = streetKeyFor(body.latitude, body.longitude);

  // Spam prevention: one rating per hashed IP per street per rolling 24h.
  const recent = await env.DB.prepare(
    `SELECT id FROM street_ratings WHERE street_key = ? AND ip_hash = ? AND created_at >= datetime('now', '-1 day')`
  )
    .bind(key, ipHash)
    .first();
  if (recent) return jsonResponse({ error: "You've already rated this street recently. Try again tomorrow." }, 429);

  const user = await getOptionalUser(request, env);

  const insert = await env.DB.prepare(
    `INSERT INTO street_ratings
      (street_key, latitude, longitude, city, lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling, comment, ip_hash, account_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      key,
      body.latitude,
      body.longitude,
      sanitizeText(body.city || "").slice(0, 120),
      body.lighting,
      body.crowd_level,
      body.security_presence,
      body.camera_coverage,
      body.public_transport,
      body.general_feeling,
      sanitizeText(body.comment || "").slice(0, 500),
      ipHash,
      user ? user.accountId : null
    )
    .run();

  if (user) {
    await awardPoints(env, user.accountId, POINTS.street_rating, "street_rating", "street_ratings", insert.meta.last_row_id);
  }

  return jsonResponse({ ok: true, street_key: key }, 201);
}

function validateStreetRatingPayload(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Invalid request body."];
  if (!isFiniteNumber(body.latitude) || !isFiniteNumber(body.longitude)) errors.push("A valid location is required.");
  if (isFiniteNumber(body.latitude) && isFiniteNumber(body.longitude) && !isInEgypt(body.latitude, body.longitude)) {
    errors.push("Street ratings are currently limited to Egypt.");
  }
  for (const field of ["lighting", "crowd_level", "security_presence", "camera_coverage", "public_transport", "general_feeling"]) {
    const v = body[field];
    if (!Number.isInteger(v) || v < 1 || v > 5) errors.push(`${field} must be a rating from 1 to 5.`);
  }
  return errors;
}

async function handleAdminStreetRatings(request, url, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    `SELECT id, street_key, city, lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling, comment, status, created_at
     FROM street_ratings ORDER BY created_at DESC LIMIT 200`
  ).all();
  return jsonResponse((results || []).map((r) => ({ ...r, score: computeSafetyScore(r) })));
}

async function handleAdminDeleteStreetRating(id, request, env) {
  const admin = await requireAdmin(request, env);
  const rating = await env.DB.prepare(`SELECT account_id FROM street_ratings WHERE id = ?`).bind(id).first();
  await env.DB.prepare(`UPDATE street_ratings SET status = 'hidden' WHERE id = ?`).bind(id).run();
  await logAdminAction(env, admin.sub, "hide_street_rating", "street_ratings", id, null);
  if (rating && rating.account_id) await adjustTrust(env, rating.account_id, TRUST_DELTA.spam_penalty);
  return jsonResponse({ ok: true });
}

// =======================================================================
// Community Alerts
// =======================================================================
// Alerts are computed live from recent report density, grouped by the same
// rounded-coordinate bucket used on the public map — never from individual
// report content, and never returned alongside report IDs or descriptions.
const ALERT_WINDOW_DAYS = 7;
const ALERT_THRESHOLD = 3;
const ALERT_ELEVATED_THRESHOLD = 6;

async function handleCommunityAlerts(request, url, env) {
  const { results } = await env.DB.prepare(
    `SELECT city,
            ROUND(latitude, 2) as latitude,
            ROUND(longitude, 2) as longitude,
            COUNT(*) as count
     FROM reports
     WHERE status = 'visible' AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND created_at >= datetime('now', ?)
     GROUP BY ROUND(latitude, 2), ROUND(longitude, 2)
     HAVING COUNT(*) >= ?`
  )
    .bind(`-${ALERT_WINDOW_DAYS} days`, ALERT_THRESHOLD)
    .all();

  const alerts = (results || []).map((r) => ({
    area_key: `${r.latitude},${r.longitude}`,
    latitude: r.latitude,
    longitude: r.longitude,
    city: r.city,
    report_count: r.count,
    window_days: ALERT_WINDOW_DAYS,
    severity: r.count >= ALERT_ELEVATED_THRESHOLD ? "elevated" : "notice",
  }));

  // Best-effort cache refresh for the admin dashboard; failures here must
  // never break the public response.
  try {
    await env.DB.prepare(`DELETE FROM community_alerts`).run();
    for (const a of alerts) {
      await env.DB.prepare(
        `INSERT INTO community_alerts (area_key, latitude, longitude, city, report_count, window_days, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(a.area_key, a.latitude, a.longitude, a.city, a.report_count, a.window_days, a.severity)
        .run();
    }
  } catch (_) {
    /* non-fatal */
  }

  return jsonResponse(alerts);
}

// =======================================================================
// Safer Route
// =======================================================================
// Fetches alternative routes from the public OSRM demo routing engine,
// then re-ranks them using local safety signals (street ratings + recent
// report density along the route). This scoring function is intentionally
// simple and isolated in scoreRouteSafety() so it can be improved later
// (e.g. snapping to real street segments, weighting by time-of-day).
async function handleSafeRoute(request, url, env) {
  const startLat = parseFloat(url.searchParams.get("start_lat"));
  const startLng = parseFloat(url.searchParams.get("start_lng"));
  const endLat = parseFloat(url.searchParams.get("end_lat"));
  const endLng = parseFloat(url.searchParams.get("end_lng"));
  const mode = url.searchParams.get("mode") === "safer" ? "safer" : "shortest";

  if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) {
    return jsonResponse({ error: "start_lat, start_lng, end_lat, end_lng are required." }, 400);
  }
  if (!isInEgypt(startLat, startLng) || !isInEgypt(endLat, endLng)) {
    return jsonResponse({ error: "Safer Route currently only covers Egypt." }, 400);
  }

  const cacheKey = await sha256Hex(`${startLat},${startLng},${endLat},${endLng},${mode}`);
  const cached = await env.DB.prepare(
    `SELECT route_json FROM safe_routes_cache WHERE cache_key = ? AND created_at >= datetime('now', '-1 hour')`
  )
    .bind(cacheKey)
    .first();
  if (cached) return jsonResponse(JSON.parse(cached.route_json));

  const osrmUrl =
    `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}` +
    `?alternatives=true&overview=full&geometries=geojson`;

  let osrmData;
  try {
    const res = await fetch(osrmUrl, { headers: { "User-Agent": "HerSafe/1.0" } });
    osrmData = await res.json();
  } catch (err) {
    return jsonResponse({ error: "Routing service is temporarily unavailable. Please try again." }, 502);
  }

  if (!osrmData || osrmData.code !== "Ok" || !Array.isArray(osrmData.routes) || !osrmData.routes.length) {
    return jsonResponse({ error: "No route could be found between these points." }, 404);
  }

  const routes = osrmData.routes;
  let chosen = routes[0];
  let chosenSafety = null;

  if (mode === "shortest") {
    chosen = routes.reduce((a, b) => (a.distance <= b.distance ? a : b));
  } else {
    const scored = await Promise.all(
      routes.map(async (r) => ({ route: r, safety: await scoreRouteSafety(r, env) }))
    );
    scored.sort((a, b) => {
      // Prefer higher safety score; use distance as a tiebreaker so the
      // result doesn't wildly detour for a marginal safety gain.
      if (Math.abs(a.safety.score - b.safety.score) > 5) return b.safety.score - a.safety.score;
      return a.route.distance - b.route.distance;
    });
    chosen = scored[0].route;
    chosenSafety = scored[0].safety;
  }

  const result = {
    mode,
    distance_meters: Math.round(chosen.distance),
    duration_seconds: Math.round(chosen.duration),
    geometry: chosen.geometry,
    safety: chosenSafety,
    alternatives_considered: routes.length,
  };

  try {
    await env.DB.prepare(
      `INSERT INTO safe_routes_cache (cache_key, start_lat, start_lng, end_lat, end_lng, mode, route_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET route_json = excluded.route_json, created_at = datetime('now')`
    )
      .bind(cacheKey, startLat, startLng, endLat, endLng, mode, JSON.stringify(result))
      .run();
  } catch (_) {
    /* non-fatal */
  }

  return jsonResponse(result);
}

async function scoreRouteSafety(route, env) {
  const coords = (route.geometry && route.geometry.coordinates) || [];
  if (!coords.length) return { score: 50, samples: 0 };

  // Sample up to 12 evenly-spaced points along the route to keep this fast.
  const step = Math.max(1, Math.floor(coords.length / 12));
  const samples = [];
  for (let i = 0; i < coords.length; i += step) samples.push(coords[i]);

  let ratingTotal = 0;
  let ratingCount = 0;
  let reportPenalty = 0;

  for (const [lng, lat] of samples) {
    const key = streetKeyFor(lat, lng);
    const rating = await env.DB.prepare(
      `SELECT lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling
       FROM street_ratings WHERE street_key = ? AND status = 'visible'`
    )
      .bind(key)
      .first();
    if (rating) {
      ratingTotal += computeSafetyScore(rating);
      ratingCount += 1;
    }

    const recentReports = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM reports
       WHERE status = 'visible' AND ROUND(latitude, 2) = ROUND(?, 2) AND ROUND(longitude, 2) = ROUND(?, 2)
         AND created_at >= datetime('now', '-90 days')`
    )
      .bind(lat, lng)
      .first();
    reportPenalty += recentReports ? Math.min(recentReports.c, 5) : 0;
  }

  const ratingScore = ratingCount ? ratingTotal / ratingCount : 60; // neutral default when unrated
  const penalty = Math.min((reportPenalty / samples.length) * 15, 40);
  const score = Math.max(0, Math.min(100, Math.round(ratingScore - penalty)));

  return { score, samples: samples.length, rated_samples: ratingCount, report_penalty: Math.round(penalty) };
}

// =======================================================================
// Admin dashboard summary
// =======================================================================
async function handleAdminDashboardSummary(request, env) {
  await requireAdmin(request, env);
  const [reports, safePlaces, ratings, alerts, users, anonReports] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'visible'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM safe_places WHERE active = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM street_ratings WHERE status = 'visible'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM community_alerts`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM accounts`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'visible' AND (account_id IS NULL OR anonymous = 1)`).first(),
  ]);

  const { results: riskiest } = await env.DB.prepare(
    `SELECT street_key, city,
            AVG(lighting) as lighting, AVG(crowd_level) as crowd_level, AVG(security_presence) as security_presence,
            AVG(camera_coverage) as camera_coverage, AVG(public_transport) as public_transport, AVG(general_feeling) as general_feeling,
            COUNT(*) as count
     FROM street_ratings WHERE status = 'visible' GROUP BY street_key HAVING COUNT(*) >= 1`
  ).all();

  const scored = (riskiest || []).map((r) => ({ street_key: r.street_key, city: r.city, count: r.count, score: computeSafetyScore(r) }));
  scored.sort((a, b) => a.score - b.score);

  const { results: topContributors } = await env.DB.prepare(
    `SELECT a.name, COALESCE(SUM(p.amount), 0) as points
     FROM accounts a LEFT JOIN user_points p ON p.account_id = a.id
     GROUP BY a.id ORDER BY points DESC LIMIT 5`
  ).all();

  return jsonResponse({
    total_reports: reports ? reports.c : 0,
    total_safe_places: safePlaces ? safePlaces.c : 0,
    total_street_ratings: ratings ? ratings.c : 0,
    total_active_alerts: alerts ? alerts.c : 0,
    total_registered_users: users ? users.c : 0,
    // "Guests" aren't individually trackable (no accounts, by design) —
    // this is a proxy count of anonymous/unattributed report submissions.
    total_anonymous_reports: anonReports ? anonReports.c : 0,
    riskiest_streets: scored.slice(0, 5),
    safest_streets: scored.slice(-5).reverse(),
    top_contributors: topContributors || [],
  });
}

// =======================================================================
// Accounts / auth (optional — guests can do everything without one)
// =======================================================================
function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleRegister(request, env) {
  const body = await safeJson(request);
  const name = sanitizeText((body.name || "").trim()).slice(0, 100);
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  const errors = [];
  if (!name) errors.push("Name is required.");
  if (!validateEmail(email)) errors.push("A valid email is required.");
  if (!password || password.length < 8) errors.push("Password must be at least 8 characters.");
  if (errors.length) return jsonResponse({ error: errors.join(" ") }, 400);

  const existing = await env.DB.prepare(`SELECT id FROM accounts WHERE email = ?`).bind(email).first();
  if (existing) return jsonResponse({ error: "An account with this email already exists." }, 409);

  const salt = crypto.randomUUID();
  const hash = await sha256Hex(salt + password);

  const insert = await env.DB.prepare(
    `INSERT INTO accounts (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)`
  )
    .bind(name, email, hash, salt)
    .run();
  const accountId = insert.meta.last_row_id;

  await env.DB.prepare(`INSERT INTO user_trust (account_id, score, level) VALUES (?, ?, ?)`)
    .bind(accountId, TRUST_DEFAULT, trustLevelFor(TRUST_DEFAULT))
    .run();

  const token = await createToken({ accountId, name, role: "user" }, env.TOKEN_SECRET);
  return jsonResponse({ token, expires_in: TOKEN_TTL_SECONDS, name, email }, 201);
}

async function handleLogin(request, env) {
  const body = await safeJson(request);
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return jsonResponse({ error: "Email and password are required." }, 400);

  const account = await env.DB.prepare(`SELECT * FROM accounts WHERE email = ?`).bind(email).first();
  if (!account) return jsonResponse({ error: "Invalid credentials." }, 401);

  const candidateHash = await sha256Hex(account.password_salt + password);
  if (candidateHash !== account.password_hash) return jsonResponse({ error: "Invalid credentials." }, 401);

  const token = await createToken({ accountId: account.id, name: account.name, role: "user" }, env.TOKEN_SECRET);
  return jsonResponse({ token, expires_in: TOKEN_TTL_SECONDS, name: account.name, email: account.email });
}

async function handleProfile(request, env) {
  const user = await requireUser(request, env);
  const account = await env.DB.prepare(`SELECT id, name, email, created_at FROM accounts WHERE id = ?`)
    .bind(user.accountId)
    .first();
  if (!account) return jsonResponse({ error: "Account not found." }, 404);

  const [trust, pointsTotal, reportsCount, ratingsCount, helpfulReceived, badges] = await Promise.all([
    env.DB.prepare(`SELECT score, level FROM user_trust WHERE account_id = ?`).bind(account.id).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM user_points WHERE account_id = ?`).bind(account.id).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM reports WHERE account_id = ? AND anonymous = 0`).bind(account.id).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM street_ratings WHERE account_id = ?`).bind(account.id).first(),
    env.DB.prepare(
      `SELECT COUNT(*) as c FROM rating_helpful_votes v
       JOIN street_ratings sr ON sr.id = v.rating_id WHERE sr.account_id = ?`
    ).bind(account.id).first(),
    env.DB.prepare(`SELECT badge_key, awarded_at FROM user_badges WHERE account_id = ? ORDER BY awarded_at DESC`).bind(account.id).all(),
  ]);

  return jsonResponse({
    name: account.name,
    email: account.email,
    member_since: account.created_at,
    points: pointsTotal ? pointsTotal.total : 0,
    trust_score: trust ? trust.score : TRUST_DEFAULT,
    trust_level: trust ? trust.level : trustLevelFor(TRUST_DEFAULT),
    reports_submitted: reportsCount ? reportsCount.c : 0,
    street_ratings_submitted: ratingsCount ? ratingsCount.c : 0,
    helpful_votes_received: helpfulReceived ? helpfulReceived.c : 0,
    badges: (badges.results || []).map((b) => b.badge_key),
  });
}

async function handleLeaderboard(request, url, env) {
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);
  const { results } = await env.DB.prepare(
    `SELECT a.name, COALESCE(SUM(p.amount), 0) as points, COALESCE(t.level, 'new_member') as level
     FROM accounts a
     LEFT JOIN user_points p ON p.account_id = a.id
     LEFT JOIN user_trust t ON t.account_id = a.id
     GROUP BY a.id ORDER BY points DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return jsonResponse(results || []);
}

async function handleUserPoints(request, env) {
  const user = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `SELECT amount, reason, ref_table, ref_id, created_at FROM user_points WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`
  )
    .bind(user.accountId)
    .all();
  return jsonResponse(results || []);
}

async function handleUserBadges(request, env) {
  const user = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `SELECT badge_key, awarded_at FROM user_badges WHERE account_id = ? ORDER BY awarded_at DESC`
  )
    .bind(user.accountId)
    .all();
  return jsonResponse(results || []);
}

// -----------------------------------------------------------------------
// Gamification helpers — points ledger, trust score, badge thresholds.
// Centralized here so every action that earns points goes through the
// same accounting + notification + badge-check path.
// -----------------------------------------------------------------------
async function awardPoints(env, accountId, amount, reason, refTable, refId) {
  await env.DB.prepare(
    `INSERT INTO user_points (account_id, amount, reason, ref_table, ref_id) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(accountId, amount, reason, refTable || null, refId || null)
    .run();
  await notify(env, accountId, "points_earned", `You earned ${amount} points.`);
  await checkAndAwardBadges(env, accountId);
}

async function adjustTrust(env, accountId, delta) {
  const row = await env.DB.prepare(`SELECT score FROM user_trust WHERE account_id = ?`).bind(accountId).first();
  const current = row ? row.score : TRUST_DEFAULT;
  const next = Math.max(0, Math.min(100, current + delta));
  const level = trustLevelFor(next);
  await env.DB.prepare(
    `INSERT INTO user_trust (account_id, score, level, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET score = excluded.score, level = excluded.level, updated_at = datetime('now')`
  )
    .bind(accountId, next, level)
    .run();
}

async function checkAndAwardBadges(env, accountId) {
  const [pointsRow, reportsRow, ratingsRow, trustRow, helpfulRow] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM user_points WHERE account_id = ?`).bind(accountId).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM reports WHERE account_id = ? AND anonymous = 0`).bind(accountId).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT street_key) as c FROM street_ratings WHERE account_id = ?`).bind(accountId).first(),
    env.DB.prepare(`SELECT score FROM user_trust WHERE account_id = ?`).bind(accountId).first(),
    env.DB.prepare(
      `SELECT COUNT(*) as c FROM rating_helpful_votes v JOIN street_ratings sr ON sr.id = v.rating_id WHERE sr.account_id = ?`
    ).bind(accountId).first(),
  ]);

  const totalPoints = pointsRow ? pointsRow.total : 0;
  const reportCount = reportsRow ? reportsRow.c : 0;
  const streetCount = ratingsRow ? ratingsRow.c : 0;
  const trustScore = trustRow ? trustRow.score : TRUST_DEFAULT;
  const helpfulCount = helpfulRow ? helpfulRow.c : 0;

  const toAward = [];
  if (reportCount >= 1) toAward.push("first_report");
  if (streetCount >= 5) toAward.push("street_explorer");
  if (trustScore >= 70) toAward.push("trusted_reporter");
  if (helpfulCount >= 10) toAward.push("safety_helper");
  if (totalPoints >= 750) toAward.push("top_contributor");
  BADGE_POINTS_TIERS.forEach((tier) => { if (totalPoints >= tier.min) toAward.push(tier.key); });

  for (const key of toAward) {
    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO user_badges (account_id, badge_key) VALUES (?, ?)`
      )
        .bind(accountId, key)
        .run();
      if (result.meta.changes > 0) {
        await notify(env, accountId, "badge_earned", `You earned the "${key.replace(/_/g, " ")}" badge!`);
      }
    } catch (_) {
      /* non-fatal */
    }
  }
}

async function notify(env, accountId, type, message) {
  try {
    await env.DB.prepare(`INSERT INTO notifications (account_id, type, message) VALUES (?, ?, ?)`)
      .bind(accountId, type, message)
      .run();
  } catch (_) {
    /* non-fatal */
  }
}

async function logAdminAction(env, adminUsername, action, targetTable, targetId, details) {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_logs (admin_username, action, target_table, target_id, details) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(adminUsername, action, targetTable || null, targetId || null, details || null)
      .run();
  } catch (_) {
    /* non-fatal */
  }
}

// =======================================================================
// Community verification ("Do you agree with this rating?")
// =======================================================================
async function handleVerifyRating(request, env) {
  const user = await requireUser(request, env);
  const body = await safeJson(request);
  const streetKey = (body.street_key || "").trim();
  const response = body.response;

  if (!streetKey) return jsonResponse({ error: "street_key is required." }, 400);
  if (!["yes", "partially", "no"].includes(response)) return jsonResponse({ error: "Invalid response." }, 400);

  try {
    await env.DB.prepare(
      `INSERT INTO street_verification (street_key, account_id, response) VALUES (?, ?, ?)`
    )
      .bind(streetKey, user.accountId, response)
      .run();
  } catch (_) {
    return jsonResponse({ error: "You've already verified this street." }, 409);
  }

  await awardPoints(env, user.accountId, POINTS.verification, "verification", "street_verification", null);

  return jsonResponse(await computeConfidence(env, streetKey), 201);
}

async function computeConfidence(env, streetKey) {
  const { results } = await env.DB.prepare(
    `SELECT response, COUNT(*) as c FROM street_verification WHERE street_key = ? GROUP BY response`
  )
    .bind(streetKey)
    .all();
  const counts = { yes: 0, partially: 0, no: 0 };
  (results || []).forEach((r) => { counts[r.response] = r.c; });
  const total = counts.yes + counts.partially + counts.no;
  const confidence = total ? Math.round(((counts.yes + counts.partially * 0.5) / total) * 100) : null;
  return { street_key: streetKey, confidence, verification_count: total, breakdown: counts };
}

// =======================================================================
// Helpful votes on street ratings
// =======================================================================
async function handleHelpfulVote(ratingId, request, env) {
  const user = await requireUser(request, env);

  const rating = await env.DB.prepare(`SELECT id, account_id FROM street_ratings WHERE id = ?`).bind(ratingId).first();
  if (!rating) return jsonResponse({ error: "Rating not found." }, 404);

  try {
    await env.DB.prepare(`INSERT INTO rating_helpful_votes (rating_id, account_id) VALUES (?, ?)`)
      .bind(ratingId, user.accountId)
      .run();
  } catch (_) {
    return jsonResponse({ error: "You've already voted on this rating." }, 409);
  }

  if (rating.account_id) {
    await awardPoints(env, rating.account_id, POINTS.helpful_received, "helpful_received", "street_ratings", ratingId);
    await adjustTrust(env, rating.account_id, TRUST_DELTA.helpful_vote);
  }

  const countRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM rating_helpful_votes WHERE rating_id = ?`)
    .bind(ratingId)
    .first();
  return jsonResponse({ ok: true, helpful_count: countRow ? countRow.c : 0 });
}

// =======================================================================
// Street details page
// =======================================================================
async function handleStreetDetails(request, url, env) {
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return jsonResponse({ error: "lat and lng are required." }, 400);

  const key = streetKeyFor(lat, lng);

  const { results: ratings } = await env.DB.prepare(
    `SELECT lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling, city
     FROM street_ratings WHERE street_key = ? AND status = 'visible'`
  )
    .bind(key)
    .all();

  const rows = ratings || [];
  const avg = (field) => (rows.length ? Math.round((rows.reduce((s, r) => s + r[field], 0) / rows.length) * 20) : null); // scale 1-5 -> /100

  const reportsCount = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM reports WHERE status = 'visible' AND ROUND(latitude, 2) = ROUND(?, 2) AND ROUND(longitude, 2) = ROUND(?, 2)`
  )
    .bind(lat, lng)
    .first();

  const nearbyPlaces = await env.DB.prepare(
    `SELECT name, category, latitude, longitude FROM safe_places
     WHERE active = 1 AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
     LIMIT 10`
  )
    .bind(lat - 0.01, lat + 0.01, lng - 0.01, lng + 0.01)
    .all();

  const overallScore = rows.length ? computeSafetyScore({
    lighting: rows.reduce((s, r) => s + r.lighting, 0) / rows.length,
    crowd_level: rows.reduce((s, r) => s + r.crowd_level, 0) / rows.length,
    security_presence: rows.reduce((s, r) => s + r.security_presence, 0) / rows.length,
    camera_coverage: rows.reduce((s, r) => s + r.camera_coverage, 0) / rows.length,
    public_transport: rows.reduce((s, r) => s + r.public_transport, 0) / rows.length,
    general_feeling: rows.reduce((s, r) => s + r.general_feeling, 0) / rows.length,
  }) : null;

  const confidence = await computeConfidence(env, key);

  return jsonResponse({
    street_key: key,
    city: rows[0]?.city || null,
    safety_score: overallScore,
    confidence: confidence.confidence,
    report_count: reportsCount ? reportsCount.c : 0,
    rating_count: rows.length,
    lighting_score: avg("lighting"),
    camera_score: avg("camera_coverage"),
    crowd_score: avg("crowd_level"),
    nearby_safe_places: nearbyPlaces.results || [],
  });
}

// =======================================================================
// Notifications
// =======================================================================
async function handleListNotifications(request, env) {
  const user = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `SELECT id, type, message, read_at, created_at FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(user.accountId)
    .all();
  const unread = (results || []).filter((n) => !n.read_at).length;
  return jsonResponse({ notifications: results || [], unread_count: unread });
}

async function handleMarkNotificationRead(id, request, env) {
  const user = await requireUser(request, env);
  await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND account_id = ?`)
    .bind(id, user.accountId)
    .run();
  return jsonResponse({ ok: true });
}

// ---------------------------------------------------------------------
// Auth helpers — lightweight signed tokens (HMAC-SHA256, no external deps)
// ---------------------------------------------------------------------
async function createToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const fullPayload = { ...payload, exp };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const signature = await hmacSha256(`${headerB64}.${payloadB64}`, secret);
  return `${headerB64}.${payloadB64}.${signature}`;
}

async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw httpError(401, "Invalid token.");
  const [headerB64, payloadB64, signature] = parts;
  const expected = await hmacSha256(`${headerB64}.${payloadB64}`, secret);
  if (expected !== signature) throw httpError(401, "Invalid token.");
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw httpError(401, "Token expired.");
  return payload;
}

async function requireAdmin(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw httpError(401, "Missing authorization.");
  const payload = await verifyToken(match[1], env.TOKEN_SECRET);
  if (payload.role !== "admin") throw httpError(403, "Admin access required.");
  return payload;
}

// Requires a signed-in user account (not a guest). Throws 401 if absent.
async function requireUser(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw httpError(401, "Sign in required.");
  const payload = await verifyToken(match[1], env.TOKEN_SECRET);
  if (payload.role !== "user") throw httpError(403, "User access required.");
  return payload; // { accountId, name, role, exp }
}

// Best-effort user lookup for endpoints usable by both guests and signed-in
// users (reports, street ratings). Never throws — returns null for guests
// or invalid/expired tokens, since those callers should still succeed.
async function getOptionalUser(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const payload = await verifyToken(match[1], env.TOKEN_SECRET);
    return payload.role === "user" ? payload : null;
  } catch (_) {
    return null;
  }
}

async function hmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64urlFromBuffer(sig);
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(str) {
  return base64urlFromBuffer(new TextEncoder().encode(str));
}

function base64urlFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------
// Rate limiting (D1-backed, hourly buckets, hashed IP only)
// ---------------------------------------------------------------------
async function enforceRateLimit(env, ipHash) {
  const bucket = new Date().toISOString().slice(0, 13); // e.g. 2026-08-05T14
  const limitSetting = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'rate_limit_per_hour'`).first();
  const limit = limitSetting ? Number(limitSetting.value) : RATE_LIMIT_PER_HOUR_DEFAULT;

  const row = await env.DB.prepare(`SELECT count FROM rate_limits WHERE ip_hash = ? AND bucket = ?`)
    .bind(ipHash, bucket)
    .first();

  if (row && row.count >= limit) {
    throw httpError(429, "Too many reports submitted recently. Please try again later.");
  }

  if (row) {
    await env.DB.prepare(`UPDATE rate_limits SET count = count + 1 WHERE ip_hash = ? AND bucket = ?`)
      .bind(ipHash, bucket)
      .run();
  } else {
    await env.DB.prepare(`INSERT INTO rate_limits (ip_hash, bucket, count) VALUES (?, ?, 1)`)
      .bind(ipHash, bucket)
      .run();
  }
}

// ---------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function appendHeaders(response, headers) {
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
}

function buildCorsHeaders(env, request) {
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

function sanitizeText(str) {
  return String(str)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
