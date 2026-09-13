import { notify } from './notify.server';
import { COMPLETENESS_TEXT } from './framework';

/* What changed in a case that the PROVIDER should hear about - decided by
   comparing the document before and after an assessor's save. Same rule as
   the portal view: only things that have been communicated. The assessor
   is the actor, so nothing here goes to staff. */
function verdictWords(v) {
  if (v === 'Accredited') return 'Accredited';
  if (v === 'Accredited w/ conditions') return 'Accredited, with conditions';
  return 'Not accredited on this attempt';
}

export async function notifyProviderOfCaseChanges({ entryId, ref, orgId, before, after, actorId }) {
  if (!orgId) return;
  const b = before || {}, a = after || {};
  const href = '/portal/cases/' + encodeURIComponent(entryId);
  const label = ref ? ref + ': ' : '';
  const out = [];

  const rb = (b.returns || []).length, ra = (a.returns || []).length;
  if (ra > rb) {
    const items = (a.returns[ra - 1].items || []).map((id) => COMPLETENESS_TEXT[id] || id);
    out.push({ kind: 'returned', title: label + 'Your submission has been returned - items needed', body: items.join('; '), dedupeKey: 'returned:' + entryId + ':' + ra });
  }
  const nb = b.notices || {}, na = a.notices || {};
  Object.keys(na).forEach((k) => {
    if (na[k] && na[k].contactedAt && !(nb[k] && nb[k].contactedAt)) {
      out.push({ kind: 'ask', title: label + 'We need something from you', body: na[k].ask || 'See your case for what we need.', dedupeKey: 'ask:' + entryId + ':' + k + ':' + na[k].contactedAt });
    }
  });
  const db = b.deferral || {}, da = a.deferral || {};
  if (da.issuedAt && !db.issuedAt) out.push({ kind: 'deferral', title: label + 'A fix window has been issued', body: 'Put the listed items right by ' + da.due + '. There is no second deferral.', dedupeKey: 'deferral:' + entryId + ':' + da.issuedAt });
  if (da.recheckedAt && !db.recheckedAt) out.push({ kind: 'deferral', title: label + 'Re-check complete', body: 'See your case for the outcome.', dedupeKey: 'recheck:' + entryId + ':' + da.recheckedAt });
  if (a.decision && a.decision.verdict && !(b.decision && b.decision.verdict)) {
    out.push({ kind: 'decision', title: label + 'Decision: ' + verdictWords(a.decision.verdict), body: 'Signed ' + String(a.decision.signedAt || '').slice(0, 10) + '. Full detail on your case page.', dedupeKey: 'decision:' + entryId + ':' + a.decision.signedAt });
  }
  const ob = b.outcome || {}, oa = a.outcome || {};
  if (oa.approvedAt && !ob.approvedAt) out.push({ kind: 'issued', title: label + 'Accreditation issued - ' + (oa.accRef || ''), body: 'Accredited ' + (oa.accDate || '') + ', valid until ' + (oa.expDate || '') + '. Your certificate and register entry follow.', dedupeKey: 'issued:' + entryId + ':' + oa.approvedAt });
  const cb = Object.fromEntries((b.conditions || []).map((c) => [c.id, c]));
  (a.conditions || []).forEach((c) => {
    const prev = cb[c.id];
    if (!prev) out.push({ kind: 'condition', title: label + 'A condition has been set', body: c.text, dedupeKey: 'cond:' + entryId + ':' + c.id });
    else if (prev.status !== c.status && c.status === 'unmet') out.push({ kind: 'condition', title: label + 'A condition was recorded as not met - your accreditation is at risk', body: c.text, dedupeKey: 'cond-unmet:' + entryId + ':' + c.id + ':' + c.closedAt });
    else if (prev.status !== c.status && c.status === 'met') out.push({ kind: 'condition', title: label + 'A condition was recorded as met', body: c.text, dedupeKey: 'cond-met:' + entryId + ':' + c.id + ':' + c.closedAt });
  });
  const sb = b.surveillance || {}, sa = a.surveillance || {};
  ['sv1', 'sv2'].forEach((k, i) => {
    if (sa[k] && sa[k].outcome && !(sb[k] && sb[k].outcome)) {
      out.push({ kind: 'review', title: label + (i ? 'Second' : 'First') + ' annual review outcome recorded: ' + sa[k].outcome, body: sa[k].outcome === 'conditions' ? 'Named actions follow - see your case.' : (sa[k].outcome === 'escalate' ? 'We will be in touch about the next step.' : 'Thank you - nothing further needed until the next review.'), dedupeKey: 'sv:' + entryId + ':' + k + ':' + sa[k].completedAt });
    }
  });
  for (const n of out) await notify({ to: { orgId }, exclude: actorId, href, entryId, orgId, ...n });
  return out.length;
}
