-- HerSafe migration 0004: anti-defamation / false-report protection,
-- Help Place suggestions + community confirmation, and Campaigns.
-- Apply with:
--   wrangler d1 execute hersafe-db --remote --file=./sql/0004_moderation_and_help_places.sql --config=worker/wrangler.toml

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Reports: basic spam/duplicate detection support. Visibility itself
-- already gates on review_status (added in 0003) — the Worker now treats
-- only review_status = 'verified' as "approved for public display".
-- These columns just help admins triage faster; they never hide/show
-- anything on their own.
-- ---------------------------------------------------------------------
ALTER TABLE reports ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN flag_reason TEXT;
ALTER TABLE reports ADD COLUMN description_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_flagged ON reports (flagged);
CREATE INDEX IF NOT EXISTS idx_reports_description_hash ON reports (description_hash);

-- ---------------------------------------------------------------------
-- Safe / Help Places: add a moderation workflow so user-suggested places
-- go through the same Pending -> Admin Review -> Approved/Rejected path
-- as reports, instead of appearing immediately.
-- ---------------------------------------------------------------------
ALTER TABLE safe_places ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'; -- pending|approved|rejected|archived
ALTER TABLE safe_places ADD COLUMN submitted_by_account_id INTEGER REFERENCES accounts(id);
ALTER TABLE safe_places ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_safe_places_review_status ON safe_places (review_status);

-- Existing rows were all admin-created before this migration, so they
-- default to 'approved' above and need no backfill.

-- ---------------------------------------------------------------------
-- place_confirmations: "Is this place still here?" community check-ins.
-- One confirmation per submitter (account or hashed IP for guests) per
-- place per rolling window, enforced in the Worker.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS place_confirmations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id      INTEGER NOT NULL REFERENCES safe_places(id) ON DELETE CASCADE,
  account_id    INTEGER REFERENCES accounts(id),
  ip_hash       TEXT,
  response      TEXT NOT NULL CHECK (response IN ('yes','no')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_place_confirmations_place ON place_confirmations (place_id);
CREATE INDEX IF NOT EXISTS idx_place_confirmations_created ON place_confirmations (created_at);

-- ---------------------------------------------------------------------
-- campaigns: admin-managed awareness campaigns that point users to a
-- platform's OFFICIAL report flow. Never a mechanism for submitting
-- reports on a user's behalf, mass-tagging, or contacting anyone accused.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  platform            TEXT,               -- e.g. 'Instagram', 'TikTok', 'Facebook'
  official_report_url TEXT,               -- link to the platform's own report form
  instructions        TEXT,
  status              TEXT NOT NULL DEFAULT 'active', -- active|archived
  created_by          INTEGER REFERENCES admin_users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
