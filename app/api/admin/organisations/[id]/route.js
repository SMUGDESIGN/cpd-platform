import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin, requireInternal } from '@/lib/session';
import { providerView } from '@/lib/providerView';

/* One provider, whole: details, people, cases (as the provider sees them and
   as the assessor sees them), invoices, feedback notices, portal events, and
   the cases not yet assigned to any provider so one can be linked here. */
export async function GET(_req, { params }) {
  const { res } = await requireInternal();
  if (res) return res;
  const id = Number(params.id);
  const org = (await query('SELECT * FROM organisations WHERE id = $1', [id])).rows[0];
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [users, entries, invoices, notices, events, unassigned] = await Promise.all([
    query('SELECT id, name, email, role, initials, active, created_at FROM users WHERE org_id = $1 ORDER BY name', [id]),
    query(`SELECT e.id, e.ref, e.activity, e.summary, e.doc, e.updated_at, e.created_at, u.name AS updated_by_name
             FROM entries e LEFT JOIN users u ON u.id = e.updated_by WHERE e.org_id = $1 AND e.archived_at IS NULL ORDER BY e.updated_at DESC`, [id]),
    query('SELECT * FROM invoices WHERE org_id = $1 ORDER BY issued_at DESC, id DESC', [id]),
    query(`SELECT fn.*, e.ref, u.name AS created_by_name FROM feedback_notices fn LEFT JOIN entries e ON e.id = fn.entry_id
             LEFT JOIN users u ON u.id = fn.created_by WHERE fn.org_id = $1 ORDER BY fn.created_at DESC`, [id]),
    query(`SELECT pe.*, e.ref, u.name AS by_name FROM portal_events pe LEFT JOIN entries e ON e.id = pe.entry_id
             LEFT JOIN users u ON u.id = pe.by_user WHERE pe.org_id = $1 ORDER BY pe.at DESC LIMIT 100`, [id]),
    query('SELECT id, ref, activity, provider FROM entries WHERE org_id IS NULL AND archived_at IS NULL ORDER BY updated_at DESC'),
  ]);
  const cases = entries.rows.map((r) => ({
    id: r.id, ref: r.ref, activity: r.activity, verdict: (r.summary || {}).verdict || 'Not started', vcls: (r.summary || {}).vcls || 'idle',
    updatedAt: r.updated_at, updatedBy: r.updated_by_name, provider: providerView(r),
  }));
  const owed = invoices.rows.filter((i) => i.status === 'issued').reduce((s, i) => s + i.amount_pence, 0);
  return NextResponse.json({ org, users: users.rows, cases, invoices: invoices.rows, owedPence: owed, notices: notices.rows, events: events.rows, unassigned: unassigned.rows });
}

export async function PUT(req, { params }) {
  const { res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const status = ['active', 'suspended', 'closed'].includes(b.status) ? b.status : 'active';
  const { rowCount } = await query(
    `UPDATE organisations SET name = COALESCE(NULLIF($2,''), name), contact_name = $3, contact_email = $4, phone = $5, address = $6,
            website = $7, status = $8, notes = $9, updated_at = now() WHERE id = $1`,
    [id, String(b.name || '').trim(), b.contactName || null, (b.contactEmail || '').trim().toLowerCase() || null, b.phone || null,
     b.address || null, b.website || null, status, b.notes || null]
  );
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
