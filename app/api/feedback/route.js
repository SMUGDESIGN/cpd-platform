import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { lookup } from '@/lib/register.server';
import { validateAnswers } from '@/lib/feedback';
import { gate, withCors, ipHashOf, consumeToken, audit, payloadHash, clean } from '@/lib/signup.server';

/* Public. A learner's feedback on an accredited course - from the platform's
   own /feedback page or the website's, which posts here.
   The same door as the sign-up (lib/signup.server.js): origin + https,
   honeypot, one-time token (purpose 'feedback'), then the form's own rules:
   the accreditation number must resolve on the register; every answer must
   be one of the known labels; one response per certificate serial or email
   per course (the unique indexes enforce it under concurrency); a cap per
   connection per day. Every attempt is audited with the hash of what was
   accepted, and the response keeps that audit row and hash. Identity fields
   are stored for confirmation only. */
const CAP_PER_DAY = 25;
const PURPOSE = 'feedback';

export async function OPTIONS(req) { return withCors(new NextResponse(null, { status: 204 }), req.headers.get('origin')); }

export async function POST(req) {
  const origin = req.headers.get('origin');
  const reply = (body, status) => withCors(NextResponse.json(body, { status: status || 200 }), origin);
  const refused = await gate(req, { purpose: PURPOSE });
  if (refused) return refused;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') { await audit({ purpose: PURPOSE, outcome: 'invalid', req, note: 'not json' }); return reply({ error: 'Bad request' }, 400); }
  if (clean(b.website, 200)) { await audit({ purpose: PURPOSE, outcome: 'honeypot', req }); return reply({ ok: true }); } // honeypot: pretend, store nothing

  const tok = await consumeToken(b.token, req, PURPOSE);
  if (!tok.ok) {
    await audit({ purpose: PURPOSE, outcome: 'bad_token', req, note: tok.reason });
    return reply({ error: tok.reason === 'too_fast' ? 'That was sent too quickly - please check your answers and try again.' : 'This form has expired or was already sent - please reload the page and try again.', code: tok.reason }, 400);
  }
  const refuse = async (error, extra) => { await audit({ purpose: PURPOSE, outcome: 'invalid', req, tokenId: tok.id, note: error }); return reply({ error, ...(extra || {}) }, 400); };

  const rec = await lookup(clean(b.ref, 20));
  if (!rec) return refuse('That accreditation number is not on the register.');
  const bad = validateAnswers(b.answers);
  if (bad.length) return refuse('Please answer every question.', { missing: bad });
  const completedOn = /^\d{4}-\d{2}$/.test(b.completedOn || '') ? b.completedOn : null;
  if (!completedOn) return refuse('Please tell us which month you completed the course.');

  const ipHash = ipHashOf(req);
  const { rows: cap } = await query("SELECT COUNT(*)::int AS n FROM feedback_responses WHERE ip_hash = $1 AND submitted_at > now() - interval '1 day'", [ipHash]);
  if (cap[0].n >= CAP_PER_DAY) { await audit({ purpose: PURPOSE, outcome: 'rate_limited', req, tokenId: tok.id }); return reply({ error: 'Too many submissions from this connection today. Please try again tomorrow.' }, 429); }

  const c = b.comments || {};
  const payload = {
    ref: rec.ref, certSerial: clean(b.certSerial, 80), completedOn,
    answers: Object.fromEntries(Object.keys(b.answers).sort().map((k) => [k, clean(b.answers[k], 60)])),
    comments: { promise: clean(c.promise, 1000), navigation: clean(c.navigation, 1000), technical: clean(c.technical, 1000), accessibility: clean(c.accessibility, 1000), support: clean(c.support, 1000), likeMost: clean(c.likeMost, 3000), improve: clean(c.improve, 3000), additional: clean(c.additional, 3000) },
    name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), mayContact: !!b.mayContact,
  };
  if (payload.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) return refuse('That email address does not look right - it is optional, so leave it blank if you prefer.');
  const hash = payloadHash(payload);
  const auditId = await audit({ purpose: PURPOSE, outcome: 'created', req, payload, orgId: rec.orgId, tokenId: tok.id });
  try {
    await query(
      `INSERT INTO feedback_responses (acc_ref, entry_id, org_id, cert_serial, completed_on, answers, comments, contact_name, contact_email, may_contact, ip_hash, audit_id, payload_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [rec.ref, rec.entryId, rec.orgId, payload.certSerial, completedOn, JSON.stringify(payload.answers), JSON.stringify(payload.comments), payload.name || null, payload.email, payload.mayContact, ipHash, auditId, hash]
    );
  } catch (e) {
    if (String(e.code) === '23505') {
      await query("UPDATE signup_audit SET outcome = 'duplicate' WHERE id = $1", [auditId]);
      return reply({ error: 'We already hold feedback for this certificate. One response per completion keeps the picture honest - if you need to change something, contact us.' }, 409);
    }
    throw e;
  }
  return reply({ ok: true, activity: rec.activity, ref: rec.ref }, 201);
}
