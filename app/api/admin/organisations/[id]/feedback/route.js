import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';
import { notify } from '@/lib/notify.server';

/* Share feedback with a provider: a plain-English note, a RAG, and the numbers
   it rests on. A person decides to share; nothing here is automatic. */
export async function POST(req, { params }) {
  const { session, res } = await requireInternal();
  if (res) return res;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const rag = ['green', 'amber', 'red'].includes(b.rag) ? b.rag : 'amber';
  const message = String(b.message || '').trim();
  if (!message) return NextResponse.json({ error: 'A message is required' }, { status: 400 });
  const entryId = b.entryId ? String(b.entryId) : null;
  if (entryId) {
    const own = (await query('SELECT 1 FROM entries WHERE id = $1 AND org_id = $2', [entryId, id])).rowCount;
    if (!own) return NextResponse.json({ error: 'That case does not belong to this provider' }, { status: 400 });
  }
  let snapshot = null;
  if (b.snapshot && typeof b.snapshot === 'object') snapshot = b.snapshot;
  const { rows } = await query(
    `INSERT INTO feedback_notices (org_id, entry_id, rag, message, snapshot, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [id, entryId, rag, message, snapshot ? JSON.stringify(snapshot) : null, session.user.id]
  );
  await notify({ to: { orgId: id }, kind: 'feedback', title: 'Learner feedback shared with you' + (rag === 'red' ? ' - action needed' : (rag === 'amber' ? ' - needs attention' : '')), body: message.slice(0, 300), href: '/portal/feedback', orgId: id, entryId });
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
