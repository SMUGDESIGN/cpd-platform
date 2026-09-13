import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { query } from '@/lib/db';
import { lookup } from '@/lib/register.server';
import { validateAnswers } from '@/lib/feedback';

/* Public. A learner's feedback on an accredited course.
   Guarded without a session: the accreditation number must resolve on the
   register; every answer must be one of the known labels; a honeypot field
   must be empty; one response per certificate serial or email per course
   (the unique indexes enforce it under concurrency); and a cap per source
   address per day. Identity fields are stored for confirmation only. */
const CAP_PER_DAY = 25;

function ipOf(req) {
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}
function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (clean(b.website, 200)) return NextResponse.json({ ok: true }); // honeypot: pretend, store nothing
  const rec = await lookup(b.ref);
  if (!rec) return NextResponse.json({ error: 'That accreditation number is not on the register.' }, { status: 400 });
  const bad = validateAnswers(b.answers);
  if (bad.length) return NextResponse.json({ error: 'Please answer every question.', missing: bad }, { status: 400 });
  const completedOn = /^\d{4}-\d{2}$/.test(b.completedOn || '') ? b.completedOn : null;
  if (!completedOn) return NextResponse.json({ error: 'Please tell us which month you completed the course.' }, { status: 400 });
  const ipHash = createHash('sha256').update((process.env.NEXTAUTH_SECRET || '') + ipOf(req)).digest('hex').slice(0, 32);
  const { rows: cap } = await query("SELECT COUNT(*)::int AS n FROM feedback_responses WHERE ip_hash = $1 AND submitted_at > now() - interval '1 day'", [ipHash]);
  if (cap[0].n >= CAP_PER_DAY) return NextResponse.json({ error: 'Too many submissions from this connection today. Please try again tomorrow.' }, { status: 429 });

  const serial = clean(b.certSerial, 80);
  const email = clean(b.email, 200).toLowerCase();
  const c = b.comments || {};
  const comments = { promise: clean(c.promise, 1000), navigation: clean(c.navigation, 1000), technical: clean(c.technical, 1000), accessibility: clean(c.accessibility, 1000), support: clean(c.support, 1000), likeMost: clean(c.likeMost, 3000), improve: clean(c.improve, 3000), additional: clean(c.additional, 3000) };
  const answers = {};
  Object.keys(b.answers).forEach((k) => { answers[k] = clean(b.answers[k], 60); });
  try {
    await query(
      `INSERT INTO feedback_responses (acc_ref, entry_id, org_id, cert_serial, completed_on, answers, comments, contact_name, contact_email, may_contact, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [rec.ref, rec.entryId, rec.orgId, serial, completedOn, JSON.stringify(answers), JSON.stringify(comments), clean(b.name, 120) || null, email, !!b.mayContact, ipHash]
    );
  } catch (e) {
    if (String(e.code) === '23505') {
      return NextResponse.json({ error: 'We already hold feedback for this certificate. One response per completion keeps the picture honest - if you need to change something, contact us.' }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true, activity: rec.activity, ref: rec.ref }, { status: 201 });
}
