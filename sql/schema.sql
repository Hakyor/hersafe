-- HerSafe D1 schema
-- Designed to stay stable even as the platform grows into React, R2 evidence
-- storage, push notifications, PWA install, real auth, or a native app.
-- No table stores names, photos, or other identifying details of any person.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- users: reserved for a future optional-account layer (e.g. saved areas,
-- notification preferences). Left empty and unused by the current
-- anonymous-first product. No PII beyond a hashed device/session key.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  anon_key      TEXT UNIQUE,                 -- hashed client-generated key, optional
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- incident_types: the controlled vocabulary shown in the report form,
-- map filters, and statistics breakdowns. Editable by admins.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT NOT NULL UNIQUE,        -- e.g. 'verbal_harassment'
  label_en      TEXT NOT NULL,
  label_ar      TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,  -- 0/1
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- locations: known named areas used to bucket ad-hoc report coordinates
-- into a stable city/region label for aggregation on the map.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  city          TEXT NOT NULL,
  region        TEXT,
  country       TEXT,
  latitude      REAL NOT NULL,
  longitude     REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations (latitude, longitude);

-- ---------------------------------------------------------------------
-- reports: the core anonymous incident report. Never stores a name,
-- face, contact detail, or any identifier of a reporter or a subject.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_type   TEXT NOT NULL REFERENCES incident_types(key),
  description     TEXT,                       -- free text, max 2000 chars, sanitized
  latitude        REAL,
  longitude       REAL,
  city            TEXT,
  country         TEXT,
  incident_date   TEXT,                        -- ISO date, optional
  incident_time   TEXT,                         -- HH:MM, optional
  anonymous       INTEGER NOT NULL DEFAULT 1,   -- always 1 in current product; reserved for future
  status          TEXT NOT NULL DEFAULT 'visible', -- 'visible' | 'hidden' (spam/removed)
  ip_hash         TEXT,                         -- SHA-256 of submitting IP, for rate-limit/anti-spam ONLY
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports (incident_type);
CREATE INDEX IF NOT EXISTS idx_reports_city ON reports (city);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

-- ---------------------------------------------------------------------
-- evidence_links: user-supplied Google Drive links only. We never host
-- or copy the underlying file; only the URL text is stored.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id     INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('image','video','audio')),
  google_drive_url TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_report ON evidence_links (report_id);

-- ---------------------------------------------------------------------
-- statistics: a lightweight daily snapshot cache so the Statistics page
-- can load instantly without recomputing aggregates on every request.
-- Refreshed by the Worker on a schedule or lazily on read.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS statistics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date   TEXT NOT NULL,
  total_reports   INTEGER NOT NULL DEFAULT 0,
  total_areas     INTEGER NOT NULL DEFAULT 0,
  total_countries INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_statistics_date ON statistics (snapshot_date);

-- ---------------------------------------------------------------------
-- admin_users: password-protected admin panel accounts.
-- Passwords are stored as salt + SHA-256(salt || password) only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- settings: small key/value store for platform configuration
-- (e.g. rate-limit thresholds, feature flags for the future roadmap).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- rate_limits: minimal anti-abuse table (hashed IP + time bucket only).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash       TEXT NOT NULL,
  bucket        TEXT NOT NULL,  -- e.g. '2026-08-05T14' (hour bucket)
  count         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, bucket)
);
