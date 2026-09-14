import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

/* The admin's first screen: who is on the platform, what is owed, and what
   providers have done that nobody has read yet. */
export async function GET() {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const [orgs, users, cases, money, events, overdue, pending] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*) FILTER (WHERE status='pending')::int AS pending FROM organisations`),
    query(`SELECT COUNT(*) FILTER (WHERE role='provider')::int AS providers, COUNT(*) FILTER (WHERE role<>'provider')::int AS staff,
                  COUNT(*) FILTER (WHERE active=false)::int AS inactive FROM users`),
    query(`SELECT COUNT(*)::int AS open,
                  COUNT(*) FILTER (WHERE doc->'outcome'->>'approvedAt' IS NOT NULL)::int AS accredited,
                  COUNT(*) FILTER (WHERE org_id IS NULL)::int AS unassigned
             FROM entries WHERE archived_at IS NULL`),
    query(`SELECT COALESCE(SUM(amount_pence) FILTER (WHERE status='issued'),0)::int AS outstanding,
                  COALESCE(SUM(amount_pence) FILTER (WHERE status='issued' AND due_at < CURRENT_DATE),0)::int AS overdue,
                  COALESCE(SUM(amount_pence) FILTER (WHERE status='paid' AND paid_at >= date_trunc('year', CURRENT_DATE)),0)::int AS paid_this_year
             FROM invoices`),
    query(`SELECT pe.id, pe.kind, pe.message, pe.at, pe.entry_id, o.name AS org_name, e.ref, u.name AS by_name
             FROM portal_events pe JOIN organisations o ON o.id = pe.org_id
             LEFT JOIN entries e ON e.id = pe.entry_id LEFT JOIN users u ON u.id = pe.by_user
            WHERE pe.seen_at IS NULL ORDER BY pe.at DESC LIMIT 30`),
    query(`SELECT i.number, i.amount_pence, i.due_at, o.id AS org_id, o.name AS org_name
             FROM invoices i JOIN organisations o ON o.id = i.org_id
            WHERE i.status='issued' AND i.due_at < CURRENT_DATE ORDER BY i.due_at LIMIT 20`),
    query(`SELECT id, name, contact_name, contact_email, phone, website, formats, about, applied_at FROM organisations WHERE status='pending' ORDER BY applied_at`),
  ]);
  return NextResponse.json({
    me: { name: session.user.name },
    organisations: orgs.rows[0], users: users.rows[0], cases: cases.rows[0], money: money.rows[0],
    unseenEvents: events.rows, overdueInvoices: overdue.rows, pendingSignups: pending.rows,
  });
}
