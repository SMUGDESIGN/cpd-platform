import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { getSession, unauthorised, forbidden } from '@/lib/session';
import { canEditCases } from '@/lib/permissions';

/* The caseload. Listing fields only - the document itself comes from
   /api/entries/[id] or, for the tool's boot, /api/store. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorised();
  const { rows } = await query(
    `SELECT e.id, e.ref, e.activity, e.provider, e.summary, e.framework, e.version,
            e.updated_at, u.name AS updated_by_name
       FROM entries e LEFT JOIN users u ON u.id = e.updated_by
      WHERE e.archived_at IS NULL
      ORDER BY e.updated_at DESC`
  );
  return NextResponse.json({ entries: rows });
}

/* Create a case. The body is the tool's per-entry document; the id is the
   tool's own if it sends one (so an imported JSON file keeps its identity),
   else minted here in the same shape. */
export async function POST(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  if (!canEditCases(session)) return forbidden();
  const body = await req.json().catch(() => null);
  const doc = body?.doc;
  if (!doc || typeof doc !== 'object' || typeof doc.caseInfo !== 'object') {
    return NextResponse.json({ error: 'A case document with caseInfo is required' }, { status: 400 });
  }
  const id = typeof body.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.id) ? body.id : 'e' + Date.now();
  const row = await withTransaction(async (tx) => {
    const { rows } = await tx(
      `INSERT INTO entries (id, ref, activity, provider, doc, summary, framework, version, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, version`,
      [id, doc.caseInfo.ref || null, doc.caseInfo.activity || null, doc.caseInfo.provider || null,
       JSON.stringify(doc), JSON.stringify(body.summary || null), doc.framework || null, session.user.id]
    );
    if (!rows[0]) return null;
    await tx('INSERT INTO entry_versions (entry_id, version, doc, saved_by) VALUES ($1, 1, $2, $3)',
      [id, JSON.stringify(doc), session.user.id]);
    return rows[0];
  });
  if (!row) return NextResponse.json({ error: 'An entry with that id already exists' }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
}
