import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireCaseEditor } from '@/lib/session';
import { blankDoc } from '@/lib/framework';
import { nextRef } from '@/lib/refs.server';

/* Start a case from the staff side (a provider that applied by email or on
   paper, or one not yet on the portal). Mints the reference, optionally links
   the organisation, opens blank at Stage 1. Everything else about the case is
   set up on the Stage 1 page. */
export async function POST(req) {
  const { session, res } = await requireCaseEditor();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  const orgId = Number(b.orgId) > 0 ? Number(b.orgId) : null;
  let org = null;
  if (orgId) {
    org = (await query('SELECT id, name, contact_email FROM organisations WHERE id = $1', [orgId])).rows[0];
    if (!org) return NextResponse.json({ error: 'That organisation does not exist' }, { status: 400 });
  }
  const out = await withTransaction(async (tx) => {
    const ref = await nextRef(tx, 'CA');
    const id = 'e' + Date.now() + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();
    const doc = blankDoc({ ref, activity: String(b.activity || '').trim(), provider: org ? org.name : String(b.provider || '').trim(), providerEmail: org ? (org.contact_email || '') : '' },
      { lead: { name: session.user.name || '', initials: session.user.initials || '' }, remediationLog: [{ id: 'l' + Date.now(), ts: now, text: 'Case opened by ' + session.user.name + (org ? ' for ' + org.name : ''), auto: 1 }] });
    await tx(`INSERT INTO entries (id, ref, activity, provider, doc, summary, framework, version, org_id, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,NULL,$6,1,$7,$8,$8)`,
      [id, ref, doc.caseInfo.activity || null, doc.caseInfo.provider || null, JSON.stringify(doc), doc.framework, orgId, session.user.id]);
    await tx('INSERT INTO entry_versions (entry_id, version, doc, saved_by) VALUES ($1, 1, $2, $3)', [id, JSON.stringify(doc), session.user.id]);
    return { id, ref };
  });
  return NextResponse.json(out, { status: 201 });
}
