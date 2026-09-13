/* Stage 6 - decision and remediation loop - as pure functions over the case
   document: the fix list by job, the provider notice
   email written per job, the single deferral as a record with a clock, the
   conditions register, the remediation log and the overviews (partially
   met, N/A with reasons). Nothing here decides the outcome - rule C2 does
   that in lib/scoring; this is the management of what a failing case needs. */
import { INDICATORS } from './frameworkData';
import { applicableIn, deferralInfo, conditionsInfo, formatDateLong, parseLongDate, isoDate } from './scoring';
import { stageRows, jobGroups, naReason } from './stage2';

export const DEFERRAL_DAYS = 56;
function isRemoved(refinements, id) { const r = (refinements || {})[id]; return !!(r && r.notNeeded); }
function displayText(refinements, id, fallback) { const r = (refinements || {})[id]; return r && r.text ? r.text : fallback; }

/* Every failing gate as a row the notice drawer understands. */
export function failingRows(doc, refinements) {
  return [2, 3, 4].flatMap((st) => stageRows(st, doc, refinements)).filter((r) => r.m && !r.removed && r.applicable && r.rating === 'Not met');
}
export function failingGateIds(doc, refinements) { return failingRows(doc, refinements).map((r) => r.id); }

/* Jobs with their rows attached, for the fix list. */
export function jobs(doc, refinements) {
  const rows = failingRows(doc, refinements);
  return jobGroups(doc, refinements).map((g) => ({ ...g, rows: g.gates.map((ind) => rows.find((r) => r.id === ind.id)).filter(Boolean) }));
}

/* What is not a hard stop but still shapes the decision. */
export function overview(doc, refinements) {
  const partial = [], na = [];
  INDICATORS.forEach((ind) => {
    if (isRemoved(refinements, ind.id)) return;
    const d = (doc.indicators || {})[ind.id] || {};
    const app = applicableIn(ind, doc);
    if (app && d.r === 'Partially met') partial.push({ id: ind.id, text: displayText(refinements, ind.id, ind.t), finding: d.e || '' });
    if ((app && d.r === 'N/A') || !app) na.push({ id: ind.id, text: displayText(refinements, ind.id, ind.t), reason: naReason(ind, doc) });
  });
  return { partial, na };
}

/* Every notice ever issued on this case, with its thread - persists after the
   gate is re-marked Met, so it is the full conversation to date. */
export function commsLog(doc, refinements) {
  return INDICATORS.filter((ind) => ind.m).map((ind) => {
    const nt = (doc.notices || {})[ind.id];
    if (!nt || !nt.contactedAt) return null;
    const d = (doc.indicators || {})[ind.id] || {};
    return { id: ind.id, text: displayText(refinements, ind.id, ind.t), notice: nt, resolved: d.r !== 'Not met', finding: d.e || '', cause: d.cause || '' };
  }).filter(Boolean);
}

/* The provider email, written per job. */
export function composeProviderEmail(doc, refinements) {
  const ci = doc.caseInfo || {};
  const ref = ci.ref || '(no reference yet)', activity = ci.activity || 'your submission', provider = ci.provider || 'Provider';
  const js = jobs(doc, refinements);
  const n = failingRows(doc, refinements).length, nj = js.length;
  const di = deferralInfo(doc);
  const windowEnd = di ? formatDateLong(di.due) : null;
  let missingNotice = 0;
  const lines = [];
  js.forEach((job, i) => {
    const lead = job.rows[0] || {};
    const ask = job.ask || (lead.finding ? 'Assessor finding: ' + lead.finding : 'See the framework indicator wording below.');
    const due = job.due || null;
    if (!due) missingNotice++;
    lines.push((i + 1) + '. ' + (job.cause || lead.text || ''));
    lines.push('   Framework indicator' + (job.rows.length === 1 ? '' : 's') + ': ' + job.rows.map((r) => r.id + ' - ' + r.text).join('; '));
    lines.push('   What we need: ' + ask);
    lines.push('   Respond by: ' + (due || windowEnd || 'to be confirmed - the 8-week fix window applies'));
    lines.push('');
  });
  const subject = 'Action required - ' + ref + ' - ' + nj + ' item' + (nj === 1 ? '' : 's') + ' to resolve';
  const body = 'Dear ' + provider + ',\n\n' +
    'Our assessment of "' + activity + '" (ref: ' + ref + ') has identified ' + n + ' mandatory indicator' + (n === 1 ? '' : 's') + ' not yet meeting the standard' + (nj < n ? ', which come down to ' + nj + ' thing' + (nj === 1 ? '' : 's') + ' to put right' : '') + '. Each is listed below with what we need from you and the date by which we need it.\n\n' +
    'This is a single deferral: you have one evidenced opportunity to fix these items within the framework\'s 8-week fix window' + (windowEnd ? ', which ends on ' + windowEnd : '') + '. Once you resubmit, we re-check exactly what is listed here (plus a regression sample) and issue a final decision - there is no second deferral.\n\n' +
    'Outstanding items:\n\n' + (n ? lines.join('\n') : '(none currently on file)\n') +
    '\nIf anything above is unclear, you can ask us to clarify what the framework requires at no cost - we do not sell help passing our own assessment.\n\n' +
    'Kind regards,\nCPD Accreditation Scheme - Assessment Team';
  return { subject, body, to: ci.providerEmail || '', n, nj, missingNotice };
}

