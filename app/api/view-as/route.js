import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { getSession, unauthorised, forbidden } from '@/lib/session';

/* View-as: set or clear the cookie the session callback reads (lib/auth.js).
   Only a REAL superadmin may set it - realRole is what the database said
   before any override, so a superadmin already viewing as support can still
   switch or clear. The cookie is httpOnly and same-site: nothing in the page
   can read or forge it. */
const ASSUMABLE = ['support', 'assessor', 'moderator', 'coordinator', 'provider'];
const COOKIE = 'cpd-view-as';

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorised();
  if (session.user.realRole !== 'superadmin') return NextResponse.json({ available: false });
  const { rows } = await query("SELECT id, name FROM organisations WHERE status <> 'closed' ORDER BY name");
  return NextResponse.json({ available: true, viewingAs: session.user.viewingAs || null, orgId: session.user.viewingAs === 'provider' ? session.user.orgId : null, roles: ASSUMABLE, organisations: rows });
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return unauthorised();
  if (session.user.realRole !== 'superadmin') return forbidden();
  const b = await req.json().catch(() => ({}));
  const role = String(b.role || '');
  if (!ASSUMABLE.includes(role)) return NextResponse.json({ error: 'Choose one of ' + ASSUMABLE.join(', ') }, { status: 400 });
  let value = role;
  if (role === 'provider') {
    const orgId = Number(b.orgId);
    if (!(orgId > 0)) return NextResponse.json({ error: 'Pick an organisation to view as' }, { status: 400 });
    const { rows } = await query('SELECT id FROM organisations WHERE id = $1', [orgId]);
    if (!rows[0]) return NextResponse.json({ error: 'That organisation does not exist' }, { status: 400 });
    value = 'provider:' + orgId;
  }
  cookies().set(COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
  return NextResponse.json({ ok: true, viewingAs: role });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorised();
  cookies().set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return NextResponse.json({ ok: true });
}
