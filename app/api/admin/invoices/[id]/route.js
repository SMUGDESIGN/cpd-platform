import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { notify } from '@/lib/notify.server';

/* Record a payment, or void. An invoice is never deleted. */
export async function PUT(req, { params }) {
  const { res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const status = ['issued', 'paid', 'void'].includes(b.status) ? b.status : null;
  if (!status) return NextResponse.json({ error: 'status must be issued, paid or void' }, { status: 400 });
  const paidAt = status === 'paid' ? (/^\d{4}-\d{2}-\d{2}$/.test(b.paidAt || '') ? b.paidAt : new Date().toISOString().slice(0, 10)) : null;
  const { rows } = await query(
    'UPDATE invoices SET status = $2, paid_at = $3, notes = COALESCE($4, notes) WHERE id = $1 RETURNING org_id, number, amount_pence', [id, status, paidAt, b.notes ?? null]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const r = rows[0];
  if (status === 'paid') await notify({ to: { orgId: r.org_id }, kind: 'invoice', title: 'Invoice ' + r.number + ' marked paid - thank you', body: '£' + (r.amount_pence / 100).toFixed(2) + ' received ' + paidAt + '.', href: '/portal/billing', orgId: r.org_id });
  if (status === 'void') await notify({ to: { orgId: r.org_id }, kind: 'invoice', title: 'Invoice ' + r.number + ' cancelled', body: 'Nothing is owed on it.', href: '/portal/billing', orgId: r.org_id });
  return NextResponse.json({ ok: true });
}

/* Chase: { action: 'remind', note? }. Only an issued invoice can be chased.
   The organisation gets a notification (and email, by their preference), the
   org's activity log records who chased and when, and the invoice keeps the
   count. No dedupe key - every chase is a real one and each is delivered. */
export async function POST(req, { params }) {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'remind') return NextResponse.json({ error: 'action must be remind' }, { status: 400 });
  const note = String(b.note || '').trim().slice(0, 500);
  const { rows } = await query(
    `UPDATE invoices SET reminders = reminders + 1, reminded_at = now() WHERE id = $1 AND status = 'issued'
     RETURNING org_id, entry_id, number, amount_pence, due_at, reminders, reminded_at`, [id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Only an issued invoice can be chased' }, { status: 404 });
  const r = rows[0];
  const amount = '£' + (r.amount_pence / 100).toFixed(2);
  const overdue = r.due_at && String(r.due_at).slice(0, 10) < new Date().toISOString().slice(0, 10);
  const due = r.due_at ? (overdue ? 'was due ' : 'is due ') + String(r.due_at).slice(0, 10) : 'is outstanding';
  await notify({ to: { orgId: r.org_id }, kind: 'invoice', title: 'Reminder: invoice ' + r.number + (overdue ? ' is overdue' : ' is due'),
    body: amount + ' ' + due + '. Please pay by bank transfer quoting the invoice number.' + (note ? ' ' + note : ''), href: '/portal/billing', orgId: r.org_id });
  await query('INSERT INTO portal_events (org_id, entry_id, kind, message, by_user, seen_at) VALUES ($1, $2, $3, $4, $5, now())',
    [r.org_id, r.entry_id, 'reminder', 'Reminder ' + r.reminders + ' sent for ' + r.number + ' (' + amount + ')' + (note ? ': ' + note : ''), session.user.id]);
  return NextResponse.json({ ok: true, reminders: r.reminders, remindedAt: r.reminded_at });
}
