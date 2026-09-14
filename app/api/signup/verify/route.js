import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { notify } from '@/lib/notify.server';
import { confirmEmail, audit } from '@/lib/signup.server';

/* Public, same-origin (the /signup/verify page). POST, never GET: mail
   scanners follow links, and a confirmation must be a person's click. */
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const org = await confirmEmail(b.t);
  if (!org) { await audit({ outcome: 'bad_token', req, note: 'email confirmation' }); return NextResponse.json({ error: 'This confirmation link is not valid - it may have expired or been used already. Sign up again from the website if you need to.' }, { status: 400 }); }
  await audit({ outcome: 'verified', req, orgId: org.id });
  await query('INSERT INTO portal_events (org_id, kind, message, seen_at) VALUES ($1, $2, $3, now())', [org.id, 'email_confirmed', org.contact_name + ' confirmed ' + org.contact_email]);
  await notify({ to: { admin: true }, kind: 'signup', title: 'Email confirmed: ' + org.name, body: org.contact_name + ' (' + org.contact_email + ') confirmed their address. The sign-up can be vetted and approved.', href: '/admin/organisations/' + org.id, orgId: org.id, dedupeKey: 'signup-verified:' + org.id });
  return NextResponse.json({ ok: true, name: org.name });
}
