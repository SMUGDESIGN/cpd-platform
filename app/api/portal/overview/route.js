import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireProvider } from '@/lib/session';
import { providerView } from '@/lib/providerView';

/* A provider's home: every case they hold, as they are allowed to see it,
   plus what they owe and any feedback waiting for a reply. Scoped by org. */
export async function GET() {
  const { session, orgId, res } = await requireProvider();
  if (res) return res;
  const [org, entries, money, notices] = await Promise.all([
    query('SELECT id, name, status FROM organisations WHERE id = $1', [orgId]),
    query('SELECT id, ref, doc, summary, created_at, updated_at FROM entries WHERE org_id = $1 AND archived_at IS NULL ORDER BY updated_at DESC', [orgId]),
    query(`SELECT COALESCE(SUM(amount_pence) FILTER (WHERE status='issued'),0)::int AS outstanding,
                  COUNT(*) FILTER (WHERE status='issued' AND due_at < CURRENT_DATE)::int AS overdue FROM invoices WHERE org_id = $1`, [orgId]),
    query('SELECT COUNT(*)::int AS waiting FROM feedback_notices WHERE org_id = $1 AND acknowledged_at IS NULL', [orgId]),
  ]);
  const cases = entries.rows.map(providerView);
  return NextResponse.json({
    org: org.rows[0], me: { name: session.user.name },
    inAssessment: cases.filter((c) => !c.accredited), accredited: cases.filter((c) => c.accredited),
    money: money.rows[0], feedbackWaiting: notices.rows[0].waiting,
  });
}
