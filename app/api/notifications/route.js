import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession, unauthorised } from '@/lib/session';

/* Mine. Either house - the rows are already the recipient's own. */
export async function GET(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  const countOnly = new URL(req.url).searchParams.get('count') === '1';
  const { rows: c } = await query('SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL', [session.user.id]);
  if (countOnly) return NextResponse.json({ unread: c[0].unread });
  const { rows } = await query(
    'SELECT id, kind, title, body, href, entry_id, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [session.user.id]
  );
  return NextResponse.json({ unread: c[0].unread, notifications: rows });
}

/* Mark read: {ids:[..]} or {all:true}. */
export async function PUT(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  const b = await req.json().catch(() => ({}));
  if (b.all) {
    const { rowCount } = await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [session.user.id]);
    return NextResponse.json({ ok: true, count: rowCount });
  }
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => n > 0);
  if (!ids.length) return NextResponse.json({ ok: true, count: 0 });
  const { rowCount } = await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::int[]) AND read_at IS NULL', [session.user.id, ids]);
  return NextResponse.json({ ok: true, count: rowCount });
}

/* Clear the already-seen ones - mine only; unread rows are never touched. */
export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorised();
  const { rowCount } = await query('DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL', [session.user.id]);
  return NextResponse.json({ ok: true, count: rowCount });
}
