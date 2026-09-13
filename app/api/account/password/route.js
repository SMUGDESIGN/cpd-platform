import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSession, unauthorised } from '@/lib/session';

export async function POST(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  const body = await req.json().catch(() => ({}));
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (next.length < 12) return NextResponse.json({ error: 'Use at least 12 characters.' }, { status: 400 });
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [session.user.id]);
  if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) {
    return NextResponse.json({ error: 'Current password is wrong.' }, { status: 400 });
  }
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [session.user.id, await bcrypt.hash(next, 10)]);
  return NextResponse.json({ ok: true });
}
