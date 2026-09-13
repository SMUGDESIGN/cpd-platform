/* Stage 7 - the outcome - as pure functions over the case document. Ported
   from the tool: the verdict words for each computed outcome, the signed
   decision (decisionReady / signDecision / withdrawDecision), the approval
   that sets the dates, the deliverables' data (unit specification, register
   row, verify string, badge, congratulations email) and the scorecard by
   standard. Rule C2 computes; a person signs; everything issued keys on the
   signature - a rating nudged after signing shows as drift, never as a
   silent change to what was issued. */
import { INDICATORS, STD_NAMES, FRAMEWORK_VERSION } from './frameworkData';
import { applicableIn, formatDateLong, conditionsInfo, deferralInfo } from './scoring';
import { condVerifyLabel } from './stage6';

export const FINAL_VERDICTS = ['Accredited', 'Accredited w/ conditions', 'Refused on points', 'Refused · fix window expired', 'Refused · gates after deferral'];
export const VERIFY_BASE = 'https://continuingprofessionaldevelopment.co.uk/verify/';
export function verifyUrl(accRef) { return VERIFY_BASE + encodeURIComponent(accRef || ''); }
function sameName(a, b) { a = (a || '').trim().toLowerCase(); b = (b || '').trim().toLowerCase(); return !!a && a === b; }
export function deriveInitials(name) { return String(name || '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4).toUpperCase(); }

/* The words under the verdict, as the tool's compute() writes them. */
export function verdictText(doc, sum) {
  const s1 = (sum.stages || {})[1];
  const di = deferralInfo(doc);
  const ci = conditionsInfo(doc);
  if (s1 === 'act' || s1 === 'sent') return { title: sum.verdict.toUpperCase().replace(' · ', ' - '), text: 'Incomplete submission - returned, not failed. Assessment has not begun; see Stage 1.' };
  if (sum.ans === 0) return { title: 'Not started', text: 'Set up the case, then work the stages. The decision is computed from rule C2 - never chosen.' };
  if (s1 !== 'pass') return { title: 'INCOMPLETE - STAGE 1 OPEN', text: sum.ans + ' rating' + (sum.ans === 1 ? '' : 's') + ' on file before completeness was confirmed. They are kept but count for nothing until every Stage 1 item is marked Yes: no gate fails, no notice opens, no decision.' };
  if (sum.gF > 0 || (di && di.expired)) {
    const contactBit = sum.gF === 0 ? '' : (sum.gUnnoticed > 0 ? ' ' + sum.gUnnoticed + ' of ' + sum.gF + ' still need a provider notice - flag them now, do not wait for decision.' : ' All failing gates have a provider notice logged.');
    if (di && di.expired) return { title: 'REFUSED - FIX WINDOW EXPIRED', text: 'The single deferral issued ' + formatDateLong(new Date(di.rec.issuedAt)) + ' ran out on ' + formatDateLong(di.due) + ' with no resubmission logged. C2: after the fix window, refuse. Sign the decision here, or extend the window in Stage 6 with a written reason.' };
    if (di && di.rechecked) return { title: 'REFUSED - GATES STILL FAILING AFTER DEFERRAL', text: sum.gF + ' mandatory gate' + (sum.gF > 1 ? 's' : '') + ' still Not met after the re-check logged ' + formatDateLong(new Date(di.rec.recheckedAt)) + '. There is no second deferral. Sign the decision here.' + contactBit };
    if (di) return { title: 'DEFERRED - ' + (di.resubmitted ? 'RE-CHECK IN PROGRESS' : di.daysLeft + ' DAY' + (di.daysLeft === 1 ? '' : 'S') + ' LEFT'), text: (di.resubmitted ? 'Resubmission received ' + formatDateLong(new Date(di.rec.resubmittedAt)) + '. Re-score the listed gates in Stages 2-4 plus a regression sample, then log the re-check complete in Stage 6.' : 'Fix window ends ' + formatDateLong(di.due) + ' for ' + di.rec.items.join(', ') + '. Log the resubmission in Stage 6 when it arrives.') + contactBit };
    return { title: sum.gF + ' mandatory gate' + (sum.gF > 1 ? 's' : '') + ' failing', text: 'C2: no overall score can rescue a failed gate. Where fixable within 8 weeks: issue the single deferral in Stage 6 - the clock runs from the record. Otherwise: Refuse.' + contactBit };
  }
  if (!sum.fullyJudged) return { title: 'In progress', text: 'No gates failing so far. ' + (sum.app - sum.ans) + ' indicator' + ((sum.app - sum.ans) === 1 ? '' : 's') + ' still to judge. Current scored points: ' + sum.pct + '%.' };
  if (sum.pct >= 85) return { title: 'ACCREDITED', text: 'All applicable gates met and ' + sum.pct + '% of available points (threshold 85%). 3-year term with annual surveillance; register listing and mark licence for this activity only.' };
  if (sum.pct >= 70) return { title: 'ACCREDITED WITH CONDITIONS', text: 'All applicable gates met with ' + sum.pct + '% of available points (70-84%). ' + (ci.open.length ? ci.open.length + ' named condition' + (ci.open.length === 1 ? '' : 's') + ' on the register, verified at first surveillance; unmet conditions lead to suspension.' : 'Name the conditions in the Stage 6 register - the decision cannot be signed until the band says what it means.') };
  return { title: 'REFUSED ON POINTS', text: 'All gates met but only ' + sum.pct + '% of available points - below the 70% floor. Full written report; reapplication requires a new assessment fee.' };
}

/* Scorecard by standard: points as a share of what was available. */
export function scorecard(doc, refinements) {
  const per = {};
  INDICATORS.forEach((ind) => {
    if (((refinements || {})[ind.id] || {}).notNeeded || !applicableIn(ind, doc)) return;
    const d = (doc.indicators || {})[ind.id] || {};
    const ps = per[ind.std] || (per[ind.std] = { avail: 0, got: 0, gF: 0, gBlank: 0 });
    if (ind.m) { if (d.r === 'Not met') ps.gF++; else if (d.r !== 'Met') ps.gBlank++; }
    else if (d.r !== 'N/A') { ps.avail += 2; if (d.r === 'Met') ps.got += 2; else if (d.r === 'Partially met') ps.got += 1; }
  });
  return [1, 2, 3, 4, 5, 6].map((s) => { const ps = per[s] || { avail: 0, got: 0, gF: 0, gBlank: 0 }; const pct = ps.avail ? Math.round(ps.got / ps.avail * 100) : null; return { std: s, name: STD_NAMES[s], pct, gF: ps.gF, cls: pct == null ? '' : (pct >= 85 ? '' : (pct >= 70 ? 'mid' : 'low')) }; });
}

/* The signed decision. */
export function decisionReady(sum) {
  return !!(sum.fullyJudged && (sum.stages || {})[1] === 'pass' && (sum.stages || {})[5] === 'pass' && FINAL_VERDICTS.indexOf(sum.computed) >= 0 && (sum.gF === 0 || sum.computed.indexOf('Refused') === 0));
}
export function signDecision(doc, sum, leadName) {
  if (doc.decision && doc.decision.verdict) return { ok: false, reason: 'Already signed.' };
  if (!decisionReady(sum)) return { ok: false, reason: 'The decision cannot be signed yet: it needs Stage 1 complete, the full matrix judged, no failing gate, and every moderation check approved.' };
  if (sum.computed === 'Accredited w/ conditions' && !conditionsInfo(doc).open.length) return { ok: false, reason: 'The 70-84% band means named conditions: add at least one to the conditions register (Stage 6) before signing.' };
  const name = (leadName || '').trim();
  if (!name) return { ok: false, reason: 'Enter the lead assessor\'s name first - the decision is signed in a person\'s name.' };
  const mod = doc.moderator || {};
  const same = sameName(name, mod.name);
  doc.lead = { name, initials: deriveInitials(name) };
  doc.decision = { verdict: sum.computed, pct: sum.pct, gM: sum.gM, gT: sum.gT, framework: doc.framework || FRAMEWORK_VERSION, signedAt: new Date().toISOString(), by: { name, initials: deriveInitials(name) }, moderator: { name: (mod.name || '').trim(), initials: mod.initials || '' }, samePerson: same };
  return { ok: true, same };
}
export function withdrawDecision(doc) {
  const d = doc.decision; if (!d) return { ok: false, reason: 'Nothing to withdraw.' };
  doc.decisionLog = Array.isArray(doc.decisionLog) ? doc.decisionLog : [];
  doc.decisionLog.push(Object.assign({ withdrawnAt: new Date().toISOString() }, d));
  doc.decision = null;
  if (doc.outcome) { doc.outcome.accDate = ''; doc.outcome.expDate = ''; delete doc.outcome.approvedAt; delete doc.outcome.approvedBy; }
  return { ok: true };
}

/* Approval: dates from today; accreditation number from the application ref (CA -> ACT). */
export function outcomeInfo(doc) {
  const ci = doc.caseInfo || {}, o = doc.outcome || {};
  const appRef = (ci.ref || '').trim();
  const accRef = (o.accRef || '').trim() || (appRef ? appRef.replace(/^CA/i, 'ACT') : 'ACT-YYYY-NNNN');
  const modes = ci.modes || {};
  const mode = [modes.el && 'e-learning', modes.lo && 'live online', modes.f2f && 'face-to-face'].filter(Boolean).join(' + ') + (modes.bl ? ' (blended)' : '') || 'not set';
  return { appRef, accRef, accDate: (o.accDate || '').trim(), expDate: (o.expDate || '').trim(), approvedBy: o.approvedBy || '', activity: ci.activity || '(activity)', provider: ci.provider || '(provider)', hours: String(ci.hours || '').trim(), mode, assess: !!ci.assess, cert: !!ci.cert };
}
export function isApproved(doc) { const d = doc.decision; return !!(d && d.verdict && d.verdict.indexOf('Accredited') === 0); }
export function accStatus(doc) { const d = doc.decision || {}; const cond = d.verdict === 'Accredited w/ conditions'; return { cond, label: cond ? 'Accredited with conditions' : 'Accredited' }; }
export function approveMaterial(doc, sum) {
  if (!isApproved(doc)) return { ok: false, reason: 'Sign an accredited decision first.' };
  if (sum && sum.drift) return { ok: false, reason: 'The signed decision no longer matches the matrix - resolve it before anything is issued or dated.' };
  doc.outcome = doc.outcome || { accRef: '', accDate: '', expDate: '' };
  if (!(doc.outcome.accRef || '').trim()) doc.outcome.accRef = outcomeInfo(doc).accRef;
  const today = new Date(); const exp = new Date(today); exp.setFullYear(exp.getFullYear() + 3); exp.setDate(exp.getDate() - 1);
  doc.outcome.accDate = formatDateLong(today); doc.outcome.expDate = formatDateLong(exp);
  doc.outcome.approvedAt = today.toISOString(); doc.outcome.approvedBy = ((doc.decision || {}).by || {}).name || '';
  return { ok: true };
}
export function clearApproval(doc) { if (!doc.outcome) return; doc.outcome.accDate = ''; doc.outcome.expDate = ''; delete doc.outcome.approvedAt; delete doc.outcome.approvedBy; }

/* Deliverables. */
export function registerRecord(doc) {
  const o = outcomeInfo(doc), st = accStatus(doc);
  const verify = '✓ Valid - ' + o.activity + ', ' + o.provider + '. Accredited Course' + (st.cond ? ' (accredited with conditions)' : '') + ', ' + (o.hours || '—') + ' CPD hours' + (o.expDate ? ', expires ' + o.expDate : '') + '.';
  const rowText = "  '" + o.accRef + "': { kind: 'activity', activity: '" + o.activity.replace(/'/g, "\\'") + "', provider: '" + o.provider.replace(/'/g, "\\'") + "', hours: '" + o.hours + "', status: '" + st.label + "', expires: '" + o.expDate + "', verify: '" + verify.replace(/'/g, "\\'") + "' },";
  return { ...o, status: st.label, cond: st.cond, verify, rowText, verifyUrl: verifyUrl(o.accRef) };
}
export function unitSpec(doc, refinements) {
  const o = outcomeInfo(doc), st = accStatus(doc), dec = doc.decision || null;
  const metCount = INDICATORS.filter((i) => !((refinements || {})[i.id] || {}).notNeeded && applicableIn(i, doc) && ['Met', 'Partially met'].includes(((doc.indicators || {})[i.id] || {}).r)).length;
  const conds = conditionsInfo(doc).all.length;
  return { ...o, status: st, dec, metCount, total: INDICATORS.length, framework: (dec && dec.framework) || doc.framework || FRAMEWORK_VERSION, conditions: conds, verifyUrl: verifyUrl(o.accRef),
    modLine: dec && dec.samePerson ? 'moderated and signed by the same assessor (recorded on the decision)' : 'moderated by an independent second assessor' + (dec ? ' and signed by ' + dec.by.name : '') };
}
export function composeCongratsEmail(doc) {
  const o = outcomeInfo(doc), st = accStatus(doc), dec = doc.decision;
  const conds = conditionsInfo(doc).all.filter((c) => c.status !== 'met');
  const subject = 'Accreditation approved - ' + o.activity + ' (' + o.accRef + ')';
  const body = 'Dear ' + o.provider + ',\n\n' +
    'Congratulations - following independent assessment and moderation against the CPD Accreditation Framework, "' + o.activity + '" has been accredited' + (st.cond ? ' with conditions' : '') + '.\n\n' +
    (st.cond ? 'Your accreditation carries named conditions, verified at your first annual surveillance; unmet conditions lead to suspension.' + (conds.length ? '\n' + conds.map((c, i) => '  ' + (i + 1) + '. ' + c.text + ' - by ' + condVerifyLabel(c)).join('\n') : ' The actions and deadlines are listed in your assessment report.') + '\n\n' : '') +
    'Your accreditation:\n  - Accreditation number: ' + o.accRef + '\n  - CPD hours (independently derived): ' + (o.hours || '—') + '\n  - Accredited: ' + (o.accDate || '—') + '   Valid until: ' + (o.expDate || '—') + ' (annual surveillance applies)\n' +
    (dec ? '  - Decision issued by: ' + dec.by.name + ' on ' + (dec.signedAt || '').slice(0, 10) + '\n' : '') + '\n' +
    'What you receive:\n  1. Unit specification & certificate of accreditation (attached) - your formal record of what was accredited.\n  2. Public register listing - your activity is now findable on our register, and anyone can verify it here:\n     ' + verifyUrl(o.accRef) + '\n  3. The accreditation mark for this activity - logo, your course reference (' + o.accRef + ') and a verification QR code, for use on this activity only. Usage rules are in the mark licence.\n\n' +
    'Please use the mark only for this accredited activity, within scope and within the validity period, and never in a way that implies we have verified or endorsed your content (that responsibility remains yours). Misuse of the mark is a sanctionable breach.\n\n' +
    'Your learners can be issued certificates carrying a unique verifiable ID that resolves to the register.\n\nWith congratulations,\nCPD Accreditation Scheme - Assessment Team';
  return { subject, body, to: (doc.caseInfo || {}).providerEmail || '' };
}
