import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';

/* Link a case to this provider (cases opened in the tool before the portal
   existed have no owner). The case's provider name is set from the
   organisation if the document has none. */
export async function POST(req, { params }) {
  const { session, res } = await requireInternal();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const entryId = String(b.entryId || '');
  const org = (await query('SELECT name FROM organisations WHERE id = $1', [id])).rows[0];
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { rowCount } = await query(
    `UPDATE entries SET org_id = $2, provider = COALESCE(NULLIF(provider,''), $3),
            doc = jsonb_set(doc, '{caseInfo,provider}', to_jsonb(COALESCE(NULLIF(doc->'caseInfo'->>'provider',''), $3::text))),
            updated_by = $4, updated_at = now()
      WHERE id = $1 AND archived_at IS NULL AND org_id IS NULL`, [entryId, id, org.name, session.user.id]
  );
  if (!rowCount) return NextResponse.json({ error: 'That case is not available to assign' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
