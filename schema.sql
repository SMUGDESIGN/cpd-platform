-- CPD Accreditation Scheme - platform schema.
-- Additive, commented, applied by scripts/migrate.mjs (CREATE IF NOT EXISTS /
-- ALTER ADD IF NOT EXISTS only, so re-running is always safe). Same discipline
-- as the DBF Hub's schema.sql.

-- ---------------------------------------------------------------------------
-- People who sign in. Roles are a single column (lib/permissions.js):
-- superadmin | support | assessor | moderator | coordinator | provider.
-- ('admin' was renamed 'support' on 13 Sep 2026; the UPDATE below is idempotent.) Deactivate, never delete - a
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
-- One row per application, holding the WHOLE case as a document (`doc`):
-- caseInfo, completeness, indicators, notices, moderation, returns, decision,
-- deferral, conditions, surveillance, remediationLog, outcome - the shape
-- lib/framework.js blankDoc() makes. Columns beside it are denormalised
-- from the doc for listing and search, and `summary` is lib/scoring's
-- summarise() result at save time (verdict, points, gates, stage flags) so
-- the caseload page never re-implements the scoring rules.
--
-- `version` is an optimistic lock: a save carries the version it read, and a
-- save against a stale version is refused (409) rather than silently
-- overwriting a colleague's work. Every accepted save is also copied to
-- entry_versions, which is the audit trail behind a signed decision.
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,                 -- 'e' + ms + random, minted by the platform
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
-- description) - reworded text, not-needed flag, who, when, why, history. Model-level: applies to every case, so it lives beside the cases,
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
-- Which provider a case belongs to. NULL on a case started from the staff
-- side without one; assign it from the organisation's page.
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
-- LEARNER FEEDBACK. One row per verified completion: the accreditation
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

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS (added 13 Sep 2026). In-app for now; email later.
--
-- One row per RECIPIENT: an event that concerns three people is three rows,
-- fanned out when it happens (lib/notify.server.js), so read state is per
-- person and a query is always "mine, unread". `dedupe_key` stops the daily
-- checks repeating themselves ("fix window ends in 7 days" once, not every
-- morning). `email_sent_at` is the hook for the email route when it comes:
-- a sender picks up rows where it is NULL and the person has asked for email.
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- 'application' | 'provider_reply' | 'returned' | 'ask' | 'deferral' | 'decision' | 'issued' | 'condition' | 'review' | 'invoice' | 'feedback' | 'system'
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,                           -- where clicking it goes, on the recipient's side of the house
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 13 Sep 2026: the 'admin' role became 'support' (accounts), and 'superadmin' was added (everything).
UPDATE users SET role = 'support' WHERE role = 'admin';

-- ---------------------------------------------------------------------------
-- EMAIL DELIVERY (added 13 Sep 2026). A notification is the record; email is
-- one way of delivering it. Each person chooses: 'immediate' (urgent kinds
-- at once, the rest in the daily digest), 'daily' (everything in one digest),
-- 'off' (in-app only). Every email attempted is written to email_outbox first,
-- so the local build (EMAIL_PROVIDER=log) shows exactly what would have gone,
-- and a failure with the real provider is visible rather than silent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications TEXT NOT NULL DEFAULT 'immediate';
CREATE TABLE IF NOT EXISTS email_outbox (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT,
  notification_ids INTEGER[] NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL,                  -- 'log' | 'resend'
  status TEXT NOT NULL,                    -- 'logged' | 'sent' | 'failed'
  provider_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox(created_at DESC);

-- Chasing a bill (support). A reminder is a notification to the organisation
-- (email follows their preference) plus a portal_events row 'reminder' in
-- the chaser's name; the invoice keeps the count and the last time so the
-- Billing due list can show who has been chased and when.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;

-- A phone number on a person (staff and provider people alike), so support
-- can call them; the organisation keeps its own phone as before.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Organisation sign-up from the public website. A sign-up creates the
-- organisation in status 'pending' with what it told us; support vets it and
-- approves (status 'active', the contact's portal login is created and the
-- one-time password emailed) or declines (status 'closed', reason in notes).
-- No login exists until approval. ip_hash is for the per-connection cap only.
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS formats TEXT;       -- what they deliver, as told on sign-up
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS about TEXT;         -- their own words on sign-up
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users(id);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
-- status values are now: 'pending' | 'active' | 'suspended' | 'closed'

-- Sign-up hardening (14 Sep 2026). The website is static, so the browser is
-- the only client and no secret can live there; what the platform can
-- guarantee is recorded here.
--   signup_tokens   one-time, short-lived form tokens: the page fetches one
--                   on load, the POST spends it; a token is bound to the
--                   connection that fetched it and dies after an hour.
--   signup_audit    every attempt, verbatim, with its outcome and the SHA-256
--                   of the canonical payload - the record support compares
--                   the organisation against; never edited, never deleted.
--   organisations   the hash and audit row of the submission that created
--                   it, and the email-confirmation state: the applicant must
--                   click a link sent to the contact address before a
--                   sign-up can be approved (proves they control the email).
CREATE TABLE IF NOT EXISTS signup_tokens (
  id SERIAL PRIMARY KEY,
  nonce_hash TEXT UNIQUE NOT NULL,
  ip_hash TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_signup_tokens_ip ON signup_tokens(ip_hash, issued_at DESC);
CREATE TABLE IF NOT EXISTS signup_audit (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL,        -- created | verified | duplicate | honeypot | bad_token | bad_origin | rate_limited | invalid
  ip_hash TEXT,
  origin TEXT,
  user_agent TEXT,
  payload JSONB,                -- the cleaned fields exactly as accepted (null for refused attempts that carried nothing usable)
  payload_hash TEXT,            -- sha256 of the canonical payload
  org_id INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
  token_id INTEGER REFERENCES signup_tokens(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_signup_audit_at ON signup_audit(at DESC);
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS signup_hash TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS signup_audit_id INTEGER REFERENCES signup_audit(id) ON DELETE SET NULL;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS email_verify_hash TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS email_verify_sent_at TIMESTAMPTZ;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
