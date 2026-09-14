import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { notify } from '@/lib/notify.server';
import { sendEmail, render } from '@/lib/email.server';
import { gate, withCors, ipHashOf, consumeToken, audit, payloadHash, newVerifyToken, clean, CAP_PER_DAY, VERIFY_DAYS } from '@/lib/signup.server';

/* Public. An organisation asks to join the scheme from the website's Apply
   page. This registers the ORGANISATION only - it cannot submit an activity
   for assessment; that happens on the portal once support has approved it.

   Order of the gates, each audited when it refuses: origin + https
   (lib/signup.server.gate), honeypot, one-time token, field validation,
   per-connection daily cap, duplicate email (swallowed: the reply is the
   same either way, support is told). Then the organisation is created
   'pending' with the hash of exactly what was accepted, a confirmation link
   is emailed to the contact, and support is notified. */
const FORMATS = ['Online / e-learning course', 'Face-to-face training', 'Webinars / live online', 'Conference or event sessions', 'Coaching / mentoring programme', 'Blended programme'];

export async function OPTIONS(req) { return withCors(new NextResponse(null, { status: 204 }), req.headers.get('origin')); }

export async function POST(req) {
  const origin = req.headers.get('origin');
  const reply = (body, status) => withCors(NextResponse.json(body, { status: status || 200 }), origin);
  const refused = await gate(req);
  if (refused) return refused;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') { await audit({ outcome: 'invalid', req, note: 'not json' }); return reply({ error: 'Bad request' }, 400); }
  if (clean(b.website_url, 200)) { await audit({ outcome: 'honeypot', req }); return reply({ ok: true }); } // pretend, store nothing

  const tok = await consumeToken(b.token, req);
  if (!tok.ok) {
    await audit({ outcome: 'bad_token', req, note: tok.reason });
    return reply({ error: tok.reason === 'too_fast' ? 'That was sent too quickly - please check the form and try again.' : 'This form has expired or was already sent - please reload the page and try again.', code: tok.reason }, 400);
  }

  const payload = {
    organisation: clean(b.organisation, 160), contactName: clean(b.contactName, 120), email: clean(b.email, 200).toLowerCase(),
    phone: clean(b.phone, 40), website: clean(b.website, 200).replace(/^javascript:/i, ''), about: clean(b.about, 3000),
    formats: Array.isArray(b.formats) ? b.formats.map((f) => clean(f, 60)).filter((f) => FORMATS.includes(f)) : [],
  };
  if (!payload.organisation || !payload.contactName) { await audit({ outcome: 'invalid', req, payload, tokenId: tok.id }); return reply({ error: 'Please give the organisation and your name.' }, 400); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) { await audit({ outcome: 'invalid', req, payload, tokenId: tok.id }); return reply({ error: 'Please give a valid email address - it becomes the portal login.' }, 400); }
  if (payload.website && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(payload.website)) { await audit({ outcome: 'invalid', req, payload, tokenId: tok.id }); return reply({ error: 'That website address does not look right.' }, 400); }

  const ipHash = ipHashOf(req);
  const { rows: cap } = await query("SELECT COUNT(*)::int AS n FROM organisations WHERE ip_hash = $1 AND applied_at > now() - interval '1 day'", [ipHash]);
  if (cap[0].n >= CAP_PER_DAY) { await audit({ outcome: 'rate_limited', req, payload, tokenId: tok.id }); return reply({ error: 'Too many sign-ups from this connection today. Please try again tomorrow.' }, 429); }

  const { rows: dup } = await query('SELECT id, name, status FROM organisations WHERE lower(contact_email) = $1 OR EXISTS (SELECT 1 FROM users u WHERE u.email = $1) LIMIT 1', [payload.email]);
  if (dup[0]) {
    await audit({ outcome: 'duplicate', req, payload, orgId: dup[0].id, tokenId: tok.id });
    await notify({ to: { admin: true }, kind: 'signup', title: 'Sign-up repeated: ' + payload.organisation, body: payload.contactName + ' (' + payload.email + ') signed up again from the website; that email already belongs to ' + dup[0].name + ' (' + dup[0].status + '). Nothing was created.', href: '/admin/organisations/' + dup[0].id, orgId: dup[0].id });
    return reply({ ok: true, confirm: true });
  }

  const hash = payloadHash(payload);
  const { rows } = await query(
    `INSERT INTO organisations (name, contact_name, contact_email, phone, website, status, applied_at, formats, about, ip_hash, signup_hash)
     VALUES ($1,$2,$3,$4,$5,'pending',now(),$6,$7,$8,$9) RETURNING id`,
    [payload.organisation, payload.contactName, payload.email, payload.phone || null, payload.website || null, payload.formats.join(', ') || null, payload.about || null, ipHash, hash]
  );
  const id = rows[0].id;
  const auditId = await audit({ outcome: 'created', req, payload, orgId: id, tokenId: tok.id });
  await query('UPDATE organisations SET signup_audit_id = $2 WHERE id = $1', [id, auditId]);

  const raw = await newVerifyToken(id);
  const { text, html } = render({
    heading: 'Hello ' + payload.contactName + ' - please confirm this is your email address so we can register ' + payload.organisation + ' with the CPD Accreditation Scheme.',
    items: [{ title: 'Confirm your email', body: 'The link works once and for ' + VERIFY_DAYS + ' days. Our support team checks every new organisation after that; you will hear from us with your portal login.', href: '/signup/verify?t=' + raw }],
    footer: 'If you did not sign up, ignore this email - nothing is created without this confirmation and a human check.',
  });
  const mail = await sendEmail({ to: payload.email, subject: '[CPD Accreditation] Confirm your email for ' + payload.organisation, text, html });
  await notify({ to: { admin: true }, kind: 'signup', title: 'New organisation sign-up: ' + payload.organisation, body: payload.contactName + ' (' + payload.email + ')' + (payload.formats.length ? ' - ' + payload.formats.join(', ') : '') + '. Email not yet confirmed' + (mail.ok ? '' : ' - the confirmation email FAILED') + '; approval waits for that.', href: '/admin/organisations/' + id, orgId: id });
  return reply({ ok: true, confirm: true }, 201);
}
