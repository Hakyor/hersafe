-- HerSafe migration 0002: Safe Places, Street Ratings, Community Alerts, Safer Route
-- Apply with:
--   wrangler d1 execute hersafe-db --remote --file=./sql/0002_features.sql --config=worker/wrangler.toml

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- safe_places: admin-curated points of trust (police, hospitals, etc).
-- Never stores personal data about any visitor — only facts about a place.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safe_places (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN (
                  'police', 'hospital', 'pharmacy', 'safe_shop',
                  'university', 'security_point', 'trusted_place'
                )),
  description   TEXT,
  latitude      REAL NOT NULL,
  longitude     REAL NOT NULL,
  opening_hours TEXT,
  phone_number  TEXT,
  image_url     TEXT,
  safety_notes  TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER REFERENCES admin_users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_safe_places_category ON safe_places (category);
CREATE INDEX IF NOT EXISTS idx_safe_places_coords ON safe_places (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_safe_places_active ON safe_places (active);

-- ---------------------------------------------------------------------
-- street_ratings: anonymous, per-visit safety perception ratings of a
-- street/area. Bucketed by rounded coordinates so many ratings of the
-- "same" street aggregate together. No identity is ever stored — only
-- a hashed IP for spam prevention, same pattern as reports.rate_limits.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS street_ratings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  street_key          TEXT NOT NULL,   -- rounded "lat,lng" bucket, e.g. "30.06,31.24"
  latitude            REAL NOT NULL,
  longitude           REAL NOT NULL,
  city                TEXT,
  lighting            INTEGER NOT NULL CHECK (lighting BETWEEN 1 AND 5),
  crowd_level         INTEGER NOT NULL CHECK (crowd_level BETWEEN 1 AND 5),
  security_presence   INTEGER NOT NULL CHECK (security_presence BETWEEN 1 AND 5),
  camera_coverage     INTEGER NOT NULL CHECK (camera_coverage BETWEEN 1 AND 5),
  public_transport    INTEGER NOT NULL CHECK (public_transport BETWEEN 1 AND 5),
  general_feeling     INTEGER NOT NULL CHECK (general_feeling BETWEEN 1 AND 5),
  comment             TEXT,
  status              TEXT NOT NULL DEFAULT 'visible', -- 'visible' | 'hidden' (admin-removed)
  ip_hash             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_street_ratings_key ON street_ratings (street_key);
CREATE INDEX IF NOT EXISTS idx_street_ratings_status ON street_ratings (status);
CREATE INDEX IF NOT EXISTS idx_street_ratings_created ON street_ratings (created_at);

-- One rating per hashed-IP per street per rolling day, enforced in the Worker
-- (SQLite can't express a "within 24h" uniqueness constraint directly).
CREATE INDEX IF NOT EXISTS idx_street_ratings_spam_check ON street_ratings (street_key, ip_hash, created_at);

-- ---------------------------------------------------------------------
-- community_alerts: cached, precomputed area-level alerts. Holds counts
-- only — never links back to individual report rows in any response.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  area_key        TEXT NOT NULL,   -- rounded "lat,lng" bucket
  latitude        REAL NOT NULL,
  longitude       REAL NOT NULL,
  city            TEXT,
  report_count    INTEGER NOT NULL,
  window_days     INTEGER NOT NULL DEFAULT 7,
  severity        TEXT NOT NULL DEFAULT 'notice', -- 'notice' | 'elevated'
  generated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_area ON community_alerts (area_key);
CREATE INDEX IF NOT EXISTS idx_alerts_generated ON community_alerts (generated_at);

-- ---------------------------------------------------------------------
-- safe_routes_cache: caches computed safer-route results for a short
-- time so repeated identical requests don't recompute from scratch.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safe_routes_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key     TEXT NOT NULL UNIQUE, -- hash of start/end/mode
  start_lat     REAL NOT NULL,
  start_lng     REAL NOT NULL,
  end_lat       REAL NOT NULL,
  end_lng       REAL NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('shortest','safer')),
  route_json    TEXT NOT NULL, -- serialized route + safety metadata
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_routes_cache_created ON safe_routes_cache (created_at);
