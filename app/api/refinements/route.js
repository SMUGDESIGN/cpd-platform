import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireInternal } from '@/lib/session';

/* The proposal queue, as the tool holds it: { id: {text, notNeeded, by, at, reason, history} }. */
export async function GET() {
  const { session, res } = await requireInternal();
  if (res) return res;
  const { rows } = await query('SELECT id, data FROM refinements ORDER BY id');
  const refinements = {};
  rows.forEach((r) => { refinements[r.id] = r.data; });
  return NextResponse.json({ refinements });
}

/* Replace the whole set: rows not in the body are removed (the tool deletes a
   refinement by leaving it out, e.g. "Restore original"). */
export async function PUT(req) {
  const { session, res } = await requireInternal();
  if (res) return res;
  const body = await req.json().catch(() => null);
  const refinements = body?.refinements;
  if (!refinements || typeof refinements !== 'object') {
    return NextResponse.json({ error: 'refinements object required' }, { status: 400 });
  }
  const ids = Object.keys(refinements).filter((k) => /^[A-Za-z0-9.\-_]{1,32}$/.test(k));
  await withTransaction(async (tx) => {
    for (const id of ids) {
      await tx(
        `INSERT INTO refinements (id, data, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [id, JSON.stringify(refinements[id]), session.user.id]
      );
    }
    if (ids.length) await tx('DELETE FROM refinements WHERE NOT (id = ANY($1::text[]))', [ids]);
    else await tx('DELETE FROM refinements');
  });
  return NextResponse.json({ ok: true, count: ids.length });
}
