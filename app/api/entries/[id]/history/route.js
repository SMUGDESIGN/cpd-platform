import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession, unauthorised } from '@/lib/session';

/* Every accepted save of a case, newest first - who and when. The audit
   trail behind a signed decision. Documents are fetched one at a time by
   ?version=N to keep the list light. */
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return unauthorised();
  const url = new URL(req.url);
  const version = Number(url.searchParams.get('version'));
  if (Number.isFinite(version) && version > 0) {
    const { rows } = await query(
      'SELECT version, doc, saved_at FROM entry_versions WHERE entry_id = $1 AND version = $2', [params.id, version]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  }
  const { rows } = await query(
    `SELECT v.version, v.saved_at, u.name AS saved_by_name
       FROM entry_versions v LEFT JOIN users u ON u.id = v.saved_by
      WHERE v.entry_id = $1 ORDER BY v.version DESC LIMIT 200`, [params.id]
  );
  return NextResponse.json({ versions: rows });
}
