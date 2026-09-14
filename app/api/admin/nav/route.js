import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

/* The counts on the admin sidebar - cheap, so every admin page can ask. */
export async function GET() {
  const { res } = await requireAdmin();
  if (res) return res;
  const { rows } = await query(`SELECT
    (SELECT COUNT(*)::int FROM organisations WHERE status = 'pending') AS pending,
    (SELECT COUNT(*)::int FROM portal_events WHERE seen_at IS NULL) AS unseen,
    (SELECT COUNT(*)::int FROM invoices WHERE status = 'issued' AND due_at < CURRENT_DATE) AS overdue,
    (SELECT COUNT(*)::int FROM entries WHERE archived_at IS NULL AND COALESCE(summary->'stages'->>'1','') <> 'pass') AS intake`);
  return NextResponse.json(rows[0]);
}
