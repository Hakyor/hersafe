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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
