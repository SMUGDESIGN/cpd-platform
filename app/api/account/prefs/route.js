import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession, unauthorised } from '@/lib/session';

const PREFS = ['immediate', 'daily', 'off'];

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorised();
  const { rows } = await query('SELECT email, phone, email_notifications FROM users WHERE id = $1', [session.user.id]);
  return NextResponse.json({ email: rows[0]?.email, phone: rows[0]?.phone || '', emailNotifications: rows[0]?.email_notifications || 'immediate' });
}

export async function PUT(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  const b = await req.json().catch(() => ({}));
  /* the phone alone, or the email preference alone - each field is its own save */
  if (typeof b.phone === 'string') {
    await query('UPDATE users SET phone = $2 WHERE id = $1', [session.user.id, b.phone.trim().slice(0, 40)]);
    if (!b.emailNotifications) return NextResponse.json({ ok: true });
  }
  if (!PREFS.includes(b.emailNotifications)) return NextResponse.json({ error: 'Choose immediate, daily or off' }, { status: 400 });
  await query('UPDATE users SET email_notifications = $2 WHERE id = $1', [session.user.id, b.emailNotifications]);
  return NextResponse.json({ ok: true });
}
