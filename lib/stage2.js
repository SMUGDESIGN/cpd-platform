/* Stages 2-4 - the indicator matrix - as pure functions. Rating rules:
     - a mandatory gate is Met / Not met; a scored row is Met / Partially met / Not met / N/A
     - a row that the case setup makes inapplicable is not shown as rated (naReason says why)
     - 1.4.3 is the one computed gate: it cannot be hand-set to Met while the hours
       calculator fails (claimed > derived * 1.2); manual Not met is always allowed
     - a Not met on a gate opens a provider notice (the page does that) - never while Stage 1 is open
     - jobs: failing gates sharing an assessor-set cause are one job */
import { INDICATORS, GUIDANCE, guidanceFor, sourcesFor, CAUSES } from './frameworkData';
import { applicableIn, blendedDerived } from './scoring';

export const RATING_GATE = ['Met', 'Not met'];
export const RATING_SCORED = ['Met', 'Partially met', 'Not met', 'N/A'];
export const RATING_SHORT = { 'Met': 'Met', 'Partially met': 'Partial', 'Not met': 'Not met', 'N/A': 'N/A' };

function isRemoved(refinements, id) { const r = (refinements || {})[id]; return !!(r && r.notNeeded); }
function displayText(refinements, id, fallback) { const r = (refinements || {})[id]; return r && r.text ? r.text : fallback; }

export function naReason(ind, doc) {
  const ci = doc.caseInfo || {};
  const d = (doc.indicators || {})[ind.id] || {};
  if (applicableIn(ind, doc) && d.r === 'N/A') return 'assessor';
  if (ind.mode === 'bl') return 'not blended';
  if (ind.mode === 'el') return 'e-learning mode not used';
  if (ind.mode === 'lo') return 'live-online mode not used';
  if (ind.mode === 'f2f') return 'face-to-face mode not used';
  if (ind.cond === 'assess') return 'no learner assessment';
  if (ind.cond === 'cert') return 'no certificate';
  return '';
}

/* The rows for a stage, with everything the page needs to draw them. */
export function stageRows(stage, doc, refinements) {
  return INDICATORS.filter((i) => i.st === stage).map((ind) => {
    const d = (doc.indicators || {})[ind.id] || {};
    const applicable = applicableIn(ind, doc);
    const g = guidanceFor(ind.id);
    return {
      ...ind, text: displayText(refinements, ind.id, ind.t), removed: isRemoved(refinements, ind.id), applicable, naReason: applicable ? '' : naReason(ind, doc),
      rating: d.r || '', finding: d.e || '', cause: d.cause || '', auto: !!d.auto, se: Array.isArray(d.se) ? d.se : [],
      steps: g ? g.steps : [], look: g ? g.look : '', sources: sourcesFor(ind.id) || [],
      notice: (doc.notices || {})[ind.id] || null, reworded: !!((refinements || {})[ind.id] || {}).text,
    };
  });
}

/* The hours calculator (Stage 4): claimed against the assessor's derived figure.
   More than 20% over fails 1.4.3 - the one purely computed gate. */
export function derivation(doc) {
  const claimed = parseFloat((doc.caseInfo || {}).hours), derived = parseFloat(doc.derived);
  if (isNaN(claimed) || isNaN(derived) || derived <= 0) return { ready: false, claimed: isNaN(claimed) ? null : claimed, derived: isNaN(derived) ? null : derived };
  const over = Math.round((claimed / derived - 1) * 100);
  return { ready: true, claimed, derived, over, fail: claimed > derived * 1.2 };
}
/* 1.4.3 follows the calculator while the
   row is untouched or still carries an auto value; a hand-set rating or typed finding
   wins. Returns whether an auto-fail should open the provider notice. */
export function applyDerivation(doc, opts) {
  const dv = derivation(doc);
  if (!dv.ready) return { openNotice: false, changed: false };
  doc.indicators = doc.indicators || {};
  const d = doc.indicators['1.4.3'] || (doc.indicators['1.4.3'] = {});
  if (d.r && !d.auto) return { openNotice: false, changed: false };
  const wasFail = d.r === 'Not met';
  d.r = dv.fail ? 'Not met' : 'Met'; d.auto = 1;
  if (!d.e || d.autoE) { d.e = 'Claimed ' + dv.claimed.toFixed(1) + ' vs derived ' + dv.derived.toFixed(1) + ' (' + (dv.over > 0 ? '+' : '') + dv.over + '%)'; d.autoE = 1; }
  return { openNotice: dv.fail && !wasFail && !(opts || {}).stage1Open, changed: true };
}

export function derivationFails(doc) {
  const claimed = parseFloat((doc.caseInfo || {}).hours), derived = parseFloat(doc.derived);
  if (isNaN(claimed) || isNaN(derived) || derived <= 0) return false;
  return claimed > derived * 1.2;
}