/* The remediation log: dated, append-only. */
export function logRemediation(doc, text, auto) {
  doc.remediationLog = Array.isArray(doc.remediationLog) ? doc.remediationLog : [];
  doc.remediationLog.push({ id: 'l' + Date.now() + Math.random().toString(36).slice(2, 5), ts: new Date().toISOString(), text, auto: auto ? 1 : undefined });
}
export function removeRemediationEntry(doc, id) { doc.remediationLog = (doc.remediationLog || []).filter((e) => e.id !== id); }

/* The single deferral. */
export function issueDeferral(doc, refinements, who) {
  if (doc.deferral && doc.deferral.issuedAt) return { ok: false, reason: 'A deferral has already been issued - there is no second deferral.' };
  const items = failingGateIds(doc, refinements);
  if (!items.length) return { ok: false, reason: 'No mandatory gate is failing.' };
  if (!(who || '').trim()) return { ok: false, reason: 'Enter who is issuing the deferral.' };
  const due = new Date(); due.setDate(due.getDate() + DEFERRAL_DAYS);
  doc.deferral = { issuedAt: new Date().toISOString(), by: who.trim(), items, due: isoDate(due), resubmittedAt: null, recheckedAt: null, extensions: [] };
  logRemediation(doc, 'Deferral issued by ' + who.trim() + ' for ' + items.join(', ') + ' - fix window ends ' + formatDateLong(due), true);
  return { ok: true, due };
}
export function markResubmitted(doc) {
  const di = deferralInfo(doc);
  if (!di || di.resubmitted) return { ok: false, reason: 'Nothing to log.' };
  if (di.expired) return { ok: false, reason: 'The fix window ended on ' + formatDateLong(di.due) + '. Extend it with a written reason first, or sign the refusal in Stage 7.' };
  doc.deferral.resubmittedAt = new Date().toISOString();
  logRemediation(doc, 'Resubmission received - ' + di.daysLeft + ' day' + (di.daysLeft === 1 ? '' : 's') + ' before the window ended', true);
  return { ok: true };
}
export function markRechecked(doc, refinements) {
  const di = deferralInfo(doc);
  if (!di || !di.resubmitted || di.rechecked) return { ok: false, reason: 'Nothing to log.' };
  const gF = failingGateIds(doc, refinements);
  doc.deferral.recheckedAt = new Date().toISOString();
  logRemediation(doc, 'Re-check complete - ' + (gF.length ? gF.length + ' gate(s) still failing: ' + gF.join(', ') : 'all gates met'), true);
  return { ok: true, stillFailing: gF.length };
}
export function extendDeferral(doc, days, reason, who) {
  const d = doc.deferral;
  if (!d || d.resubmittedAt) return { ok: false, reason: 'Nothing to extend.' };
  if (!(days > 0)) return { ok: false, reason: 'Enter a number of days.' };
  if (!(reason || '').trim()) return { ok: false, reason: 'A reason is required - it is recorded on the entry.' };
  const to = new Date(d.due + 'T12:00:00'); to.setDate(to.getDate() + days);
  d.extensions = Array.isArray(d.extensions) ? d.extensions : [];
  d.extensions.push({ from: d.due, to: isoDate(to), reason: reason.trim(), by: (who || d.by || '').trim(), at: new Date().toISOString() });
  logRemediation(doc, 'Fix window extended by ' + days + ' days to ' + formatDateLong(to) + ' by ' + (who || d.by) + ' - ' + reason.trim(), true);
  d.due = isoDate(to);
  return { ok: true };
}

