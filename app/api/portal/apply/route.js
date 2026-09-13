import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireProvider } from '@/lib/session';
import { blankDoc } from '@/lib/framework';
import { nextRef } from '@/lib/refs.server';

/* A new application. Creates the case in exactly the tool's document shape
   with the facts the provider gave, a reference minted here, and the
   submission on the remediation log; the coordinator picks it up in the
   caseload at Stage 1. */
export async function POST(req) {
  const { session, orgId, res } = await requireProvider();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  const activity = String(b.activity || '').trim();
  if (!activity) return NextResponse.json({ error: 'Name the activity' }, { status: 400 });
  const hours = String(b.hours || '').trim();
  if (!hours || isNaN(Number(hours)) || Number(hours) <= 0) return NextResponse.json({ error: 'Stated CPD hours must be a number above zero' }, { status: 400 });
  const modes = { el: !!b.el, lo: !!b.lo, f2f: !!b.f2f };
  if (!modes.el && !modes.lo && !modes.f2f) return NextResponse.json({ error: 'Pick at least one delivery mode' }, { status: 400 });
  const org = (await query('SELECT name, contact_email, status FROM organisations WHERE id = $1', [orgId])).rows[0];
  if (!org || org.status !== 'active') return NextResponse.json({ error: 'Your organisation cannot submit applications at the moment - contact us' }, { status: 403 });
  const out = await withTransaction(async (tx) => {
    const ref = await nextRef(tx, 'CA');
    const id = 'e' + Date.now() + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();
    const doc = blankDoc({
      ref, activity, provider: org.name, providerEmail: String(b.contactEmail || org.contact_email || session.user.email || '').trim().toLowerCase(),
      hours, modes, assess: b.assess !== false, examBank: !!b.examBank, cert: b.cert !== false,
    }, {
      application: { submittedAt: now, submittedBy: session.user.name, description: String(b.description || '').slice(0, 4000), audience: String(b.audience || '').slice(0, 1000), notes: String(b.notes || '').slice(0, 2000) },
      remediationLog: [{ id: 'l' + Date.now(), ts: now, text: 'Application submitted via the portal by ' + session.user.name, auto: 1 }],
    });
    await tx(
      `INSERT INTO entries (id, ref, activity, provider, doc, summary, framework, version, org_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,NULL,$6,1,$7,$8,$8)`,
      [id, ref, activity, org.name, JSON.stringify(doc), doc.framework, orgId, session.user.id]
    );
    await tx('INSERT INTO entry_versions (entry_id, version, doc, saved_by) VALUES ($1, 1, $2, $3)', [id, JSON.stringify(doc), session.user.id]);
    await tx('INSERT INTO portal_events (org_id, entry_id, kind, message, by_user) VALUES ($1,$2,$3,$4,$5)', [orgId, id, 'submitted', 'New application: ' + activity, session.user.id]);
    return { id, ref };
  });
  return NextResponse.json(out, { status: 201 });
}
