-- HerSafe migration 0003: optional accounts, points/trust/badges,
-- community verification, helpful votes, notifications, admin logs,
-- and report review status.
-- Apply with:
--   wrangler d1 execute hersafe-db --remote --file=./sql/0003_accounts_gamification.sql --config=worker/wrangler.toml

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- accounts: fully optional. Guests can do everything accounts can do;
-- an account only adds a profile, history, and gamification on top.
-- Passwords are salt + SHA-256(salt || password), same pattern as
-- admin_users — never plain text.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts (email);

-- ---------------------------------------------------------------------
-- user_points: an append-only ledger of point-earning events. The
-- profile's total is SUM(amount) — this keeps history auditable instead
-- of just storing a running total that could drift or be spam-farmed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_points (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  reason       TEXT NOT NULL, -- 'street_rating' | 'report' | 'verification' | 'helpful_received'
  ref_table    TEXT,          -- e.g. 'street_ratings', 'reports'
  ref_id       INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_points_account ON user_points (account_id);

-- ---------------------------------------------------------------------
-- user_trust: current trust score + level per account. Adjusted by the
-- Worker alongside points events; kept as a single row per account
-- (rather than a ledger) since only the current value is ever shown.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_trust (
  account_id    INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  score         INTEGER NOT NULL DEFAULT 50, -- 0..100
  level         TEXT NOT NULL DEFAULT 'new_member',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- user_badges: awarded badges, one row per (account, badge). Awarding
-- logic lives in the Worker and checks thresholds after each
-- points/rating/report event; this table is just the record.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_badges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  badge_key    TEXT NOT NULL, -- 'first_report' | 'street_explorer' | 'trusted_reporter' |
                               -- 'safety_helper' | 'top_contributor' | 'points_100' | 'points_500' | 'points_1000'
  awarded_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, badge_key)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_account ON user_badges (account_id);

-- ---------------------------------------------------------------------
-- street_verification: "do you agree with this rating?" responses,
-- one per account per street (guests can't verify — this requires an
-- account so confidence % isn't trivially spammable from one browser).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS street_verification (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  street_key   TEXT NOT NULL,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  response     TEXT NOT NULL CHECK (response IN ('yes','partially','no')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (street_key, account_id)
);
CREATE INDEX IF NOT EXISTS idx_street_verification_key ON street_verification (street_key);

-- ---------------------------------------------------------------------
-- rating_helpful_votes: one helpful-vote per account per street rating.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rating_helpful_votes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  rating_id     INTEGER NOT NULL REFERENCES street_ratings(id) ON DELETE CASCADE,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rating_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_helpful_votes_rating ON rating_helpful_votes (rating_id);

-- ---------------------------------------------------------------------
-- notifications: simple in-app notifications, polled by the frontend.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type         TEXT NOT NULL, -- 'report_reviewed' | 'rating_confirmed' | 'points_earned' | 'badge_earned'
  message      TEXT NOT NULL,
  read_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications (account_id, read_at);

-- ---------------------------------------------------------------------
-- admin_logs: audit trail of admin actions (status changes, deletions).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_username TEXT NOT NULL,
  action        TEXT NOT NULL, -- 'delete_report' | 'update_report_status' | 'delete_place' | etc.
  target_table  TEXT,
  target_id     INTEGER,
  details       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs (created_at);

-- ---------------------------------------------------------------------
-- Extend reports: optional link to a registered account, and a review
-- workflow status separate from status (visible/hidden spam flag).
-- ---------------------------------------------------------------------
ALTER TABLE reports ADD COLUMN account_id INTEGER REFERENCES accounts(id);
ALTER TABLE reports ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'; -- pending|reviewed|verified|archived
CREATE INDEX IF NOT EXISTS idx_reports_account ON reports (account_id);
CREATE INDEX IF NOT EXISTS idx_reports_review_status ON reports (review_status);

-- ---------------------------------------------------------------------
-- Extend street_ratings: optional account link (guests remain allowed).
-- ---------------------------------------------------------------------
ALTER TABLE street_ratings ADD COLUMN account_id INTEGER REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS idx_street_ratings_account ON street_ratings (account_id);
