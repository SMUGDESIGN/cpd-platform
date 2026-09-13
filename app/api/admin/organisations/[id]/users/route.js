import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { createUser } from '@/lib/accounts.server';

/* A provider's person. The one-time password comes back once, for the admin
   to pass on; it is never shown again. */
export async function POST(req, { params }) {
  const { res } = await requireAdmin();
  if (res) return res;
  const id = Number(params.id);
  const org = (await query('SELECT id FROM organisations WHERE id = $1', [id])).rows[0];
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  try {
    const out = await createUser({ name: b.name, email: b.email, role: 'provider', orgId: id });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
