import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

/* Billing due: every issued invoice across the platform, oldest due first,
   with the organisation, the case it belongs to and the chase history, so
   support works the money from one screen. */
export async function GET() {
  const { res } = await requireAdmin();
  if (res) return res;
  const { rows } = await query(
    `SELECT i.id, i.number, i.description, i.amount_pence, i.issued_at, i.due_at, i.reminders, i.reminded_at,
            o.id AS org_id, o.name AS org_name, o.contact_name, o.contact_email, o.phone,
            e.ref AS case_ref, e.id AS entry_id,
            (CURRENT_DATE - i.due_at)::int AS days_overdue
       FROM invoices i JOIN organisations o ON o.id = i.org_id LEFT JOIN entries e ON e.id = i.entry_id
      WHERE i.status = 'issued'
      ORDER BY i.due_at NULLS LAST, i.issued_at, i.id`
  );
  const total = rows.reduce((s, r) => s + r.amount_pence, 0);
  const overdue = rows.filter((r) => r.days_overdue > 0).reduce((s, r) => s + r.amount_pence, 0);
  return NextResponse.json({ invoices: rows, total, overdue });
}
