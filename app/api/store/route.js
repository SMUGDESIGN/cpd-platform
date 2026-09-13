import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';

/* Everything the assessor tool needs at boot, in the shape its store already
   has: entries keyed by id, refinements keyed by item id, plus each entry's
   version so its saves can carry the version they read. */
export async function GET() {
  const { session, res } = await requireInternal();
  if (res) return res;
  const [{ rows: entries }, { rows: refinements }] = await Promise.all([
    query('SELECT id, doc, version FROM entries WHERE archived_at IS NULL ORDER BY updated_at DESC'),
    query('SELECT id, data FROM refinements'),
  ]);
  const out = { entries: {}, versions: {}, refinements: {}, user: { id: session.user.id, name: session.user.name, initials: session.user.initials, role: session.user.role } };
  entries.forEach((r) => { out.entries[r.id] = r.doc; out.versions[r.id] = r.version; });
  refinements.forEach((r) => { out.refinements[r.id] = r.data; });
  return NextResponse.json(out);
}
