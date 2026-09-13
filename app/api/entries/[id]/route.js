import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireInternal, requireCaseEditor } from '@/lib/session';
import { notifyProviderOfCaseChanges } from '@/lib/caseEvents.server';

export async function GET(_req, { params }) {
  const { session, res } = await requireInternal();
  if (res) return res;
  const { rows } = await query(
    `SELECT e.id, e.doc, e.summary, e.version, e.framework, e.updated_at, u.name AS updated_by_name
       FROM entries e LEFT JOIN users u ON u.id = e.updated_by
      WHERE e.id = $1 AND e.archived_at IS NULL`, [params.id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

/* Save. The body carries the document, its summary, and the
   version the client READ. A stale version is refused with the current row
   so the client can show what happened rather than overwrite a colleague. */
export async function PUT(req, { params }) {
  const { session, res } = await requireCaseEditor();
  if (res) return res;
  const body = await req.json().catch(() => null);
  const doc = body?.doc;
  if (!doc || typeof doc !== 'object' || typeof doc.caseInfo !== 'object') {
    return NextResponse.json({ error: 'A case document with caseInfo is required' }, { status: 400 });
  }
  const expected = Number(body.version);
  const out = await withTransaction(async (tx) => {
    const { rows: cur } = await tx('SELECT version, updated_by, doc, org_id, ref FROM entries WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [params.id]);
    if (!cur[0]) return { status: 404 };
    if (Number.isFinite(expected) && cur[0].version !== expected) {
      const { rows: who } = await tx('SELECT name FROM users WHERE id = $1', [cur[0].updated_by]);
      return { status: 409, current: cur[0].version, by: who[0]?.name || null };
    }
    const next = cur[0].version + 1;
    await tx(
      `UPDATE entries SET doc = $2, summary = $3, ref = $4, activity = $5, provider = $6, framework = $7,
              version = $8, updated_by = $9, updated_at = now()
        WHERE id = $1`,
      [params.id, JSON.stringify(doc), JSON.stringify(body.summary || null), doc.caseInfo.ref || null,
       doc.caseInfo.activity || null, doc.caseInfo.provider || null, doc.framework || null, next, session.user.id]
    );
    await tx('INSERT INTO entry_versions (entry_id, version, doc, saved_by) VALUES ($1, $2, $3, $4)',
      [params.id, next, JSON.stringify(doc), session.user.id]);
    return { status: 200, version: next, before: cur[0].doc, orgId: cur[0].org_id, ref: doc.caseInfo.ref || cur[0].ref };
  });
  if (out.status === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (out.status === 409) {
    return NextResponse.json({ error: 'Saved elsewhere since you opened it', current: out.current, by: out.by }, { status: 409 });
  }
  /* after the commit: tell the provider what has changed for them, if anything */
  try { await notifyProviderOfCaseChanges({ entryId: params.id, ref: out.ref, orgId: out.orgId, before: out.before, after: doc, actorId: session.user.id }); }
  catch (e) { console.error('notify after save failed', e); }
  return NextResponse.json({ id: params.id, version: out.version });
}

/* Archive, never delete: the row and its history stay. */
export async function DELETE(_req, { params }) {
  const { session, res } = await requireCaseEditor();
  if (res) return res;
  const { rowCount } = await query(
    'UPDATE entries SET archived_at = now(), updated_by = $2 WHERE id = $1 AND archived_at IS NULL',
    [params.id, session.user.id]
  );
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
