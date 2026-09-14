import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { createUser } from '@/lib/accounts.server';
import { INTERNAL_ROLES, canGrantRole } from '@/lib/permissions';

/* Everyone on the platform, staff and provider people, with their organisation. */
export async function GET() {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.initials, u.active, u.created_at, u.org_id, o.name AS org_name,
            (SELECT MAX(at) FROM login_attempts la WHERE la.email = u.email AND la.ok) AS last_login
       FROM users u LEFT JOIN organisations o ON o.id = u.org_id
      ORDER BY (u.role='provider'), (u.role='superadmin') DESC, o.name NULLS FIRST, u.name`
  );
  return NextResponse.json({ users: rows, me: { id: Number(session.user.id), role: session.user.role } });
}

/* A member of staff. Provider people are created from their organisation.
   Support may create assessors, moderators and coordinators; only a
   superadmin may create another superadmin or a support account. */
export async function POST(req) {
  const { session, res } = await requireAdmin();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  if (!INTERNAL_ROLES.includes(b.role)) return NextResponse.json({ error: 'Role must be one of ' + INTERNAL_ROLES.join(', ') }, { status: 400 });
  if (!canGrantRole(session, b.role)) return NextResponse.json({ error: 'Staff accounts are created by a super admin only' }, { status: 403 });
  try {
    const out = await createUser({ name: b.name, email: b.email, role: b.role, orgId: null });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
