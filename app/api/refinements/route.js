import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireInternal, requireStage1Editor } from '@/lib/session';
import { outsideStage1Refinements } from '@/lib/stage1';

/* The proposal queue: { id: {text, notNeeded, by, at, reason, history} }. */
export async function GET() {
  const { session, res } = await requireInternal();
  if (res) return res;
  const { rows } = await query('SELECT id, data FROM refinements ORDER BY id');
  const refinements = {};
  rows.forEach((r) => { refinements[r.id] = r.data; });
  return NextResponse.json({ refinements });
}

/* Replace the whole set: rows not in the body are removed ("Restore original"
   deletes a refinement by leaving it out). A Stage-1-only role may move the
   C-items and nothing else; the stored set is compared inside the transaction. */
export async function PUT(req) {
  const { session, scope, res } = await requireStage1Editor();
  if (res) return res;
  const body = await req.json().catch(() => null);
  const refinements = body?.refinements;
  if (!refinements || typeof refinements !== 'object') {
    return NextResponse.json({ error: 'refinements object required' }, { status: 400 });
  }
  const ids = Object.keys(refinements).filter((k) => /^[A-Za-z0-9.\-_]{1,32}$/.test(k));
  const out = await withTransaction(async (tx) => {
    if (scope === 'stage1') {
      const { rows } = await tx('SELECT id, data FROM refinements');
      const stored = {}; rows.forEach((r) => { stored[r.id] = r.data; });
      const moved = outsideStage1Refinements(stored, Object.fromEntries(ids.map((id) => [id, refinements[id]])));
      if (moved.length) return { moved };
    }
    for (const id of ids) {
      await tx(
        `INSERT INTO refinements (id, data, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [id, JSON.stringify(refinements[id]), session.user.id]
      );
    }
    if (ids.length) await tx('DELETE FROM refinements WHERE NOT (id = ANY($1::text[]))', [ids]);
    else await tx('DELETE FROM refinements');
    return {};
  });
  if (out.moved) return NextResponse.json({ error: 'Support may refine the Stage 1 completeness items only - this touched ' + out.moved.join(', '), moved: out.moved }, { status: 403 });
  return NextResponse.json({ ok: true, count: ids.length });
}
