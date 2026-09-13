/* Learner feedback: the questions, the label-to-score maps, and the
   aggregation - pure, shared by the public form, the internal dashboard and
   the snapshot shared with a provider. Ported unchanged from the website's
   feedback.html / feedback-dashboard.html (July 2026) so a year of the old
   pipeline's numbers means the same thing as a year of this one's.
   Scores are 0-100 per dimension; null = that answer is excluded from the
   dimension's mean (e.g. "Not sure", "No accessibility needs"). */

export const DIMENSIONS = [
  { key: 'relevance', label: 'Relevance to role', map: { 'Directly relevant': 100, 'Mostly relevant': 70, 'Partly relevant': 40, 'Not relevant': 0 } },
  { key: 'clarity', label: 'Clarity of material', map: { 'Very clear': 100, 'Mostly clear': 70, 'Sometimes unclear': 35, 'Confusing': 0 } },
  { key: 'engagement', label: 'Engagement', map: { 'Very engaging': 100, 'Fairly engaging': 70, 'Occasionally engaging': 35, 'Dull': 0 } },
  { key: 'confidence', label: 'Confidence to apply', map: { 'Very confident': 100, 'Somewhat confident': 60, 'Not confident': 0 } },
  { key: 'quality', label: 'Overall quality', map: { 'Excellent': 100, 'Good': 70, 'Fair': 35, 'Poor': 0 } },
  { key: 'level', label: 'Level & depth', map: { 'About right': 100, 'Too basic': 40, 'Too advanced': 40 } },
  { key: 'hours', label: 'Stated-hours honesty', map: { 'About right': 100, 'Notably less time': 25, 'Notably more time': 55, 'Not sure': null } },
  { key: 'promise', label: 'Delivered as promised', map: { 'Yes': 100, 'Mostly': 60, 'No': 0 } },
  { key: 'navigation', label: 'Ease of navigation', map: { 'Yes': 100, 'No': 0 } },
  { key: 'technical', label: 'Technical reliability', map: { 'No': 100, 'Yes': 0 } },
  { key: 'accessibility', label: 'Accessibility needs met', map: { 'Yes': 100, 'No': 0, 'N/A': null } },
  { key: 'support', label: 'Learner support', map: { 'Got help in good time': 100, 'Slow or unhelpful': 20, "Didn't need help": null } },
];
export const DIM_BY_KEY = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d]));

/* The form, page by page. `show` names the comment field a choice reveals. */
export const STAGES = [
  { title: 'The learning', lede: 'The four things that matter most: was it relevant, clear, engaging - and can you actually use it?', questions: [
    { key: 'relevance', text: 'How relevant was the course to your role?', options: ['Directly relevant', 'Mostly relevant', 'Partly relevant', 'Not relevant'] },
    { key: 'clarity', text: 'How clear was the material?', options: ['Very clear', 'Mostly clear', 'Sometimes unclear', 'Confusing'] },
    { key: 'engagement', text: 'How engaging did you find it?', options: ['Very engaging', 'Fairly engaging', 'Occasionally engaging', 'Dull'] },
    { key: 'confidence', text: 'How confident do you feel applying what you learned at work?', options: ['Very confident', 'Somewhat confident', 'Not confident'] },
  ] },
  { title: 'The course itself', lede: 'These answers keep providers honest about level, length and claims - they carry real weight at review.', questions: [
    { key: 'quality', text: 'How would you rate the overall quality of the course?', options: ['Excellent', 'Good', 'Fair', 'Poor'] },
    { key: 'level', text: 'Was it pitched at the right level for its stated audience?', options: ['About right', 'Too basic', 'Too advanced'] },
    { key: 'hours', text: 'Compared with the stated CPD hours, how long did it actually take you?', sub: 'Accredited CPD hours are meant to reflect real learning time - your answer helps us check that.', options: ['About right', 'Notably less time', 'Notably more time', 'Not sure'], labels: { 'About right': 'About the stated hours' } },
    { key: 'promise', text: 'Did the course deliver what its title and description promised?', options: ['Yes', 'Mostly', 'No'], show: { 'No': 'promise' }, placeholder: 'What was promised but not delivered?' },
  ] },
  { title: 'Your experience', lede: '', questions: [
    { key: 'navigation', text: 'Was the course easy to navigate and use?', options: ['Yes', 'No'], show: { 'No': 'navigation' }, placeholder: 'What was difficult?' },
    { key: 'technical', text: 'Were there any technical problems (e.g. video playback, login, broken links)?', options: ['No', 'Yes'], show: { 'Yes': 'technical' }, placeholder: 'What went wrong, and where?' },
    { key: 'accessibility', text: 'If you have any accessibility needs, were they met?', options: ['Yes', 'No', 'N/A'], labels: { 'N/A': 'No accessibility needs' }, show: { 'No': 'accessibility' }, placeholder: 'What was missing, or what would have helped?' },
    { key: 'support', text: 'If you needed help or asked a question during the course, what happened?', options: ['Got help in good time', 'Slow or unhelpful', "Didn't need help"], labels: { 'Got help in good time': 'I got help in good time', 'Slow or unhelpful': 'Response was slow or unhelpful', "Didn't need help": "I didn't need help" }, show: { 'Slow or unhelpful': 'support' }, placeholder: 'What did you ask, and what happened?' },
  ] },
];
export const FREE_TEXT = [
  { key: 'likeMost', text: 'What did you like most about the course?' },
  { key: 'improve', text: 'What should the provider improve?' },
  { key: 'additional', text: 'Anything else?' },
];

