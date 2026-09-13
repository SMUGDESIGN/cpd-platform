import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession, unauthorised } from '@/lib/session';

const PREFS = ['immediate', 'daily', 'off'];

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorised();
  const { rows } = await query('SELECT email, email_notifications FROM users WHERE id = $1', [session.user.id]);
  return NextResponse.json({ email: rows[0]?.email, emailNotifications: rows[0]?.email_notifications || 'immediate' });
}

export async function PUT(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  const b = await req.json().catch(() => ({}));
  if (!PREFS.includes(b.emailNotifications)) return NextResponse.json({ error: 'Choose immediate, daily or off' }, { status: 400 });
  await query('UPDATE users SET email_notifications = $2 WHERE id = $1', [session.user.id, b.emailNotifications]);
  return NextResponse.json({ ok: true });
}
