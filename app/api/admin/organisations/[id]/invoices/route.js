import { NextResponse } from 'next/server';
import { withTransaction, query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { nextRef } from '@/lib/refs.server';
import { notify } from '@/lib/notify.server';

/* Raise an invoice to a provider. Amount arrives in pounds from the form and
   is stored in pence. */
export async function POST(req, { params }) {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const pence = Math.round(Number(b.amount) * 100);
  const description = String(b.description || '').trim();
  if (!description || !(pence > 0)) return NextResponse.json({ error: 'A description and an amount above zero are required' }, { status: 400 });
  const org = (await query('SELECT id FROM organisations WHERE id = $1', [id])).rows[0];
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(b.dueAt || '') ? b.dueAt : null;
  const entryId = b.entryId ? String(b.entryId) : null;
  const row = await withTransaction(async (tx) => {
    const number = await nextRef(tx, 'INV');
    const { rows } = await tx(
      `INSERT INTO invoices (org_id, entry_id, number, description, amount_pence, due_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, number`,
      [id, entryId, number, description, pence, dueAt, b.notes || null, session.user.id]
    );
    return rows[0];
  });
  await notify({ to: { orgId: id }, kind: 'invoice', title: 'Invoice ' + row.number + ' - £' + (pence / 100).toFixed(2), body: description + (dueAt ? '. Due ' + dueAt + '.' : '.') + ' Pay by bank transfer quoting the invoice number.', href: '/portal/billing', orgId: id, entryId });
  return NextResponse.json(row, { status: 201 });
}
