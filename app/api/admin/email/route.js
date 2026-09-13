import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin, requireSuperAdmin } from '@/lib/session';
import { emailMode, EMAIL_FROM, sendEmail, render } from '@/lib/email.server';
import { deliverDigests } from '@/lib/emailDelivery.server';

/* The email panel: mode, sender, what is waiting, and the recent outbox. */
export async function GET() {
  const { res } = await requireAdmin();
  if (res) return res;
  const [{ rows: waiting }, { rows: outbox }, { rows: prefs }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n, COUNT(DISTINCT n.user_id)::int AS people FROM notifications n JOIN users u ON u.id = n.user_id
            WHERE n.email_sent_at IS NULL AND u.active AND u.email_notifications <> 'off'`),
    query('SELECT id, to_email, subject, status, provider, error, created_at, array_length(notification_ids, 1) AS items FROM email_outbox ORDER BY created_at DESC LIMIT 25'),
    query("SELECT email_notifications AS pref, COUNT(*)::int AS n FROM users WHERE active GROUP BY 1"),
  ]);
  return NextResponse.json({ mode: emailMode(), from: EMAIL_FROM, waiting: waiting[0], outbox, prefs });
}

/* {action:'digests'} sends the daily digests now; {action:'test'} (superadmin)
   sends one email to the signed-in person to prove the route out works. */
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  if (b.action === 'digests') {
    const { res } = await requireAdmin();
    if (res) return res;
    return NextResponse.json({ ok: true, ...(await deliverDigests()) });
  }
  if (b.action === 'test') {
    const { session, res } = await requireSuperAdmin();
    if (res) return res;
    const { text, html } = render({ heading: 'This is a test from the CPD Accreditation Scheme platform.', items: [{ title: 'If you can read this, email delivery works', body: 'Mode: ' + emailMode() + '. Sent to ' + session.user.email + '.', href: '/admin' }], footer: 'Sent by a super admin from the Admin page.' });
    const out = await sendEmail({ userId: session.user.id, to: session.user.email, subject: '[CPD Accreditation] Test email', text, html, notificationIds: [] });
    return NextResponse.json(out, { status: out.ok ? 200 : 502 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
