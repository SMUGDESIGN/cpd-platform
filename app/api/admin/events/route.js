import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';

/* Mark provider events as read. Any internal person may; the point is that
   "unread" means nobody has looked, not that a particular person has not. */
export async function PUT(req) {
  const { res } = await requireInternal();
  if (res) return res;
  const body = await req.json().catch(() => ({}));
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => n > 0);
  if (!ids.length) return NextResponse.json({ ok: true, count: 0 });
  const { rowCount } = await query('UPDATE portal_events SET seen_at = now() WHERE id = ANY($1::int[]) AND seen_at IS NULL', [ids]);
  return NextResponse.json({ ok: true, count: rowCount });
}
