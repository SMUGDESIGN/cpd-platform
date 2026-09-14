import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin, requireInternal } from '@/lib/session';
import { providerView } from '@/lib/providerView';
import { createUser } from '@/lib/accounts.server';
import { sendEmail, render, BASE_URL } from '@/lib/email.server';

/* One provider, whole: details, people, cases (as the provider sees them and
   as the assessor sees them), invoices, feedback notices, portal events, and
   the cases not yet assigned to any provider so one can be linked here. */
export async function GET(_req, { params }) {
  const { res } = await requireInternal();
  if (res) return res;
  const id = Number(params.id);
  const org = (await query('SELECT * FROM organisations WHERE id = $1', [id])).rows[0];
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [users, entries, invoices, notices, events, unassigned] = await Promise.all([
    query('SELECT id, name, email, role, initials, active, created_at FROM users WHERE org_id = $1 ORDER BY name', [id]),
    query(`SELECT e.id, e.ref, e.activity, e.summary, e.doc, e.updated_at, e.created_at, u.name AS updated_by_name
             FROM entries e LEFT JOIN users u ON u.id = e.updated_by WHERE e.org_id = $1 AND e.archived_at IS NULL ORDER BY e.updated_at DESC`, [id]),
    query('SELECT * FROM invoices WHERE org_id = $1 ORDER BY issued_at DESC, id DESC', [id]),
    query(`SELECT fn.*, e.ref, u.name AS created_by_name FROM feedback_notices fn LEFT JOIN entries e ON e.id = fn.entry_id
             LEFT JOIN users u ON u.id = fn.created_by WHERE fn.org_id = $1 ORDER BY fn.created_at DESC`, [id]),
    query(`SELECT pe.*, e.ref, u.name AS by_name FROM portal_events pe LEFT JOIN entries e ON e.id = pe.entry_id
             LEFT JOIN users u ON u.id = pe.by_user WHERE pe.org_id = $1 ORDER BY pe.at DESC LIMIT 100`, [id]),
    query('SELECT id, ref, activity, provider FROM entries WHERE org_id IS NULL AND archived_at IS NULL ORDER BY updated_at DESC'),
  ]);
  const cases = entries.rows.map((r) => ({
    id: r.id, ref: r.ref, activity: r.activity, verdict: (r.summary || {}).verdict || 'Not started', vcls: (r.summary || {}).vcls || 'idle',
    updatedAt: r.updated_at, updatedBy: r.updated_by_name, provider: providerView(r),
  }));
  const owed = invoices.rows.filter((i) => i.status === 'issued').reduce((s, i) => s + i.amount_pence, 0);
  return NextResponse.json({ org, users: users.rows, cases, invoices: invoices.rows, owedPence: owed, notices: notices.rows, events: events.rows, unassigned: unassigned.rows });
}

export async function PUT(req, { params }) {
  const { res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const status = ['pending', 'active', 'suspended', 'closed'].includes(b.status) ? b.status : 'active';
  const { rowCount } = await query(
    `UPDATE organisations SET name = COALESCE(NULLIF($2,''), name), contact_name = $3, contact_email = $4, phone = $5, address = $6,
            website = $7, status = $8, notes = $9, updated_at = now() WHERE id = $1`,
    [id, String(b.name || '').trim(), b.contactName || null, (b.contactEmail || '').trim().toLowerCase() || null, b.phone || null,
     b.address || null, b.website || null, status, b.notes || null]
  );
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/* Vetting a sign-up. { action: 'approve' } sets the organisation active,
   creates the contact's portal login and emails them the one-time password
   (the password is also returned once, for support to pass on by phone if
   the email does not land). { action: 'decline', reason } closes it with
   the reason in the internal notes; nothing is sent to the applicant here -
   support writes that themselves. Only a pending organisation is vetted. */
export async function POST(req, { params }) {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const org = (await query('SELECT * FROM organisations WHERE id = $1', [id])).rows[0];
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (org.status !== 'pending') return NextResponse.json({ error: 'Only a pending sign-up can be approved or declined' }, { status: 400 });
  if (b.action === 'decline') {
    const reason = String(b.reason || '').trim().slice(0, 1000);
    await query(`UPDATE organisations SET status = 'closed', decided_by = $2, decided_at = now(), updated_at = now(),
                        notes = COALESCE(notes || E'\n\n', '') || 'Sign-up declined ' || to_char(now(), 'YYYY-MM-DD') || ' by ' || $3 || CASE WHEN $4 <> '' THEN ': ' || $4 ELSE '' END WHERE id = $1`,
      [id, session.user.id, session.user.name, reason]);
    return NextResponse.json({ ok: true, status: 'closed' });
  }
  if (b.action !== 'approve') return NextResponse.json({ error: 'action must be approve or decline' }, { status: 400 });
  if (!org.contact_email || !org.contact_name) return NextResponse.json({ error: 'The organisation needs a contact name and email before it can be approved - edit it first' }, { status: 400 });
  let made;
  try { made = await createUser({ name: org.contact_name, email: org.contact_email, role: 'provider', orgId: id }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  await query(`UPDATE organisations SET status = 'active', decided_by = $2, decided_at = now(), updated_at = now() WHERE id = $1`, [id, session.user.id]);
  const { text, html } = render({
    heading: 'Hello ' + org.contact_name + ' - ' + org.name + ' is now registered with the CPD Accreditation Scheme, and your portal login is ready.',
    items: [
      { title: 'Sign in at ' + BASE_URL + '/login', body: 'Email: ' + org.contact_email + '\nOne-time password: ' + made.password + '\nChange it under Account after your first sign-in.' },
      { title: 'What the portal is for', body: 'Apply for accreditation of each course, webinar or programme, follow each application, reply to what we ask for, and see your invoices, your accredited activities and their review dates.', href: '/portal' },
    ],
    footer: 'The fee is for the assessment and is payable whatever the outcome; you receive the full framework on application. If you did not sign up, reply to this email and we will close the account.',
  });
  const mail = await sendEmail({ userId: made.user.id, to: org.contact_email, subject: '[CPD Accreditation] Your portal login for ' + org.name, text, html });
  await query('INSERT INTO portal_events (org_id, kind, message, by_user, seen_at) VALUES ($1, $2, $3, $4, now())',
    [id, 'approved', 'Sign-up approved; portal login created for ' + org.contact_name + ' (' + org.contact_email + ')' + (mail.ok ? ', login email ' + (mail.mode === 'log' ? 'logged to the outbox' : 'sent') : ', login email FAILED: ' + mail.error), session.user.id]);
  return NextResponse.json({ ok: true, status: 'active', user: made.user, password: made.password, email: mail });
}
