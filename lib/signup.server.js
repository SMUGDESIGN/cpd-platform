import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { query, withTransaction } from './db';

/* The public door, hardened - the website -> platform sign-up, the learner
   feedback form and the register lookups all pass through here. What this
   file guarantees:

   origin    a browser may only post from the website's own origin
             (PUBLIC_SITE_ORIGINS, exact match on the Origin header; in
             development any localhost origin is allowed when unset; in
             production unset means NOBODY - secure by default);
   https     in production the request must have arrived over TLS;
   token     the page fetches a one-time token on load; the POST spends it.
             Signed (HMAC-SHA256 with SIGNUP_SECRET or NEXTAUTH_SECRET),
             bound to the connection that fetched it, valid 3s..60min,
             single use - so a submission cannot be replayed, cannot be
             fired blind without first loading the form, and cannot be
             sent faster than a person could type;
   audit     every attempt is written verbatim with its outcome and the
             SHA-256 of the canonical payload before anything else happens
             to it; the organisation keeps that hash, so the record can be
             checked against the submission at any time;
   email     the applicant proves they control the contact address by
             clicking a link (32 random bytes, stored hashed, 7 days)
             before support can approve.

   What it cannot guarantee, said plainly: the website is static, so a
   script can imitate a browser end to end. These layers raise the cost and
   leave a trail; a human approval is the real gate. */

const SECRET = () => process.env.SIGNUP_SECRET || process.env.NEXTAUTH_SECRET || '';
export const TOKEN_MIN_AGE_MS = 3000;
export const TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
export const TOKENS_PER_HOUR = 20;
export const CAP_PER_DAY = 5;
export const VERIFY_DAYS = 7;

export function allowedOrigins() {
  const env = (process.env.PUBLIC_SITE_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return env;
}
/* the platform's own origin is always allowed: its own /feedback and
   /verify pages post to these routes */
function selfOrigin() { try { return new URL(process.env.NEXTAUTH_URL || 'http://localhost:3006').origin; } catch (e) { return ''; } }
export function originAllowed(origin) {
  if (!origin) return false;
  const o = String(origin).replace(/\/$/, '');
  if (o === selfOrigin()) return true;
  const list = allowedOrigins();
  if (list.length) return list.includes(o);
  if (process.env.NODE_ENV !== 'production') return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return false;
}
export function httpsOk(req) {
  if (process.env.NODE_ENV !== 'production') return true;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return proto === 'https';
}
export function ipOf(req) {
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}
export function ipHashOf(req) {
  return createHash('sha256').update(SECRET() + ipOf(req)).digest('hex').slice(0, 32);
}
/* CORS answered only for an allowed origin; anyone else gets no permission
   header at all, which the browser turns into a refused request. */
export function withCors(res, origin) {
  if (originAllowed(origin)) {
    res.headers.set('Access-Control-Allow-Origin', String(origin).replace(/\/$/, ''));
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'content-type');
    res.headers.set('Access-Control-Max-Age', '600');
  }
  res.headers.set('Vary', 'Origin');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
/* The gate every sign-up request passes first: returns a response to send
   back (refusal) or null (carry on). Refusals are audited. */
export async function gate(req, { purpose = 'signup', allowNoOrigin = false } = {}) {
  const origin = req.headers.get('origin');
  if (!httpsOk(req)) { await audit({ purpose, outcome: 'bad_origin', req, note: 'not https' }); return withCors(NextResponse.json({ error: 'HTTPS required' }, { status: 400 }), origin); }
  /* a GET from the page itself, or a person typing the address, carries no
     Origin header; a cross-site fetch always does, and is held to the list */
  if (allowNoOrigin && !origin) return null;
  if (!originAllowed(origin)) { await audit({ purpose, outcome: 'bad_origin', req }); return withCors(NextResponse.json({ error: 'This form can only be sent from the CPD Accreditation Scheme website' }, { status: 403 }), origin); }
  return null;
}
/* Throttle a read-only lookup per connection: true = over the limit. */
export async function overLimit(req, route, perHour) {
  const ipHash = ipHashOf(req);
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM public_hits WHERE route = $1 AND ip_hash = $2 AND at > now() - interval '1 hour'", [route, ipHash]);
  if (rows[0].n >= perHour) return true;
  await query('INSERT INTO public_hits (route, ip_hash) VALUES ($1, $2)', [route, ipHash]);
  return false;
}
/* Housekeeping for the daily job: spent and stale tokens, old hit counters. */
export async function sweepPublicDoor() {
  const a = await query("DELETE FROM signup_tokens WHERE issued_at < now() - interval '2 days'");
  const b = await query("DELETE FROM public_hits WHERE at < now() - interval '2 days'");
  return { tokens: a.rowCount, hits: b.rowCount };
}

/* Tokens ---------------------------------------------------------------- */
function sign(nonce, ts, ipHash, purpose) { return createHmac('sha256', SECRET()).update(purpose + '.' + nonce + '.' + ts + '.' + ipHash).digest('base64url'); }
const hashNonce = (nonce) => createHash('sha256').update(nonce).digest('hex');

export async function issueToken(req, purpose = 'signup') {
  const ipHash = ipHashOf(req);
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM signup_tokens WHERE ip_hash = $1 AND purpose = $2 AND issued_at > now() - interval '1 hour'", [ipHash, purpose]);
  if (rows[0].n >= TOKENS_PER_HOUR) return { error: 'Too many form loads from this connection - try again in an hour', status: 429 };
  const nonce = randomBytes(24).toString('base64url');
  const ts = Date.now();
  await query('INSERT INTO signup_tokens (nonce_hash, ip_hash, purpose) VALUES ($1, $2, $3)', [hashNonce(nonce), ipHash, purpose]);
  return { token: nonce + '.' + ts + '.' + sign(nonce, ts, ipHash, purpose), expiresInMs: TOKEN_MAX_AGE_MS };
}
/* Spend a token: signature, age window, connection, single use - inside a
   row lock so two posts with the same token cannot both succeed. */
export async function consumeToken(token, req, purpose = 'signup') {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [nonce, tsStr, sig] = parts;
  const ts = Number(tsStr);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(nonce) || !Number.isFinite(ts)) return { ok: false, reason: 'malformed' };
  const ipHash = ipHashOf(req);
  const want = Buffer.from(sign(nonce, ts, ipHash, purpose)); const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'signature' };
  const age = Date.now() - ts;
  if (age > TOKEN_MAX_AGE_MS) return { ok: false, reason: 'expired' };
  if (age < TOKEN_MIN_AGE_MS) return { ok: false, reason: 'too_fast' };
  return withTransaction(async (tx) => {
    const { rows } = await tx('SELECT id, used_at, ip_hash, purpose FROM signup_tokens WHERE nonce_hash = $1 FOR UPDATE', [hashNonce(nonce)]);
    if (!rows[0] || rows[0].purpose !== purpose) return { ok: false, reason: 'unknown' };
    if (rows[0].used_at) return { ok: false, reason: 'used' };
    if (rows[0].ip_hash !== ipHash) return { ok: false, reason: 'connection' };
    await tx('UPDATE signup_tokens SET used_at = now() WHERE id = $1', [rows[0].id]);
    return { ok: true, id: rows[0].id };
  });
}

