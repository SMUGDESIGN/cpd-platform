/* Stage 5 - moderation - as pure functions over the case document: a second
   assessor with no provider contact approves each check or pushes it back
   with a reason; every decision is stamped with the moderator's initials at
   the moment it is made, so a later name change cannot rewrite history. */
import { MODERATION } from './frameworkData';
import { modVal } from './scoring';

export function deriveInitials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}
export function isRemoved(refinements, id) { const r = (refinements || {})[id]; return !!(r && r.notNeeded); }
export function displayText(refinements, id, fallback) { const r = (refinements || {})[id]; return r && r.text ? r.text : fallback; }

export function moderationRows(doc, refinements) {
  const bag = doc.moderation || {};
  return MODERATION.filter((it) => !isRemoved(refinements, it[0])).map((it) => {
    const m = (bag[it[0]] && typeof bag[it[0]] === 'object') ? bag[it[0]] : (bag[it[0]] === true ? { v: 'approve', by: '', byName: '', note: '' } : { v: '', by: '', byName: '', note: '' });
    return { id: it[0], text: displayText(refinements, it[0], it[1]), original: it[1], v: modVal(m), by: m.by || '', byName: m.byName || '', note: m.note || '', reworded: !!((refinements || {})[it[0]] || {}).text };
  });
}

/* Approve or push back. Refused without a signed-in moderator - the signature
   is the point. Returns {ok, reason}. */
export function setModeration(doc, id, v) {
  const mod = doc.moderator || {};
  if (!(mod.name || '').trim()) return { ok: false, reason: 'Sign in as the moderator first - your initials are stamped on each decision.' };
  doc.moderation = doc.moderation || {};
  const cur = (doc.moderation[id] && typeof doc.moderation[id] === 'object') ? doc.moderation[id] : { v: '', by: '', byName: '', note: '' };
  const next = cur.v === v ? '' : v; /* clicking the active side clears it, as the capsule does */
  doc.moderation[id] = { ...cur, v: next, by: next ? (mod.initials || deriveInitials(mod.name)) : '', byName: next ? mod.name : '' };
  return { ok: true };
}
export function setModerator(doc, name) {
  doc.moderator = { name: name, initials: deriveInitials(name) };
}
/* Stage 5 needs the full scored matrix: every applicable indicator judged. */
export function stage5Lock(summary, stage1) {
  if (stage1 !== 'pass') return 'Locked — complete Stage 1 (all completeness items) first: nothing is judged until the submission is assessable';
  if (!summary || !summary.fullyJudged) return 'Locked — moderation needs the full scored matrix: judge every applicable indicator in Stages 2–4 first';
  return '';
}
