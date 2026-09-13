import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { resetPassword } from '@/lib/accounts.server';
import { INTERNAL_ROLES, canGrantRole, canTouchAccount } from '@/lib/permissions';

/* Change a person's role or name, deactivate or reactivate. Never delete: a
   signed decision names a person and that name must resolve for ever.
   Nobody deactivates themselves; support cannot touch a superadmin; only a
   superadmin grants or removes a privileged role. */
export async function PUT(req, { params }) {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const cur = (await query('SELECT role, org_id FROM users WHERE id = $1', [id])).rows[0];
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canTouchAccount(session, cur.role)) return NextResponse.json({ error: 'Only a super admin can change that account' }, { status: 403 });
  if (id === Number(session.user.id) && b.active === false) return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
  let role = cur.role;
  if (b.role && b.role !== cur.role) {
    if (cur.org_id || !INTERNAL_ROLES.includes(b.role)) return NextResponse.json({ error: 'That role change is not allowed' }, { status: 400 });
    if (!canGrantRole(session, b.role)) return NextResponse.json({ error: 'Only a super admin can grant the ' + b.role + ' role' }, { status: 403 });
    if (id === Number(session.user.id) && session.user.role === 'superadmin') return NextResponse.json({ error: 'A super admin cannot demote themselves - ask another super admin' }, { status: 400 });
    role = b.role;
  }
  await query('UPDATE users SET role = $2, active = COALESCE($3, active), name = COALESCE(NULLIF($4,\'\'), name) WHERE id = $1',
    [id, role, typeof b.active === 'boolean' ? b.active : null, b.name ? String(b.name).trim() : null]);
  return NextResponse.json({ ok: true });
}

/* Reset a password: a new one-time password, returned once. */
export async function POST(req, { params }) {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'reset-password') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const cur = (await query('SELECT role FROM users WHERE id = $1', [id])).rows[0];
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canTouchAccount(session, cur.role)) return NextResponse.json({ error: 'Only a super admin can reset that account' }, { status: 403 });
  const password = await resetPassword(id);
  return NextResponse.json({ password });
}
