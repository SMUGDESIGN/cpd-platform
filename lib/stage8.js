/* Stage 8 - surveillance and renewal - as pure functions over the case
   document. Everything is DERIVED from the stored
   accreditation date - Year-1 and Year-2 reviews on the anniversaries,
   renewal at the recorded expiry - so a due review can never silently not
   exist. Each visit has the provider's submissions (SV-01..04), the
   assessor's drift checks (SV-05..09), an outcome, a record, and the
   conditions that fall to it. */
import { SV_SUBMISSIONS, SV_DRIFT, SV_DUE_WINDOW, SV_RENEWAL_WINDOW } from './frameworkData';
import { surveillanceDates, daysUntil, svDone, fmtDate, surveillanceInfo } from './scoring';
import { blankDoc } from './framework';

function isRemoved(refinements, id) { const r = (refinements || {})[id]; return !!(r && r.notNeeded); }
function displayText(refinements, id, fallback) { const r = (refinements || {})[id]; return r && r.text ? r.text : fallback; }
const blankVisit = () => ({ items: {}, outcome: '', note: '', completedAt: null });

export function stage8Lock(doc) {
  return surveillanceDates(doc) ? '' : 'Locked — surveillance begins once the material is approved and the accreditation date is set (Stage 7); the review dates are computed from it automatically';
}
export function conditionsForVisit(doc, key) {
  return (doc.conditions || []).filter((c) => (key === 'sv1' ? (c.source === 'decision' || c.verifyAt === 'sv1') : (c.source === 'sv1' || c.verifyAt === 'sv2')));
}
const rows = (list, refinements, answers) => list.filter((it) => !isRemoved(refinements, it[0])).map((it) => ({ id: it[0], text: displayText(refinements, it[0], it[1]), original: it[1], answer: (answers || {})[it[0]] || '', reworded: !!((refinements || {})[it[0]] || {}).text }));

/* The two visit cards and the renewal box. */
export function visits(doc, refinements) {
  const d = surveillanceDates(doc);
  if (!d) return null;
  const sv = doc.surveillance || {};
  const card = (key, name, due) => {
    const v = sv[key] || blankVisit();
    const days = daysUntil(due);
    const done = svDone(v);
    return { key, name, due, dueText: fmtDate(due), days, done, completedAt: v.completedAt || null, outcome: v.outcome || '', note: v.note || '',
      cls: done ? 'done' : (days < 0 ? 'overdue' : (days <= SV_DUE_WINDOW ? 'duesoon' : '')),
      pill: done ? '✓ reviewed' + (v.completedAt ? ' ' + fmtDate(new Date(v.completedAt)) : '') : (days < 0 ? 'OVERDUE by ' + Math.abs(days) + ' day' + (Math.abs(days) === 1 ? '' : 's') : 'due ' + fmtDate(due) + (days <= SV_DUE_WINDOW ? ' · ' + (days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' left') : '')),
      submissions: rows(SV_SUBMISSIONS, refinements, v.items), drift: rows(SV_DRIFT, refinements, v.items), conditions: conditionsForVisit(doc, key) };
  };
  const de = daysUntil(d.exp);
  return { acc: d.acc, sv1: card('sv1', 'Year-1 surveillance', d.sv1), sv2: card('sv2', 'Year-2 surveillance', d.sv2),
    renewal: { exp: d.exp, expText: fmtDate(d.exp), days: de, expired: de < 0, soon: de >= 0 && de <= SV_RENEWAL_WINDOW }, info: surveillanceInfo(doc) };
}
export function setVisitItem(doc, key, id, v) { doc.surveillance = doc.surveillance || {}; const vis = doc.surveillance[key] || (doc.surveillance[key] = blankVisit()); vis.items = vis.items || {}; vis.items[id] = vis.items[id] === v ? '' : v; }
export function setVisitOutcome(doc, key, outcome) { doc.surveillance = doc.surveillance || {}; const vis = doc.surveillance[key] || (doc.surveillance[key] = blankVisit()); const next = vis.outcome === outcome ? '' : outcome; vis.outcome = next; vis.completedAt = next ? new Date().toISOString() : null; }
export function setVisitNote(doc, key, note) { doc.surveillance = doc.surveillance || {}; const vis = doc.surveillance[key] || (doc.surveillance[key] = blankVisit()); vis.note = note; }

/* The anniversary request for the submissions pack; hardens when overdue. */
export function composeSurveillanceEmail(doc, refinements, key) {
  const d = surveillanceDates(doc);
  if (!d) return null;
  const ci = doc.caseInfo || {}, o = doc.outcome || {};
  const ordinal = key === 'sv1' ? 'first' : 'second';
  const due = key === 'sv1' ? d.sv1 : d.sv2;
  const overdue = daysUntil(due) < 0;
  const lines = rows(SV_SUBMISSIONS, refinements, {}).map((it, i) => (i + 1) + '. ' + it.text);
  const ref = o.accRef || ci.ref || '(no reference)';
  const subject = 'Annual surveillance review - ' + ref + ' - submissions ' + (overdue ? 'now overdue' : 'due by ' + fmtDate(due));
  const body = 'Dear ' + (ci.provider || 'Provider') + ',\n\n' +
    '"' + (ci.activity || 'your accredited activity') + '" (' + ref + ') is due its ' + ordinal + ' annual surveillance review on ' + fmtDate(due) + '.' +
    (overdue ? ' That date has passed, so please treat this as urgent: accreditation is only maintained through completed surveillance, and continued non-response leads to suspension of the accreditation and of your use of the mark.'
      : ' This is the routine annual check that keeps your accreditation live for the rest of its 3-year term - a sampling exercise, not a re-assessment.') + '\n\n' +
    'Please send the following' + (overdue ? ' as soon as possible' : ' by ' + fmtDate(due)) + ':\n\n' + lines.join('\n') + '\n\n' +
    'What happens next: we sample the submitted materials and your current marketing against the accredited version - including whether your stated review cycle has actually been run - and confirm your register listing for the year. Most reviews complete with no action needed; where something needs attention we set named actions with deadlines, and suspension is a last resort.\n\n' +
    'A reminder on scope: surveillance, like accreditation itself, checks your activity against the framework you were accredited under. It is not a verification or endorsement of the truth of your content, which remains your responsibility under the accreditation agreement.\n\n' +
    'If anything on the list is unclear, just ask - explaining what the framework requires is always free.\n\n' +
    'Kind regards,\nCPD Accreditation Scheme - Assessment Team';
  return { subject, body, to: ci.providerEmail || '', alreadyDone: svDone((doc.surveillance || {})[key]) };
}

/* A renewal is a fresh application: the facts
   carried over, every judgement blank, reference suffixed -R, and
   caseInfo.renewalOf naming the case it renews so the intake queue and the
   caseload can tell a renewal from a first application. */
export function renewalDoc(doc) {
  const old = doc.caseInfo || {};
  return blankDoc({ ref: old.ref ? old.ref + '-R' : '', renewalOf: old.ref || '(previous case)', activity: old.activity || '', provider: old.provider || '', providerEmail: old.providerEmail || '', hours: old.hours || '',
    modes: Object.assign({ el: false, lo: false, f2f: false }, old.modes || {}), assess: !!old.assess, examBank: !!old.examBank, cert: !!old.cert },
  { remediationLog: [{ id: 'l' + Date.now(), ts: new Date().toISOString(), text: 'Renewal application duplicated from ' + (old.ref || 'the previous case') + ' (accreditation ' + ((doc.outcome || {}).accRef || '?') + ')', auto: 1 }] });
}
export { SV_DUE_WINDOW, SV_RENEWAL_WINDOW };