export function scoreOf(answers, dim) {
  const v = (answers || {})[dim.key];
  if (v == null || v === '') return null;
  const s = dim.map[v];
  return s === undefined ? null : s;
}
export function respOverall(answers) {
  let t = 0, n = 0;
  DIMENSIONS.forEach((d) => { const s = scoreOf(answers, d); if (s != null) { t += s; n++; } });
  return n ? t / n : null;
}
export function rag(score) { return score >= 75 ? 'green' : (score >= 55 ? 'amber' : 'red'); }

/* Every answer must be one of the labels the dimension knows. */
export function validateAnswers(answers) {
  const bad = DIMENSIONS.filter((d) => !(answers && Object.prototype.hasOwnProperty.call(d.map, answers[d.key])));
  return bad.map((d) => d.key);
}

function last12Keys(now = new Date()) {
  const keys = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  return keys;
}
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (k) => MO[parseInt(k.slice(5), 10) - 1];

/* One activity's picture from its responses: rows are {answers, comments,
   submitted_at} (identity columns are not needed and not passed in). */
export function aggregate(rows, now = new Date()) {
  const rs = rows.slice();
  const dims = DIMENSIONS.map((d) => {
    let t = 0, n = 0;
    rs.forEach((r) => { const s = scoreOf(r.answers, d); if (s != null) { t += s; n++; } });
    return { key: d.key, label: d.label, mean: n ? Math.round(t / n) : null, n };
  }).filter((d) => d.mean != null);
  const overallVals = rs.map((r) => respOverall(r.answers)).filter((v) => v != null);
  const overall = overallVals.length ? Math.round(overallVals.reduce((a, b) => a + b, 0) / overallVals.length) : null;
  const months = last12Keys(now).map((k) => {
    const mr = rs.filter((r) => String(r.submitted_at || '').slice(0, 7) === k);
    const vals = mr.map((r) => respOverall(r.answers)).filter((v) => v != null);
    return { key: k, label: monthLabel(k), n: mr.length, mean: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  });
  /* trend: mean of the last 3 populated months against the prior 3 */
  const pop = months.filter((m) => m.mean != null);
  let trend = null;
  if (pop.length >= 4) {
    const recent = pop.slice(-3), prior = pop.slice(Math.max(0, pop.length - 6), pop.length - 3);
    if (prior.length) {
      const rm = recent.reduce((a, m) => a + m.mean, 0) / recent.length;
      const pm = prior.reduce((a, m) => a + m.mean, 0) / prior.length;
      trend = Math.round(rm - pm);
    }
  }
  const weak = dims.filter((d) => d.mean < 55);
  const drifting = dims.filter((d) => d.mean >= 55 && d.mean < 75);
  const strengths = dims.filter((d) => d.mean >= 85).sort((a, b) => b.mean - a.mean).slice(0, 3);
  const flag = (overall != null && overall < 55) || weak.length >= 2 || (trend != null && trend <= -12) ? 'red'
    : ((overall != null && overall < 75) || weak.length === 1 || (trend != null && trend <= -6) ? 'amber' : 'green');
  /* recent critical comments: what low scorers wrote about improving */
  const comments = [];
  rs.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))).forEach((r) => {
    if (comments.length >= 4) return;
    const ov = respOverall(r.answers);
    const c = r.comments || {};
    const txt = c.improve || c.additional || c.technical || c.promise || '';
    if (txt && ov != null && ov < 70) comments.push({ text: txt, when: String(r.submitted_at).slice(0, 10) });
  });
  return { n: rs.length, dims, overall, months, trend, flag, weak, drifting, strengths, comments };
}