/* Apply a rating. Returns {ok, reason, openNotice}. Mutates doc. */
export function rate(doc, ind, value, opts) {
  const o = opts || {};
  if (ind.id === '1.4.3' && value === 'Met' && derivationFails(doc)) {
    return { ok: false, reason: '1.4.3 follows the hours calculator: ' + (doc.caseInfo || {}).hours + 'h claimed against ' + doc.derived + 'h derived is more than 20% over. Correct the derived figure; the gate turns green when the arithmetic does.' };
  }
  doc.indicators = doc.indicators || {};
  const d = doc.indicators[ind.id] || (doc.indicators[ind.id] = {});
  const wasFail = d.r === 'Not met';
  d.r = d.r === value ? '' : value;
  delete d.auto;
  const openNotice = !!(ind.m && d.r === 'Not met' && !wasFail && applicableIn(ind, doc) && !o.stage1Open);
  return { ok: true, openNotice };
}

/* Stage-level status for the strip (same words as scoring.stageInd). */
export function stageStatus(stage, doc, refinements) {
  const rows = stageRows(stage, doc, refinements).filter((r) => !r.removed && r.applicable);
  const anyRated = Object.keys(doc.indicators || {}).some((k) => (doc.indicators[k] || {}).r);
  if (!rows.length) return anyRated ? 'pass' : '';
  const fails = rows.filter((r) => r.m && r.rating === 'Not met');
  if (fails.length) return fails.some((r) => !(r.notice && r.notice.contactedAt)) ? 'act' : 'sent';
  return rows.every((r) => r.rating) ? 'pass' : '';
}
export function stageCounts(stage, doc, refinements) {
  const rows = stageRows(stage, doc, refinements).filter((r) => !r.removed && r.applicable);
  return { total: rows.length, judged: rows.filter((r) => r.rating).length, gates: rows.filter((r) => r.m).length, gatesMet: rows.filter((r) => r.m && r.rating === 'Met').length, failing: rows.filter((r) => r.m && r.rating === 'Not met').length, na: stageRows(stage, doc, refinements).filter((r) => !r.removed && !r.applicable).length };
}

/* Jobs: failing gates grouped by cause (tool's jobGroups). */
export function jobGroups(doc, refinements) {
  const groups = [], byKey = {};
  INDICATORS.forEach((ind) => {
    if (!ind.m || isRemoved(refinements, ind.id) || !applicableIn(ind, doc)) return;
    const d = (doc.indicators || {})[ind.id] || {};
    if (d.r !== 'Not met') return;
    const cause = (d.cause || '').trim();
    const key = cause ? cause.toLowerCase() : ' ' + ind.id;
    let g = byKey[key];
    if (!g) { g = { cause, gates: [], ask: '', due: '', contacted: 0 }; byKey[key] = g; groups.push(g); }
    g.gates.push(ind);
    const nt = (doc.notices || {})[ind.id];
    if (nt && nt.contactedAt) { g.contacted++; if (!g.ask) g.ask = nt.ask || ''; if (!g.due) g.due = nt.due || ''; }
  });
  return groups;
}
export function sameCauseGates(doc, refinements, id, cause) {
  cause = (cause || '').trim().toLowerCase(); if (!cause) return [];
  return INDICATORS.filter((ind) => ind.id !== id && ind.m && !isRemoved(refinements, ind.id) && applicableIn(ind, doc) && ((doc.indicators || {})[ind.id] || {}).r === 'Not met' && (((doc.indicators || {})[ind.id] || {}).cause || '').trim().toLowerCase() === cause);
}
export function causeOptions(doc, refinements) {
  const seen = {}; const out = [];
  jobGroups(doc, refinements).map((g) => g.cause).concat(CAUSES).forEach((c) => { if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); } });
  return out;
}

/* Save a notice: the ask, deadline, channel, cause; propagate to same-cause gates. */
export function saveNotice(doc, refinements, id, fields, applyGroup) {
  doc.notices = doc.notices || {}; doc.indicators = doc.indicators || {};
  const dme = doc.indicators[id] || (doc.indicators[id] = {});
  dme.cause = (fields.cause || '').trim();
  const existing = doc.notices[id] || {};
  const rec = { ask: (fields.ask || '').trim(), due: (fields.due || '').trim(), channel: (fields.channel || '').trim(), contactedAt: new Date().toISOString(), responses: existing.responses || [] };
  doc.notices[id] = rec;
  const applied = [];
  if (dme.cause && applyGroup) {
    sameCauseGates(doc, refinements, id, dme.cause).forEach((ind) => {
      const ex = doc.notices[ind.id] || {};
      doc.notices[ind.id] = { ask: rec.ask, due: rec.due, channel: rec.channel, contactedAt: ex.contactedAt || rec.contactedAt, responses: ex.responses || [] };
      applied.push(ind.id);
    });
  }
  return applied;
}

/* Deadline pills: +10 working days, +4 weeks, +8 weeks (tool's addWorkingDays). */
export function deadlineFrom(days, from) {
  const d = new Date(from || Date.now());
  if (days === 14) { let added = 0; while (added < 10) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) added++; } }
  else d.setDate(d.getDate() + days);
  const mo = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return d.getDate() + ' ' + mo[d.getMonth()] + ' ' + d.getFullYear();
}

export { blendedDerived, GUIDANCE };
