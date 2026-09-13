import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';
import { aggregate, snapshotOf, surveillanceNote, shareDraft } from '@/lib/feedback';

/* Internal. The feedback picture per accredited activity over the last 12
   months, with the snapshot, share draft and SV-09 note ready-made. Identity
   columns are never selected here. ?ref=ACT-… narrows to one activity. */
export async function GET(req) {
  const { res } = await requireInternal();
  if (res) return res;
  const ref = (new URL(req.url).searchParams.get('ref') || '').trim().toUpperCase();
  const { rows } = await query(
    `SELECT f.acc_ref, f.entry_id, f.org_id, f.answers, f.comments, f.submitted_at,
            e.activity, e.provider, o.name AS org_name
       FROM feedback_responses f LEFT JOIN entries e ON e.id = f.entry_id LEFT JOIN organisations o ON o.id = f.org_id
      WHERE f.submitted_at > now() - interval '12 months' ${ref ? 'AND f.acc_ref = $1' : ''}
      ORDER BY f.submitted_at DESC`, ref ? [ref] : []
  );
  const byRef = {};
  rows.forEach((r) => { (byRef[r.acc_ref] || (byRef[r.acc_ref] = [])).push(r); });
  const activities = Object.keys(byRef).map((k) => {
    const rs = byRef[k];
    const a = aggregate(rs);
    const first = rs[0];
    const activity = first.activity || k;
    return { ref: k, entryId: first.entry_id, orgId: first.org_id, activity, provider: first.provider || first.org_name || '', orgName: first.org_name || '',
      ...a, snapshot: snapshotOf(a), note: surveillanceNote(a), draft: shareDraft(a, activity) };
  });
  const order = { red: 0, amber: 1, green: 2 };
  activities.sort((x, y) => (order[x.flag] - order[y.flag]) || (y.n - x.n));
  const total = (await query('SELECT COUNT(*)::int AS n FROM feedback_responses')).rows[0].n;
  return NextResponse.json({ activities, responses12m: rows.length, responsesTotal: total });
}