/* Payload integrity --------------------------------------------------- */
export function canonical(payload) {
  const keys = Object.keys(payload).sort();
  return JSON.stringify(keys.map((k) => [k, payload[k]]));
}
export function payloadHash(payload) { return createHash('sha256').update(canonical(payload)).digest('hex'); }

export async function audit({ purpose = 'signup', outcome, req, payload, orgId, tokenId, note }) {
  const p = payload ? { ...payload } : null;
  if (p && note) p._note = note;
  const { rows } = await query(
    'INSERT INTO signup_audit (purpose, outcome, ip_hash, origin, user_agent, payload, payload_hash, org_id, token_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [purpose, outcome, ipHashOf(req), (req.headers.get('origin') || '').slice(0, 200) || null, (req.headers.get('user-agent') || '').slice(0, 300) || null,
     p ? JSON.stringify(p) : (note ? JSON.stringify({ _note: note }) : null), payload ? payloadHash(payload) : null, orgId || null, tokenId || null]
  );
  return rows[0].id;
}
/* strip control characters (newlines kept for free text), trim, cap length */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export const clean = (v, max) => String(v == null ? '' : v).replace(CONTROL, '').trim().slice(0, max);

/* Email confirmation --------------------------------------------------- */
export async function newVerifyToken(orgId) {
  const raw = randomBytes(32).toString('base64url');
  /* a confirmation already given is never taken back by a re-send */
  await query('UPDATE organisations SET email_verify_hash = $2, email_verify_sent_at = now() WHERE id = $1 AND email_verified_at IS NULL', [orgId, createHash('sha256').update(raw).digest('hex')]);
  return raw;
}
export async function confirmEmail(raw) {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(String(raw || ''))) return null;
  const { rows } = await query(
    `UPDATE organisations SET email_verified_at = now(), email_verify_hash = NULL
      WHERE email_verify_hash = $1 AND email_verified_at IS NULL AND email_verify_sent_at > now() - ($2 || ' days')::interval
      RETURNING id, name, contact_name, contact_email`,
    [createHash('sha256').update(String(raw)).digest('hex'), String(VERIFY_DAYS)]
  );
  return rows[0] || null;
}