/* The conditions register. */
export function condVerifyLabel(c) {
  if (c.verifyAt === 'sv1') return 'Year-1 review';
  if (c.verifyAt === 'sv2') return 'Year-2 review';
  return c.due ? formatDateLong(new Date(c.due + 'T12:00:00')) : 'no date';
}
export function condSourceLabel(c) { return c.source === 'decision' ? 'the decision' : (c.source === 'sv1' ? 'the Year-1 review' : (c.source === 'sv2' ? 'the Year-2 review' : (c.source || '?'))); }
export function addCondition(doc, { text, refs, verifyAt, dueText, who }) {
  text = (text || '').trim();
  if (!text) return { ok: false, reason: 'Write the action.' };
  if (!(who || '').trim()) return { ok: false, reason: 'Enter the lead assessor\'s name so the condition is set in a person\'s name.' };
  let due = '';
  if (verifyAt === 'date') { const pd = parseLongDate((dueText || '').trim()); if (!pd) return { ok: false, reason: 'Enter a due date, e.g. 21 November 2026, or pick a pill.' }; due = isoDate(pd); }
  const sv = doc.surveillance || {};
  const source = (sv.sv2 && sv.sv2.outcome === 'conditions') ? 'sv2' : ((sv.sv1 && sv.sv1.outcome === 'conditions') ? 'sv1' : 'decision');
  const c = { id: 'c' + Date.now(), text, refs: (refs || '').split(/[,\s]+/).filter(Boolean), source, setAt: new Date().toISOString(), setBy: who.trim(), verifyAt: verifyAt || 'date', due, status: 'open', closedAt: null, closedBy: '', note: '' };
  doc.conditions = Array.isArray(doc.conditions) ? doc.conditions : [];
  doc.conditions.push(c);
  logRemediation(doc, 'Condition set by ' + who.trim() + ': ' + text + ' - verify at ' + condVerifyLabel(c), true);
  return { ok: true, id: c.id };
}
export function setConditionStatus(doc, id, status, who, note) {
  const c = (doc.conditions || []).find((x) => x.id === id);
  if (!c || c.status === status) return { ok: false, reason: 'Nothing to change.' };
  if (status === 'open') { c.status = 'open'; c.closedAt = null; c.closedBy = ''; c.note = ''; return { ok: true }; }
  if (!(who || '').trim()) return { ok: false, reason: 'Enter the lead assessor\'s name first - a condition is closed in a person\'s name.' };
  c.status = status; c.closedAt = new Date().toISOString(); c.closedBy = who.trim(); c.note = (note || '').trim();
  logRemediation(doc, 'Condition ' + status + ': ' + c.text + ' (' + who.trim() + (c.note ? ' - ' + c.note : '') + ')', true);
  return { ok: true };
}
export function removeCondition(doc, id) { doc.conditions = (doc.conditions || []).filter((x) => x.id !== id); }

/* Stage 6 opens only after moderation (the decision is issued after the second assessor's review). */
export function stage6Lock(summary, stage1) {
  if (stage1 !== 'pass') return 'Locked — complete Stage 1 (all completeness items) first: nothing is judged until the submission is assessable';
  if (!summary || !summary.fullyJudged) return 'Locked — the decision needs the full scored matrix: judge every applicable indicator in Stages 2–4 first';
  if ((summary.stages || {})[5] !== 'pass') return 'Locked — the decision is only issued after moderation: the moderator must approve every Stage 5 check (any push-back returns it to the lead)';
  return '';
}
export { deferralInfo, conditionsInfo, formatDateLong };
