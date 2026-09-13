'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../../../AppLayout';
import CaseShell from '../../CaseShell';
import { useCase } from '../../useCase';
import { summarise, withRefinements, moderationStatus, moderationProgress } from '@/lib/scoring';
import { stage1Status } from '@/lib/stage1';
import { moderationRows, setModeration, setModerator, stage5Lock } from '@/lib/stage5';

/* Stage 5 - moderation (second assessor). The reliability gate: a second
   assessor with no provider contact reviews the full matrix before any
   decision exists. Approve each check, or push it back with a reason for the
   lead to act on. A push-back keeps Stages 6-7 locked. The decision is
   arithmetic plus gates - not mood - and MOD-6 asks the moderator to
   recompute it. A one-person scheme signs here too; the decision records
   when lead and moderator were the same person. */
export default function Stage5() {
  const { id } = useParams();
  const { data: session } = useSession();
  const { row, doc, refinements, err, saveState, failed, update, saveRefinements, reload } = useCase(id, summarise);
  const [msg, setMsg] = useState('');
  const [refine, setRefine] = useState(null);
  if (err) return <AppLayout><div className="alert alert--error">{err}</div></AppLayout>;
  if (!doc) return <AppLayout><p className="muted">Loading…</p></AppLayout>;

  const sum = row.summary || summarise(doc, refinements);
  const s1 = stage1Status(doc, refinements);
  const lock = stage5Lock(sum, s1);
  const rows = moderationRows(doc, refinements);
  const status = withRefinements(refinements, () => moderationStatus(doc.moderation));
  const progress = Math.round(withRefinements(refinements, () => moderationProgress(doc.moderation)) * 100);
  const mod = doc.moderator || {};
  const lead = (doc.lead || {}).name || '';
  const samePerson = !!(mod.name && lead && mod.name.trim().toLowerCase() === lead.trim().toLowerCase());
  const who = session?.user?.name || '';

  const decide = (r, v) => {
    const trial = JSON.parse(JSON.stringify(doc));
    const res = setModeration(trial, r.id, v);
    if (!res.ok) { setMsg(res.reason); return; }
    setMsg('');
    update((d) => { setModeration(d, r.id, v); });
  };
  const note = (r, v) => update((d) => { d.moderation = d.moderation || {}; const m = (d.moderation[r.id] && typeof d.moderation[r.id] === 'object') ? d.moderation[r.id] : { v: '', by: '', byName: '', note: '' }; m.note = v; d.moderation[r.id] = m; });
  const submitRefine = async () => {
    if (!refine) return;
    if (!refine.reason.trim()) { setMsg('Give the reason - a refinement is a proposal to the Standards Panel.'); return; }
    const r = rows.find((x) => x.id === refine.id);
    const next = { ...refinements };
    const text = refine.text.trim();
    if (!text || text === r.original) delete next[refine.id];
    else { const prev = next[refine.id] || {}; next[refine.id] = { ...prev, text, by: who, at: new Date().toISOString(), reason: refine.reason.trim(), history: [...(prev.history || []), { at: new Date().toISOString(), by: who, reason: refine.reason.trim(), from: { text: prev.text || null, notNeeded: !!prev.notNeeded }, to: { text, notNeeded: !!prev.notNeeded } }] }; }
    await saveRefinements(next); setRefine(null); setMsg('');
  };
  const statusWord = { pass: 'Approved - every check', act: 'Pushed back to the lead', '': 'In progress' }[status];

  return (
    <AppLayout>
      <CaseShell id={id} doc={doc} summary={sum} saveState={saveState} failed={failed}>
        {failed && <div className="alert alert--error">{saveState} <button className="btn btn--tiny" onClick={reload}>Reload</button></div>}
        <div className="panel">
          <div className="page-head"><h2>Stage 5 — Moderation (second assessor)</h2><span className={'status ' + (status === 'pass' ? 'ok' : (status === 'act' ? 'bad' : 'idle'))}>{statusWord} · {progress}%</span></div>
          <p className="muted">A second assessor with no provider contact reviews the full matrix before any decision exists. Approve each check, or push it back with a reason for the lead assessor to address. The decision is arithmetic plus gates — not mood.</p>
          {lock && <div className="alert alert--error">{lock}</div>}
          <div className="mod-signin">
            <label htmlFor="mod-name">Moderator</label>
            <input id="mod-name" className="input" placeholder="e.g. Paul Grantham" value={mod.name || ''} onChange={(e) => update((d) => setModerator(d, e.target.value))} />
            <span className="muted">{mod.name && mod.name.trim() ? <>Signing as <b>{mod.initials}</b> ({mod.name}) — stamped on each approval.</> : 'Sign in — your initials are stamped on each approval.'}{!mod.name && who ? <> <button type="button" className="btn btn--tiny" onClick={() => update((d) => setModerator(d, who))}>Sign in as {who}</button></> : null}</span>
          </div>
          {samePerson && <div className="alert alert--ok">The moderator and the lead assessor are the same person. A one-person scheme says so: the signed decision records it and the certificate prints it (honesty over pretence).</div>}
          {msg && <div className="alert alert--error">{msg}</div>}
        </div>

        <div className="panel">
          {rows.map((r) => (
            <div key={r.id} className={'mod-row ' + (r.v || 'unset')}>
              <div className="mod-line">
                <span className="mod-text"><b>{r.id}</b> — {r.text}{r.reworded && <span className="tag">reworded</span>}<button type="button" className="rf-btn" onClick={() => setRefine({ id: r.id, text: r.text, reason: (refinements[r.id] || {}).reason || '' })}>Refine</button></span>
                <span className="mod-right">
                  {r.v && <span className={'mod-by' + (r.by ? '' : ' unsigned')} title={r.byName || 'Not signed'}>{r.by || '?'}</span>}
                  <span className="yn"><button type="button" className={'yn__b yes' + (r.v === 'approve' ? ' on' : '')} disabled={!!lock} onClick={() => decide(r, 'approve')}>Approve</button><button type="button" className={'yn__b no' + (r.v === 'pushback' ? ' on' : '')} disabled={!!lock} onClick={() => decide(r, 'pushback')}>Push back</button></span>
                </span>
              </div>
              {r.v === 'pushback' && (
                <div className="mod-note">
                  <div className="mn-label">Reason for push-back — saved and shared with the lead assessor</div>
                  <textarea className="input" rows={2} value={r.note} onChange={(e) => note(r, e.target.value)} placeholder="Why is this being returned? Be specific enough for the lead to act on it." />
                </div>
              )}
              {refine && refine.id === r.id && (
                <div className="rf-panel">
                  <textarea className="input" rows={2} value={refine.text} onChange={(e) => setRefine({ ...refine, text: e.target.value })} />
                  <input className="input" placeholder="Why - the reason the Standards Panel will read (required)" value={refine.reason} onChange={(e) => setRefine({ ...refine, reason: e.target.value })} />
                  <div className="act-row"><button className="btn btn--primary btn--tiny" onClick={submitRefine}>Submit rewording</button><button className="btn btn--tiny" onClick={() => setRefine({ ...refine, text: r.original })}>Restore original</button><button className="btn btn--tiny" onClick={() => setRefine(null)}>Cancel</button></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="panel">
          <h2>Moderation record (adjustments with reasons)</h2>
          <textarea className="input" rows={4} value={(doc.logs || {}).stage5 || ''} onChange={(e) => update((d) => { d.logs = d.logs || {}; d.logs.stage5 = e.target.value; })} placeholder="Score adjustments with written reasons; calibration observations…" />
        </div>

        <div className="sf">
          <div className="sf__v"><span className={'status ' + (sum.vcls || 'idle')}>{sum.verdict}</span></div>
          <div className="sf__stats"><div><b>{sum.gM} / {sum.gT}</b><span>gates met</span></div><div><b>{sum.gF}</b><span>gates failing</span></div><div><b>{sum.app ? sum.pct + '%' : '–'}</b><span>scored points</span></div><div><b>{sum.ans} / {sum.app}</b><span>indicators judged</span></div></div>
        </div>
      </CaseShell>
    </AppLayout>
  );
}
