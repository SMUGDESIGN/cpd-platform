import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin, requireInternal } from '@/lib/session';

/* Every provider with what they hold and what they owe. */
export async function GET() {
  const { res } = await requireInternal();
  if (res) return res;
  const { rows } = await query(
    `SELECT o.id, o.name, o.contact_name, o.contact_email, o.status, o.created_at,
            (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id AND u.active) AS people,
            (SELECT COUNT(*)::int FROM entries e WHERE e.org_id = o.id AND e.archived_at IS NULL) AS cases,
            (SELECT COUNT(*)::int FROM entries e WHERE e.org_id = o.id AND e.archived_at IS NULL AND e.doc->'outcome'->>'approvedAt' IS NOT NULL) AS accredited,
            (SELECT COALESCE(SUM(amount_pence),0)::int FROM invoices i WHERE i.org_id = o.id AND i.status='issued') AS owed_pence,
            (SELECT COUNT(*)::int FROM invoices i WHERE i.org_id = o.id AND i.status='issued' AND i.due_at < CURRENT_DATE) AS overdue_invoices,
            (SELECT COUNT(*)::int FROM portal_events pe WHERE pe.org_id = o.id AND pe.seen_at IS NULL) AS unseen
       FROM organisations o ORDER BY o.name`
  );
  return NextResponse.json({ organisations: rows });
}

export async function POST(req) {
  const { res } = await requireAdmin();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
  const { rows } = await query(
    `INSERT INTO organisations (name, contact_name, contact_email, phone, address, website, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [name, b.contactName || null, (b.contactEmail || '').trim().toLowerCase() || null, b.phone || null, b.address || null, b.website || null, b.notes || null]
  );
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
