/* Framework facts shared by the server routes and the pages. The indicator
   set, guidance and sources live in lib/frameworkData.js; the completeness
   list lives here. Change the framework by version (CPD/CLAUDE.md). */
export const FRAMEWORK_VERSION = '0.6';

/* Stage 1 completeness items: [id, provider-facing text, cond, side]. The
   text is what the return-for-completion email already says to the provider,
   so the portal shows the same words. 'scheme' items are never shown outside. */
export const COMPLETENESS = [
  ['C-01', 'Access to the activity works end to end (LMS code, venue plan, joining links)'],
  ['C-02', 'All learning materials received (scripts, decks, workbooks, module access)'],
  ['C-03', 'Evidence matrix complete - self-assessment against every indicator'],
  ['C-04', 'SME sign-off with name, credentials and date'],
  ['C-05', 'Signed provider warranty of accuracy and lawfulness'],
  ['C-06', 'CPD-hours calculation shown in full'],
  ['C-07', 'CVs for every named educator, author and instructional designer'],
  ['C-08', 'Readability method and score stated'],
  ['C-09', 'Policies pack: complaints, refunds, privacy notice'],
  ['C-10', 'Insurance certificates'],
  ['C-11', 'Conflict-of-interest screen run; lead assessor and moderator allocated', '', 'scheme'],
  ['C-12', 'Assessment fee settled - payable regardless of outcome', '', 'scheme'],
  ['C-13', 'Full exam / question bank supplied - not just the subset an LMS serves live or one randomly-sampled paper', 'exam'],
  ['C-14', 'Certificate mock-up or specimen copy supplied, as issued to the learner', 'cert'],
];
export const COMPLETENESS_TEXT = Object.fromEntries(COMPLETENESS.map((c) => [c[0], c[1]]));
export const COMPLETENESS_SIDE = Object.fromEntries(COMPLETENESS.map((c) => [c[0], c[3] === 'scheme' ? 'scheme' : 'provider']));

/* A new case document with every field present, so nothing downstream has
   to fill gaps. This shape is the contract every case file on the platform
   follows (schema.sql, entries.doc). */
export function blankDoc(caseInfo, extra) {
  const modes = Object.assign({ el: false, lo: false, f2f: false, bl: false }, caseInfo.modes || {});
  modes.bl = [modes.el, modes.lo, modes.f2f].filter(Boolean).length >= 2;
  const visit = () => ({ items: {}, outcome: '', note: '', completedAt: null });
  return Object.assign({
    version: '1.0', framework: FRAMEWORK_VERSION,
    caseInfo: Object.assign({ ref: '', activity: '', provider: '', providerEmail: '', hours: '', assess: true, examBank: false, cert: true }, caseInfo, { modes }),
    completeness: {}, indicators: {}, moderation: {}, moderator: { name: '', initials: '' }, notices: {},
    outcome: { accRef: '', accDate: '', expDate: '' }, derived: '',
    logs: { stage1: '', stage3: '', stage4: '', stage5: '', stage6: '' }, remediationLog: [],
    returns: [], lead: { name: '', initials: '' }, decision: null, decisionLog: [], deferral: null, conditions: [],
    surveillance: { sv1: visit(), sv2: visit() }, savedAt: new Date().toISOString(),
  }, extra || {});
}

/* Dates in the "10 July 2026" format the case files carry. */
export function parseLongDate(str) {
  if (!str) return null;
  const m = /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(str);
  if (m) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const mi = months.indexOf(m[2].toLowerCase());
    if (mi >= 0) { const d = new Date(Date.UTC(+m[3], mi, +m[1])); if (!isNaN(d)) return d; }
  }
  const d2 = new Date(str);
  return isNaN(d2) ? null : d2;
}
export function isoDay(d) { return d ? d.toISOString().slice(0, 10) : null; }
