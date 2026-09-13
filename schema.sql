-- CPD Accreditation Scheme - platform schema.
-- Additive, commented, applied by scripts/migrate.mjs (CREATE IF NOT EXISTS /
-- ALTER ADD IF NOT EXISTS only, so re-running is always safe). Same discipline
-- as the DBF Hub's schema.sql.

-- ---------------------------------------------------------------------------
-- People who sign in. Roles are a single column for now (lib/permissions.js):
-- admin | assessor | moderator | coordinator. Deactivate, never delete - a
-- signed decision names a person, and that name must always resolve.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,          -- stored lowercase; auth normalises input
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'assessor',
  initials TEXT,                       -- stamped on approvals and signatures
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sign-in throttling (lib/auth.js): failures per account and per source IP
-- over a rolling window. Cleaned opportunistically after 7 days.
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  ok BOOLEAN NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_at ON login_attempts(at);

-- ---------------------------------------------------------------------------
-- Case files.
--
-- One row per application, holding the WHOLE case as a document (`doc`) in
-- exactly the shape the assessor tool exports per entry: caseInfo, completeness,
-- indicators, notices, moderation, returns, decision, deferral, conditions,
-- surveillance, remediationLog, outcome. That shape is the contract the tool
-- has carried since July 2026 and every backup file on disk already matches
-- it, so nothing is migrated by hand. Columns beside it are denormalised
-- from the doc for listing and search, and `summary` is the tool's own
-- scoreEntry() result at save time (verdict, points, gates, stage flags) so
-- the caseload page never re-implements the scoring rules.
--
-- `version` is an optimistic lock: a save carries the version it read, and a
-- save against a stale version is refused (409) rather than silently
-- overwriting a colleague's work. Every accepted save is also copied to
-- entry_versions, which is the audit trail behind a signed decision.
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,                 -- the tool's own id ('e' + ms), kept so exported JSON stays compatible
  ref TEXT,                            -- e.g. CA-2026-0147
  activity TEXT,
  provider TEXT,
  doc JSONB NOT NULL,
  summary JSONB,
  framework TEXT,                      -- framework version the case was scored under
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  archived_at TIMESTAMPTZ,             -- archive, never delete
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entries_ref ON entries(ref);
CREATE INDEX IF NOT EXISTS idx_entries_archived ON entries(archived_at);
CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at DESC);

CREATE TABLE IF NOT EXISTS entry_versions (
  id SERIAL PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  doc JSONB NOT NULL,
  saved_by INTEGER REFERENCES users(id),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entry_versions_entry ON entry_versions(entry_id, version DESC);

-- ---------------------------------------------------------------------------
-- Refinements: the proposal queue to the Standards Panel. One row per
-- framework item (indicator, completeness item, moderation check, stage
-- description), holding the same object the tool keeps in
-- store.refinements[id] - reworded text, not-needed flag, who, when, why,
-- history. Model-level: applies to every case, so it lives beside the cases,
-- not inside one.
CREATE TABLE IF NOT EXISTS refinements (
  id TEXT PRIMARY KEY,                 -- '1.5.2', 'C-04', 'MOD-2', 'STAGE-6'
  data JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Settings that are one row for the whole scheme (framework version in
-- service, scheme name, contact addresses). Key/value so a new setting is a
-- row, not a migration.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
