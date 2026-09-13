import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { createUser } from '@/lib/accounts.server';
import { INTERNAL_ROLES } from '@/lib/permissions';

/* Everyone on the platform, staff and provider people, with their organisation. */
export async function GET() {
  const { res } = await requireAdmin();
  if (res) return res;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.initials, u.active, u.created_at, u.org_id, o.name AS org_name,
            (SELECT MAX(at) FROM login_attempts la WHERE la.email = u.email AND la.ok) AS last_login
       FROM users u LEFT JOIN organisations o ON o.id = u.org_id ORDER BY (u.role='provider'), o.name NULLS FIRST, u.name`
  );
  return NextResponse.json({ users: rows });
}

/* A member of staff. Provider people are created from their organisation. */
export async function POST(req) {
  const { res } = await requireAdmin();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  if (!INTERNAL_ROLES.includes(b.role)) return NextResponse.json({ error: 'Role must be one of ' + INTERNAL_ROLES.join(', ') }, { status: 400 });
  try {
    const out = await createUser({ name: b.name, email: b.email, role: b.role, orgId: null });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
