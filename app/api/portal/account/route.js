import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireProvider } from '@/lib/session';

export async function GET() {
  const { orgId, res } = await requireProvider();
  if (res) return res;
  const [org, users] = await Promise.all([
    query('SELECT id, name, contact_name, contact_email, phone, address, website, status FROM organisations WHERE id = $1', [orgId]),
    query('SELECT id, name, email, active FROM users WHERE org_id = $1 ORDER BY name', [orgId]),
  ]);
  return NextResponse.json({ org: org.rows[0], users: users.rows });
}

/* The provider keeps its own contact details current. Name and status are the
   scheme's to change. */
export async function PUT(req) {
  const { orgId, res } = await requireProvider();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  await query(
    'UPDATE organisations SET contact_name = $2, contact_email = $3, phone = $4, address = $5, website = $6, updated_at = now() WHERE id = $1',
    [orgId, String(b.contactName || '').trim() || null, String(b.contactEmail || '').trim().toLowerCase() || null, String(b.phone || '').trim() || null,
     String(b.address || '').trim() || null, String(b.website || '').trim() || null]
  );
  return NextResponse.json({ ok: true });
}
