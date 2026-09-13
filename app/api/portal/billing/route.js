import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireProvider } from '@/lib/session';

export async function GET() {
  const { orgId, res } = await requireProvider();
  if (res) return res;
  const { rows } = await query(
    `SELECT i.id, i.number, i.description, i.amount_pence, i.status, i.issued_at, i.due_at, i.paid_at, e.ref AS case_ref
       FROM invoices i LEFT JOIN entries e ON e.id = i.entry_id WHERE i.org_id = $1 ORDER BY i.issued_at DESC, i.id DESC`, [orgId]
  );
  const outstanding = rows.filter((r) => r.status === 'issued').reduce((s, r) => s + r.amount_pence, 0);
  return NextResponse.json({ invoices: rows, outstandingPence: outstanding });
}
