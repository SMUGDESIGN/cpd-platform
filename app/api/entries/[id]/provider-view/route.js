import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';
import { providerView } from '@/lib/providerView';

/* What the provider sees of this case right now - the same function the
   portal uses, so an assessor can check before anything is said. */
export async function GET(_req, { params }) {
  const { res } = await requireInternal();
  if (res) return res;
  const { rows } = await query('SELECT id, ref, doc, summary, org_id, created_at, updated_at FROM entries WHERE id = $1 AND archived_at IS NULL', [params.id]);
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ view: providerView(rows[0]), linked: !!rows[0].org_id });
}
