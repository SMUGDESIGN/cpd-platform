import { COMPLETENESS_TEXT, COMPLETENESS_SIDE, parseLongDate, isoDay } from './framework';

/* What a provider is shown about a case - the server-side twin of the tool's
   clientStatusData(), and it keeps the same rule: ONLY what has already been
   communicated to them, in plain English.
     - returned items: those named in a logged return-for-completion and still missing
     - open asks: gate notices actually sent (contactedAt) on gates still Not met
     - the deferral window as issued; the outcome only once SIGNED and not drifted
     - conditions, and the review dates derived from the accreditation date
   Never: indicator ids, Met/Not met language, scores or thresholds, moderation,
   assessor notes, gates that have not been notified. Asks are keyed by a
   position number, not by indicator id, so the id is not in the payload either. */

const DAY = 86400000;
function daysLeft(iso) {
  if (!iso) return null;
  const due = new Date(iso + 'T23:59:59Z');
  return Math.floor((due - Date.now()) / DAY);
}
function longDay(d) {
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
}

/* The ordered list of ask keys for a document - the same order every time,
   so position n always means the same notice. */
export function askKeys(doc) {
  const notices = doc.notices || {};
  const ind = doc.indicators || {};
  return Object.keys(notices).filter((k) => notices[k] && notices[k].contactedAt && ind[k] && ind[k].r === 'Not met').sort();
}

export function surveillanceDates(doc) {
  const o = doc.outcome || {};
  const acc = parseLongDate(o.accDate) || (o.approvedAt ? new Date(o.approvedAt) : null);
  if (!acc) return null;
  const add = (d, y, dd) => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() + y); if (dd) x.setUTCDate(x.getUTCDate() + dd); return x; };
  const exp = parseLongDate(o.expDate) || add(acc, 3, -1);
  return { acc, sv1: add(acc, 1), sv2: add(acc, 2), exp };
}

