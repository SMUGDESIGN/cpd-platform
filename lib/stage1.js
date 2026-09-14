/* Stage 1 - submission and completeness - as pure functions over the case
   document: which items apply, what is missing, what has been returned,
   and the status the caseload shows.
   Shared by the browser (the page) and the server (nothing yet, but nothing
   here touches a database or the DOM). */
import { COMPLETENESS, COMPLETENESS_SIDE } from './framework';

export function completenessApplicable(it, caseInfo) {
  const cond = it[2];
  if (!cond) return true;
  if (cond === 'exam') return !!(caseInfo && caseInfo.examBank);
  if (cond === 'cert') return !!(caseInfo && caseInfo.cert);
  return true;
}
export function isRemoved(refinements, id) { const r = (refinements || {})[id]; return !!(r && r.notNeeded); }
export function displayText(refinements, id, fallback) { const r = (refinements || {})[id]; return r && r.text ? r.text : fallback; }

/* Items that apply to this case, with their current answer. */
export function stage1Items(doc, refinements) {
  const ci = doc.caseInfo || {}, comp = doc.completeness || {};
  return COMPLETENESS.filter((it) => !isRemoved(refinements, it[0]) && completenessApplicable(it, ci)).map((it) => ({
    id: it[0], text: displayText(refinements, it[0], it[1]), original: it[1], cond: it[2] || '', side: COMPLETENESS_SIDE[it[0]], answer: comp[it[0]] || '',
    reworded: !!((refinements || {})[it[0]] || {}).text,
  }));
}
export function completenessMissing(doc, refinements) { return stage1Items(doc, refinements).filter((i) => i.answer === 'no'); }

/* What an incomplete submission needs: missing items by side, the latest
   logged return, and which provider-side items it did not cover. */
export function stage1ReturnInfo(doc, refinements) {
  const missing = completenessMissing(doc, refinements);
  const provider = missing.filter((i) => i.side === 'provider');
  const scheme = missing.filter((i) => i.side === 'scheme');
  const rs = Array.isArray(doc.returns) ? doc.returns : [];
  const last = rs.length ? rs[rs.length - 1] : null;
  const pending = provider.filter((i) => !(last && last.items && last.items.indexOf(i.id) >= 0));
  return { missing, provider, scheme, last, pending, sent: provider.length > 0 && pending.length === 0, returns: rs };
}

/* 'pass' | 'act' | 'sent' | '' - the four words the caseload uses. */
export function stage1Status(doc, refinements) {
  const items = stage1Items(doc, refinements);
  if (!items.length) return 'pass';
  const anyNo = items.some((i) => i.answer === 'no');
  const allYes = items.every((i) => i.answer === 'yes');
  if (allYes) return 'pass';
  if (!anyNo) return '';
  return stage1ReturnInfo(doc, refinements).sent ? 'sent' : 'act';
}
export function stage1Progress(doc, refinements) {
  const items = stage1Items(doc, refinements);
  const done = items.filter((i) => i.answer === 'yes' || i.answer === 'no').length;
  return items.length ? done / items.length : 0;
}

/* The caseload summary after a Stage 1 change. lib/scoring puts the Stage 1
   branches FIRST, so this can decide the verdict whenever Stage 1
   is open and leave the rest of the summary (points, gates, later stages) as
   the last full scoring computed it. */
