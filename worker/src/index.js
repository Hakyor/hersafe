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
 */

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

  const insert = await env.DB.prepare(
    `INSERT INTO reports (incident_type, description, latitude, longitude, city, country, incident_date, incident_time, anonymous, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  )
    .bind(body.incident_type, description, lat, lng, city, SERVICE_COUNTRY, body.date || null, body.time || null, ipHash)
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

  const token = await createToken({ sub: user.username, id: user.id }, env.TOKEN_SECRET);
  return jsonResponse({ token, expires_in: TOKEN_TTL_SECONDS });
}

// ---------------------------------------------------------------------
// Admin: list reports (full fields, still no PII because none is stored)
// ---------------------------------------------------------------------
async function handleAdminReports(request, url, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.incident_type, r.city, r.description, r.incident_date, r.incident_time,
            r.created_at, r.status,
            (SELECT COUNT(*) FROM evidence_links e WHERE e.report_id = r.id) as evidence_count
     FROM reports r
     ORDER BY r.created_at DESC
     LIMIT 200`
  ).all();
  return jsonResponse(results || []);
}

// ---------------------------------------------------------------------
// Admin: delete report
// ---------------------------------------------------------------------
async function handleAdminDeleteReport(id, request, env) {
  await requireAdmin(request, env);
  await env.DB.prepare(`DELETE FROM reports WHERE id = ?`).bind(id).run();
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
  await requireAdmin(request, env);
  await env.DB.prepare(`DELETE FROM safe_places WHERE id = ?`).bind(id).run();
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
      `SELECT lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling, comment, created_at
       FROM street_ratings WHERE street_key = ? AND status = 'visible' ORDER BY created_at DESC LIMIT 50`
    )
      .bind(key)
      .all();
    const rows = results || [];
    if (!rows.length) return jsonResponse({ street_key: key, score: null, count: 0, history: [] });
    const avgScore = Math.round(rows.map(computeSafetyScore).reduce((a, b) => a + b, 0) / rows.length);
    return jsonResponse({
      street_key: key,
      score: avgScore,
      label: scoreLabel(avgScore),
      count: rows.length,
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

  await env.DB.prepare(
    `INSERT INTO street_ratings
      (street_key, latitude, longitude, city, lighting, crowd_level, security_presence, camera_coverage, public_transport, general_feeling, comment, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      ipHash
    )
    .run();

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
  await requireAdmin(request, env);
  await env.DB.prepare(`UPDATE street_ratings SET status = 'hidden' WHERE id = ?`).bind(id).run();
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
  const [reports, safePlaces, ratings, alerts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'visible'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM safe_places WHERE active = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM street_ratings WHERE status = 'visible'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM community_alerts`).first(),
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

  return jsonResponse({
    total_reports: reports ? reports.c : 0,
    total_safe_places: safePlaces ? safePlaces.c : 0,
    total_street_ratings: ratings ? ratings.c : 0,
    total_active_alerts: alerts ? alerts.c : 0,
    riskiest_streets: scored.slice(0, 5),
    safest_streets: scored.slice(-5).reverse(),
  });
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
  return verifyToken(match[1], env.TOKEN_SECRET);
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