export function providerView(row) {
  const doc = row.doc || {};
  const sum = row.summary || {};
  const ci = doc.caseInfo || {};
  const stages = sum.stages || {};

  // Stage 1 - what we asked them to send, and is still missing
  const returns = doc.returns || [];
  const last = returns[returns.length - 1] || null;
  const returned = last ? last.items.filter((id) => (doc.completeness || {})[id] === 'no' && COMPLETENESS_SIDE[id] !== 'scheme')
    .map((id) => ({ text: COMPLETENESS_TEXT[id] || 'An item from our return-for-completion email' })) : [];
  const itemsSent = last && last.providerSentAt ? { at: last.providerSentAt, note: last.providerNote || '' } : null;

  // Open asks - notices sent on gates still failing
  const notices = doc.notices || {};
  const asks = askKeys(doc).map((k, i) => {
    const n = notices[k];
    return {
      n: i + 1,
      ask: n.ask || 'Details to follow - see our message to you.',
      due: n.due || '',
      sentAt: n.contactedAt,
      replies: (n.responses || []).map((r) => ({ ts: r.ts, text: r.text, from: r.from || 'scheme' })),
      fixReported: n.providerFixedAt || null,
    };
  });

  // The deferral window as issued
  const d = doc.deferral;
  const deferral = d && d.issuedAt ? {
    issuedAt: d.issuedAt, due: d.due, daysLeft: daysLeft(d.due), resubmittedAt: d.resubmittedAt || null,
    recheckedAt: d.recheckedAt || null, extended: (d.extensions || []).length > 0,
  } : null;

  // Outcome - only once signed, and only while the signature stands
  const dec = doc.decision;
  let outcome = null;
  if (dec && dec.verdict && !sum.drift) {
    const o = doc.outcome || {};
    if (dec.verdict === 'Accredited') outcome = { state: 'accredited', accRef: o.accRef || '', accDate: o.accDate || '', expDate: o.expDate || '', signedAt: dec.signedAt };
    else if (dec.verdict === 'Accredited w/ conditions') outcome = { state: 'conditions', accRef: o.accRef || '', accDate: o.accDate || '', expDate: o.expDate || '', signedAt: dec.signedAt };
    else outcome = { state: 'refused', signedAt: dec.signedAt, reason: dec.verdict.indexOf('fix window') >= 0 ? 'window' : (dec.verdict.indexOf('after deferral') >= 0 ? 'deferral' : 'points') };
  }
  const accredited = !!(outcome && outcome.state !== 'refused' && (doc.outcome || {}).approvedAt);

  // Conditions the provider must meet (met ones drop off)
  const today = new Date().toISOString().slice(0, 10);
  const conditions = (doc.conditions || []).filter((c) => c.status !== 'met').map((c) => ({
    text: c.text,
    due: c.verifyAt === 'sv1' ? 'your first annual review' : (c.verifyAt === 'sv2' ? 'your second annual review' : (c.due ? longDay(new Date(c.due + 'T00:00:00Z')) : 'no date')),
    status: c.status === 'unmet' ? 'unmet' : (c.due && c.due < today ? 'overdue' : 'open'),
  }));

  // Review dates - from the accreditation date, never typed
  const sv = accredited ? surveillanceDates(doc) : null;
  const visits = doc.surveillance || {};
  let review = null;
  if (sv) {
    const done = (v) => !!(v && v.outcome);
    const next = !done(visits.sv1) ? { name: 'First annual review', at: sv.sv1 } : (!done(visits.sv2) ? { name: 'Second annual review', at: sv.sv2 } : { name: 'Renewal', at: sv.exp });
    review = { next: next.name, nextOn: isoDay(next.at), nextLong: longDay(next.at), daysLeft: daysLeft(isoDay(next.at)),
      validUntil: longDay(sv.exp), firstReview: longDay(sv.sv1), secondReview: longDay(sv.sv2),
      sv1: done(visits.sv1) ? visits.sv1.outcome : null, sv2: done(visits.sv2) ? visits.sv2.outcome : null };
  }

  // Milestones, in the provider's words
  const s1 = stages[1];
  const evidenceDone = [2, 3, 4].every((n) => stages[n] === 'pass');
  const evidenceStarted = s1 === 'pass';
  const status = (unlocked, done, action) => (action ? 'action' : (!unlocked ? 'notstarted' : (done ? 'done' : 'progress')));
  const milestones = [
    { name: 'Submission received and checked', detail: 'We confirm everything needed to begin is present.', status: status(true, s1 === 'pass', returned.length > 0 && !itemsSent) },
    { name: 'Under assessment', detail: 'Checked in full against the framework you hold.', status: status(evidenceStarted, evidenceDone, asks.some((a) => !a.fixReported)) },
    { name: 'Quality reviewed', detail: 'A second, independent assessor checks the assessment itself before any decision.', status: status(sum.fullyJudged === true, stages[5] === 'pass', false) },
    { name: 'Decision', detail: 'The outcome is computed from the published rules and signed by the lead assessor.', status: status(stages[5] === 'pass', outcome !== null, false) },
  ];

  // One line for lists
  let headline;
  if (accredited) headline = outcome.state === 'conditions' ? 'Accredited, with conditions' : 'Accredited';
  else if (outcome && outcome.state === 'refused') headline = 'Not accredited on this attempt';
  else if (outcome) headline = 'Decision made - paperwork being issued';
  else if (returned.length && !itemsSent) headline = 'Returned - we need items from you';
  else if (returned.length) headline = 'Items sent - being checked';
  else if (deferral && !deferral.resubmittedAt) headline = 'Deferred - fixes due by ' + longDay(new Date(deferral.due + 'T00:00:00Z'));
  else if (deferral) headline = 'Resubmitted - being re-checked';
  else if (asks.length) headline = 'Under assessment - action needed';
  else if (!sum.ans) headline = 'Received - assessment not yet started';
  else headline = 'Under assessment';

  return {
    id: row.id, ref: row.ref || ci.ref || '', activity: ci.activity || '(activity not yet named)',
    hours: ci.hours || '', modes: ci.modes || {}, submittedAt: (doc.application || {}).submittedAt || row.created_at || null,
    updatedAt: row.updated_at || null, headline, accredited, milestones, returned, itemsSent, asks, deferral, outcome, conditions, review,
  };
}
