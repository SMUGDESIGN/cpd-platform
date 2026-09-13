import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireProvider } from '@/lib/session';
import { notify } from '@/lib/notify.server';

export async function GET() {
  const { orgId, res } = await requireProvider();
  if (res) return res;
  const { rows } = await query(
    `SELECT fn.id, fn.rag, fn.message, fn.snapshot, fn.created_at, fn.acknowledged_at, fn.response, e.ref, e.activity
       FROM feedback_notices fn LEFT JOIN entries e ON e.id = fn.entry_id WHERE fn.org_id = $1 ORDER BY fn.created_at DESC`, [orgId]
  );
  return NextResponse.json({ notices: rows });
}

/* Acknowledge a notice and say what will be done. Recorded once; a later
   change of plan is a new message to the scheme, not an edit. */
export async function POST(req) {
  const { session, orgId, res } = await requireProvider();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const response = String(b.response || '').trim().slice(0, 4000);
  if (!id || !response) return NextResponse.json({ error: 'Say what you will do' }, { status: 400 });
  const { rows } = await query(
    `UPDATE feedback_notices SET acknowledged_at = now(), acknowledged_by = $3, response = $4
      WHERE id = $1 AND org_id = $2 AND acknowledged_at IS NULL RETURNING entry_id`, [id, orgId, session.user.id, response]
  );
  if (!rows[0]) return NextResponse.json({ error: 'Not found, or already acknowledged' }, { status: 404 });
  await query('INSERT INTO portal_events (org_id, entry_id, kind, message, by_user) VALUES ($1,$2,$3,$4,$5)',
    [orgId, rows[0].entry_id, 'feedback_ack', 'Feedback acknowledged: ' + response.slice(0, 200), session.user.id]);
  await notify({ to: { internal: true }, kind: 'feedback', title: (session.user.orgName || 'A provider') + ' responded to shared feedback', body: response.slice(0, 300), href: rows[0].entry_id ? '/learner-feedback' : '/admin/organisations/' + orgId, entryId: rows[0].entry_id, orgId });
  return NextResponse.json({ ok: true });
}
