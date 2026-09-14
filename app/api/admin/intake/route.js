import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireInternal } from '@/lib/session';

/* The intake queue: every open case that has not cleared Stage 1 - new
   applications from the portal, cases opened by staff, renewals - oldest
   first, with where it came from, who (if anyone) is leading it, and how
   long it has waited. Support's working list. */
export async function GET() {
  const { res } = await requireInternal();
  if (res) return res;
  const { rows } = await query(
    `SELECT e.id, e.ref, e.activity, e.provider, e.created_at, e.updated_at, e.org_id, o.name AS org_name,
            e.doc->'caseInfo'->>'renewalOf' AS renewal_of, e.doc->'lead'->>'name' AS lead,
            e.summary->'stages'->>'1' AS stage1,
            (SELECT COUNT(*)::int FROM jsonb_each_text(COALESCE(e.doc->'completeness','{}'::jsonb)) t WHERE t.value <> '') AS answered,
            jsonb_array_length(COALESCE(e.doc->'returns','[]'::jsonb)) AS returns,
            cu.role AS opened_by_role, cu.name AS opened_by,
            EXTRACT(DAY FROM now() - e.created_at)::int AS days_waiting
       FROM entries e LEFT JOIN organisations o ON o.id = e.org_id LEFT JOIN users cu ON cu.id = e.created_by
      WHERE e.archived_at IS NULL AND COALESCE(e.summary->'stages'->>'1','') <> 'pass'
      ORDER BY e.created_at`
  );
  const intake = rows.map((r) => ({
    ...r,
    kind: r.renewal_of ? 'renewal' : 'application',
    source: r.opened_by_role === 'provider' ? 'portal' : 'staff',
    state: r.stage1 === 'sent' ? 'with provider' : (r.stage1 === 'act' ? 'action needed' : (r.answered ? 'in progress' : 'untouched')),
  }));
  return NextResponse.json({ intake });
}