export function summaryAfterStage1(doc, refinements, prev) {
  const s = Object.assign({ verdict: 'Not started', vcls: 'idle', ans: 0, app: 0, gM: 0, gT: 0, gF: 0, pct: 0, fullyJudged: false, stages: {} }, prev || {});
  s.stages = Object.assign({}, s.stages || {});
  const st1 = stage1Status(doc, refinements);
  s.stages[1] = st1;
  const rated = Object.keys(doc.indicators || {}).filter((k) => doc.indicators[k] && doc.indicators[k].r).length;
  if (st1 === 'act' || st1 === 'sent') {
    const ri = stage1ReturnInfo(doc, refinements);
    if (st1 === 'sent') { s.verdict = 'Returned · with provider'; s.vcls = 'warn'; }
    else if (ri.provider.length) { s.verdict = 'Returned · ' + ri.pending.length + ' to send'; s.vcls = 'bad'; }
    else { s.verdict = 'Incomplete · scheme-side'; s.vcls = 'bad'; }
    s.stages[6] = ''; s.stages[7] = '';
  } else if (rated === 0) {
    s.verdict = 'Not started'; s.vcls = 'idle';
  } else if (st1 !== 'pass') {
    s.verdict = 'Incomplete · Stage 1 open'; s.vcls = 'bad'; s.stages[6] = ''; s.stages[7] = '';
  } else if (/^(Returned|Incomplete)/.test(s.verdict || '')) {
    /* Stage 1 just closed and nothing has rescored yet: say so honestly */
    s.verdict = 'In progress'; s.vcls = 'idle';
  }
  return s;
}

/* The return-for-completion email - provider-side items only. */
export function composeReturnEmail(doc, refinements) {
  const ri = stage1ReturnInfo(doc, refinements);
  const ci = doc.caseInfo || {};
  const ref = ci.ref || '(no reference yet)';
  const activity = ci.activity || 'your submission';
  const provider = ci.provider || 'Provider';
  const n = ri.provider.length;
  const lines = ri.provider.map((it, i) => (i + 1) + '. ' + it.id + ' - ' + it.text);
  const subject = 'Submission returned for completion - ' + ref + ' - ' + n + ' item' + (n === 1 ? '' : 's') + ' needed';
  const body = 'Dear ' + provider + ',\n\n' +
    'Thank you for submitting "' + activity + '" (ref: ' + ref + ') for CPD accreditation.\n\n' +
    'Before assessment can begin we need a small number of items that were not present or complete in your submission. This is an administrative completeness check only - your submission has not been assessed, judged or failed. It is simply returned so we can start with everything we need.\n\n' +
    'Please supply the following:\n\n' + (n ? lines.join('\n') : '(none currently marked missing)') + '\n\n' +
    'As soon as we receive these your submission enters assessment, and you will not need to send them again. If any item is unclear, just ask and we will explain what is required.\n\n' +
    'Kind regards,\nCPD Accreditation Scheme - Assessment Team';
  return { subject, body, to: ci.providerEmail || '', n, items: ri.provider.map((i) => i.id) };
}

/* What Stage 1 owns in the case document, so a Stage-1-only role (support)
   can be held to it on the server. Everything the Stage 1 page writes:
   the case setup, the completeness answers, the returns sent, its own log.
   `savedAt` is the client's stamp on every save. Returns the paths changed
   OUTSIDE that set - empty means the save is a Stage 1 save. */
export const STAGE1_DOC_KEYS = ['caseInfo', 'completeness', 'returns', 'savedAt'];
export function outsideStage1(before, after) {
  const b = before || {}, a = after || {};
  const same = (x, y) => JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y);
  const out = [];
  new Set([...Object.keys(b), ...Object.keys(a)]).forEach((k) => {
    if (STAGE1_DOC_KEYS.includes(k)) return;
    if (k === 'logs') {
      const lb = b.logs || {}, la = a.logs || {};
      new Set([...Object.keys(lb), ...Object.keys(la)]).forEach((lk) => { if (lk !== 'stage1' && !same(lb[lk], la[lk])) out.push('logs.' + lk); });
      return;
    }
    if (!same(b[k], a[k])) out.push(k);
  });
  return out;
}
/* Refinement ids Stage 1 may propose: the completeness items only. */
export function isStage1Refinement(id) { return /^C-\d+$/.test(String(id)); }
export function outsideStage1Refinements(before, after) {
  const b = before || {}, a = after || {};
  const same = (x, y) => JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((id) => !isStage1Refinement(id) && !same(b[id], a[id]));
}
