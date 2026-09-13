import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

/* Record a payment, or void. An invoice is never deleted. */
export async function PUT(req, { params }) {
  const { res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const status = ['issued', 'paid', 'void'].includes(b.status) ? b.status : null;
  if (!status) return NextResponse.json({ error: 'status must be issued, paid or void' }, { status: 400 });
  const paidAt = status === 'paid' ? (/^\d{4}-\d{2}-\d{2}$/.test(b.paidAt || '') ? b.paidAt : new Date().toISOString().slice(0, 10)) : null;
  const { rowCount } = await query(
    'UPDATE invoices SET status = $2, paid_at = $3, notes = COALESCE($4, notes) WHERE id = $1', [id, status, paidAt, b.notes ?? null]
  );
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
