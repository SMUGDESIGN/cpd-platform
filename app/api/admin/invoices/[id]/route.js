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
