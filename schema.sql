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

-- ---------------------------------------------------------------------------
-- PROVIDERS (added 13 Sep 2026 - the provider portal).
--
-- An organisation is a provider: the company whose courses are assessed. Its
-- people sign in with role 'provider' and see ONLY their own rows (every
-- portal query is scoped by users.org_id). Internal staff have no org_id.
CREATE TABLE IF NOT EXISTS organisations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  address TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'suspended' | 'closed'
  notes TEXT,                              -- internal, never shown to the provider
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organisations(id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
-- Which provider a case belongs to. NULL on cases opened inside the tool
-- before the portal existed; assign them from the organisation's page.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organisations(id);
CREATE INDEX IF NOT EXISTS idx_entries_org ON entries(org_id);

-- Reference numbers: CA-<year>-<nnnn> for applications, INV-<year>-<nnnn> for
-- invoices - one counter per kind per year (lib/refs.server.js).
CREATE TABLE IF NOT EXISTS ref_counters (
  kind TEXT NOT NULL,
  year INTEGER NOT NULL,
  last INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
);

-- What a provider did in the portal - submitted, said an item was sent, said
-- a fix was done, acknowledged feedback. The assessor's side of the story
-- is in the case document; this is the provider's, dated and named.
CREATE TABLE IF NOT EXISTS portal_events (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id),
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,          -- 'submitted' | 'items_sent' | 'fix_reported' | 'feedback_ack'
  message TEXT,
  by_user INTEGER REFERENCES users(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ          -- when an assessor read it
);
CREATE INDEX IF NOT EXISTS idx_portal_events_entry ON portal_events(entry_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_events_unseen ON portal_events(seen_at) WHERE seen_at IS NULL;

-- Billing: invoices the scheme raises to a provider. Payment is recorded by
-- the scheme (bank transfer) until a card provider is wired in; the provider
-- sees every invoice and the balance. Amounts in pence, never floats.
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id),
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  number TEXT UNIQUE NOT NULL,             -- INV-<year>-<nnnn>
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',   -- 'issued' | 'paid' | 'void'
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_at DATE,
  paid_at DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);

-- Feedback shared with a provider: the scheme's plain-English note on how an
-- accredited activity is looking in learner feedback, with a RAG and the
-- numbers it rests on, and the provider's acknowledgement. Raised by a person
-- at the scheme, never automatically - sharing is a decision.
CREATE TABLE IF NOT EXISTS feedback_notices (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id),
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  rag TEXT NOT NULL DEFAULT 'amber',       -- 'green' | 'amber' | 'red'
  message TEXT NOT NULL,
  snapshot JSONB,                          -- the aggregate the note rests on, as shared
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by INTEGER REFERENCES users(id),
  response TEXT                            -- what the provider said they will do
);
CREATE INDEX IF NOT EXISTS idx_feedback_notices_org ON feedback_notices(org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- LEARNER FEEDBACK (moved server-side 13 Sep 2026 from the website's
-- localStorage pipeline). One row per verified completion: the accreditation
-- number is checked against the register (lib/register.server.js) at
-- submission, so a response can only exist for a real accredited activity.
-- De-duplicated per course by certificate serial or by email - one response
-- per completion keeps the picture honest. Identity fields exist only so a
-- completion can be confirmed; the provider never sees them (lib/feedback.js
-- aggregates are what leave this table).
CREATE TABLE IF NOT EXISTS feedback_responses (
  id SERIAL PRIMARY KEY,
  acc_ref TEXT NOT NULL,                               -- ACT-2026-0147, as on the certificate
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES organisations(id),
  cert_serial TEXT NOT NULL DEFAULT '',
  completed_on TEXT,                                   -- 'YYYY-MM'
  answers JSONB NOT NULL,                              -- {relevance, clarity, ..., support} labels
  comments JSONB NOT NULL DEFAULT '{}'::jsonb,         -- {promise, navigation, technical, accessibility, support, likeMost, improve, additional}
  contact_name TEXT,
  contact_email TEXT NOT NULL DEFAULT '',
  may_contact BOOLEAN NOT NULL DEFAULT false,
  ip_hash TEXT,                                        -- salted hash, for the per-address cap only
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_ref ON feedback_responses(acc_ref, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_entry ON feedback_responses(entry_id);
CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback_responses(ip_hash, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_serial ON feedback_responses(acc_ref, lower(cert_serial)) WHERE cert_serial <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_email ON feedback_responses(acc_ref, lower(contact_email)) WHERE contact_email <> '';

-- The register's own say over an accreditation, beyond what the case file
-- computes: NULL = as computed (accredited / expired by date); 'suspended' or
-- 'withdrawn' set by the scheme under D4. Read by the public verify lookup.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS register_status TEXT;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS register_note TEXT;