/* What is shared with a provider: aggregates and anonymised comments, never
   identities. Stored as feedback_notices.snapshot and rendered in the portal. */
export function snapshotOf(a) {
  return {
    kind: 'learner-feedback', n: a.n, overall: a.overall, flag: a.flag, trend: a.trend,
    dims: a.dims.map((d) => ({ label: d.label, mean: d.mean })),
    weak: a.weak.map((d) => d.label), drifting: a.drifting.map((d) => d.label), strengths: a.strengths.map((d) => d.label),
    comments: a.comments, generatedAt: new Date().toISOString(),
  };
}

/* The paragraph for the Stage 8 record (SV-09). */
export function surveillanceNote(a, when = new Date()) {
  const lines = [];
  lines.push('Independent learner feedback (scheme-collected, certificate-verified): ' + a.n + ' responses over the last 12 months. Overall ' + (a.overall != null ? a.overall + '/100' : 'n/a') + '.');
  if (a.trend != null) lines.push('Trend across the last quarter: ' + (a.trend > 0 ? '+' : '') + a.trend + ' pts (' + (a.trend <= -6 ? 'DECLINING' : (a.trend >= 6 ? 'improving' : 'steady')) + ').');
  if (a.strengths.length) lines.push('Strengths: ' + a.strengths.map((d) => d.label + ' (' + d.mean + ')').join(', ') + '.');
  if (a.weak.length) lines.push('Needs action: ' + a.weak.map((d) => d.label + ' (' + d.mean + ')').join(', ') + '.');
  if (a.drifting.length) lines.push('Watch: ' + a.drifting.map((d) => d.label + ' (' + d.mean + ')').join(', ') + '.');
  lines.push('SV-09: reviewed with the provider on ' + when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ' - record their response and any named actions here.');
  return lines.join('\n');
}

/* A draft message for sharing, from the numbers. The person sharing edits it. */
export function shareDraft(a, activity) {
  const bits = [];
  bits.push('Learner feedback on "' + activity + '": ' + a.n + ' verified response' + (a.n === 1 ? '' : 's') + ' in the last 12 months, overall ' + (a.overall != null ? a.overall + '/100' : 'n/a') + '.');
  if (a.weak.length) bits.push('Below the action threshold: ' + a.weak.map((d) => d.label + ' (' + d.mean + ')').join(', ') + ' - please tell us what you are changing and by when.');
  if (a.drifting.length) bits.push('Worth attention: ' + a.drifting.map((d) => d.label + ' (' + d.mean + ')').join(', ') + '.');
  if (a.trend != null && a.trend <= -6) bits.push('The trend is declining (' + a.trend + ' points over the last quarter). Left unaddressed, a declining trend becomes a named action at your annual review.');
  if (!a.weak.length && !a.drifting.length) bits.push('Nothing below threshold - learners rate this well across every dimension. Keep your own feedback loop running.');
  return bits.join(' ');
}
