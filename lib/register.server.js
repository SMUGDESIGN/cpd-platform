import { query } from './db';
import { parseLongDate } from './framework';

/* The public register, from the case files: an activity is on it once its
   decision is SIGNED as accredited and the dates are set. What the public
   sees is the published record only - activity, provider, hours, status,
   dates - never anything from inside the assessment. The scheme's own
   say (suspended / withdrawn under D4) sits in entries.register_status. */
export function statusOf(row, today = new Date()) {
  if (row.register_status === 'withdrawn') return 'Withdrawn';
  if (row.register_status === 'suspended') return 'Suspended';
  if (row.org_status === 'suspended' || row.org_status === 'closed') return 'Suspended';
  const exp = parseLongDate((row.doc.outcome || {}).expDate);
  if (exp && exp < today) return 'Expired';
  return row.doc.decision && row.doc.decision.verdict === 'Accredited w/ conditions' ? 'Accredited with conditions' : 'Accredited';
}

export async function lookup(refRaw) {
  const ref = String(refRaw || '').trim().toUpperCase();
  if (!/^[A-Z]{2,4}-\d{4}-\d{3,6}$/.test(ref)) return null;
  const { rows } = await query(
    `SELECT e.id, e.org_id, e.doc, e.register_status, e.register_note, o.status AS org_status
       FROM entries e LEFT JOIN organisations o ON o.id = e.org_id
      WHERE e.archived_at IS NULL AND upper(e.doc->'outcome'->>'accRef') = $1
        AND e.doc->'outcome'->>'approvedAt' IS NOT NULL AND e.doc->'decision'->>'verdict' LIKE 'Accredited%'
      ORDER BY e.updated_at DESC LIMIT 1`, [ref]
  );
  const r = rows[0];
  if (!r) return null;
  const ci = r.doc.caseInfo || {}, o = r.doc.outcome || {};
  const status = statusOf(r);
  const modes = ci.modes || {};
  const modeWords = [modes.el && 'e-learning', modes.lo && 'live online', modes.f2f && 'face-to-face'].filter(Boolean).join(' + ');
  const rec = {
    ref, kind: 'activity', entryId: r.id, orgId: r.org_id,
    activity: ci.activity || '', provider: ci.provider || '', hours: String(ci.hours || ''), mode: modeWords,
    status, accredited: o.accDate || '', expires: o.expDate || '', note: r.register_note || '',
  };
  rec.verify = status === 'Accredited' || status === 'Accredited with conditions'
    ? '✓ Valid - ' + rec.activity + ', ' + rec.provider + '. Accredited Course' + (status === 'Accredited with conditions' ? ' (accredited with conditions)' : '') + (rec.hours ? ', ' + rec.hours + ' CPD hours' : '') + (rec.expires ? ', expires ' + rec.expires : '') + '.'
    : status.toUpperCase() + ' - ' + rec.activity + ', ' + rec.provider + '. This accreditation is not currently valid.' + (rec.note ? ' ' + rec.note : '');
  return rec;
}
