import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { query } from '@/lib/db';
import { notify } from '@/lib/notify.server';

/* Public. An organisation asks to join the scheme from the website's Apply
   page. This registers the ORGANISATION only - it cannot submit an activity
   for assessment; that happens on the portal once support has approved it.
   Guards without a session: honeypot, field limits, a cap per connection
   per day, and no second pending organisation for the same contact email.
   Nothing is revealed about who is already on the platform: the reply is
   the same either way. CORS: the website is another origin. */
const CAP_PER_DAY = 5;
const FORMATS = ['Online / e-learning course', 'Face-to-face training', 'Webinars / live online', 'Conference or event sessions', 'Coaching / mentoring programme', 'Blended programme'];

function cors(res) {
  const allow = process.env.PUBLIC_SITE_ORIGINS || '*';
  res.headers.set('Access-Control-Allow-Origin', allow);
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'content-type');
  res.headers.set('Vary', 'Origin');
  return res;
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 204 })); }

function ipOf(req) {
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return cors(NextResponse.json({ error: 'Bad request' }, { status: 400 }));
  if (clean(b.website_url, 200)) return cors(NextResponse.json({ ok: true })); // honeypot: pretend, store nothing
  const name = clean(b.organisation, 160), contact = clean(b.contactName, 120), email = clean(b.email, 200).toLowerCase();
  const phone = clean(b.phone, 40), website = clean(b.website, 200), about = clean(b.about, 3000);
  const formats = Array.isArray(b.formats) ? b.formats.map((f) => clean(f, 60)).filter((f) => FORMATS.includes(f)) : [];
  if (!name || !contact) return cors(NextResponse.json({ error: 'Please give the organisation and your name.' }, { status: 400 }));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return cors(NextResponse.json({ error: 'Please give a valid email address - it becomes the portal login.' }, { status: 400 }));
  const ipHash = createHash('sha256').update((process.env.NEXTAUTH_SECRET || '') + ipOf(req)).digest('hex').slice(0, 32);
  const { rows: cap } = await query("SELECT COUNT(*)::int AS n FROM organisations WHERE ip_hash = $1 AND applied_at > now() - interval '1 day'", [ipHash]);
  if (cap[0].n >= CAP_PER_DAY) return cors(NextResponse.json({ error: 'Too many sign-ups from this connection today. Please try again tomorrow.' }, { status: 429 }));

  /* already known by this contact email (any status)? Tell support, not the caller. */
  const { rows: dup } = await query('SELECT id, name, status FROM organisations WHERE lower(contact_email) = $1 OR EXISTS (SELECT 1 FROM users u WHERE u.email = $1) LIMIT 1', [email]);
  if (dup[0]) {
    await notify({ to: { admin: true }, kind: 'signup', title: 'Sign-up repeated: ' + name, body: contact + ' (' + email + ') signed up again from the website; that email already belongs to ' + dup[0].name + ' (' + dup[0].status + '). Nothing was created.', href: '/admin/organisations/' + dup[0].id, orgId: dup[0].id });
    return cors(NextResponse.json({ ok: true }));
  }
  const { rows } = await query(
    `INSERT INTO organisations (name, contact_name, contact_email, phone, website, status, applied_at, formats, about, ip_hash)
     VALUES ($1,$2,$3,$4,$5,'pending',now(),$6,$7,$8) RETURNING id`,
    [name, contact, email, phone || null, website || null, formats.join(', ') || null, about || null, ipHash]
  );
  const id = rows[0].id;
  await notify({ to: { admin: true }, kind: 'signup', title: 'New organisation sign-up: ' + name, body: contact + ' (' + email + ')' + (formats.length ? ' - ' + formats.join(', ') : '') + '. Vet it and approve or decline.', href: '/admin/organisations/' + id, orgId: id });
  return cors(NextResponse.json({ ok: true }, { status: 201 }));
}
