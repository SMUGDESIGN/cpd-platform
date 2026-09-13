import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireInternal, requireCaseEditor } from '@/lib/session';
import { surveillanceInfo } from '@/lib/scoring';

/* The caseload. Listing fields only - the document itself comes from /api/entries/[id]. */
export async function GET() {
  const { session, res } = await requireInternal();
  if (res) return res;
  const { rows } = await query(
    `SELECT e.id, e.ref, e.activity, e.provider, e.summary, e.framework, e.version,
            e.updated_at, u.name AS updated_by_name, e.org_id, o.name AS org_name,
            e.doc->'outcome' AS outcome, e.doc->'surveillance' AS surveillance
       FROM entries e LEFT JOIN users u ON u.id = e.updated_by LEFT JOIN organisations o ON o.id = e.org_id
      WHERE e.archived_at IS NULL
      ORDER BY e.updated_at DESC`
  );
  /* the review-due column, from the accreditation date */
  const entries = rows.map((r) => {
    const info = surveillanceInfo({ outcome: r.outcome || {}, surveillance: r.surveillance || {} });
    const { outcome, surveillance, ...rest } = r;
    return { ...rest, review: info ? { flag: info.flag, short: info.short, label: info.label } : null };
  });
  return NextResponse.json({ entries });
}

/* Create a case from a full document (a renewal duplicate, or a case file
   brought in from elsewhere). The caller may supply the id; else it is minted. */
export async function POST(req) {
  const { session, res } = await requireCaseEditor();
  if (res) return res;
  const body = await req.json().catch(() => null);
  const doc = body?.doc;
  if (!doc || typeof doc !== 'object' || typeof doc.caseInfo !== 'object') {
    return NextResponse.json({ error: 'A case document with caseInfo is required' }, { status: 400 });
  }
  const id = typeof body.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.id) ? body.id : 'e' + Date.now();
  /* a renewal inherits the provider of the case it was duplicated from */
  let orgId = null;
  if (typeof body.copyOrgFrom === 'string') {
    const { rows: src } = await query('SELECT org_id FROM entries WHERE id = $1', [body.copyOrgFrom]);
    orgId = src[0]?.org_id || null;
  }
  const row = await withTransaction(async (tx) => {
    const { rows } = await tx(
      `INSERT INTO entries (id, ref, activity, provider, doc, summary, framework, version, created_by, updated_by, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8, $9)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, version`,
      [id, doc.caseInfo.ref || null, doc.caseInfo.activity || null, doc.caseInfo.provider || null,
       JSON.stringify(doc), JSON.stringify(body.summary || null), doc.framework || null, session.user.id, orgId]
    );
    if (!rows[0]) return null;
    await tx('INSERT INTO entry_versions (entry_id, version, doc, saved_by) VALUES ($1, 1, $2, $3)',
      [id, JSON.stringify(doc), session.user.id]);
    return rows[0];
  });
  if (!row) return NextResponse.json({ error: 'An entry with that id already exists' }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
}
