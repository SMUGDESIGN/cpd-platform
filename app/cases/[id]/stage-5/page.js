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
import { Capsule } from '../../IndicatorRows';

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
      <CaseShell id={id} doc={doc} summary={sum} refinements={refinements} saveState={saveState} failed={failed}>
        {failed && <div className="alert alert-bad">{saveState} <button className="btn btn-tiny" onClick={reload}>Reload</button></div>}
        <section className="stage active">
          <div className="panel">
            <div className="stage-head"><h2>Stage 5 — Moderation (second assessor)</h2><span className="gate-chip">Reliability gate · no provider contact · {statusWord} · {progress}%</span></div>
            <p className="purpose">A second assessor with no provider contact reviews the full matrix before any decision exists. Approve each check, or push it back with a reason for the lead assessor to address. The decision is arithmetic plus gates — not mood.</p>
            {lock && <div className="lock-note show">{lock}</div>}
            <div className="mod-signin">
              <label htmlFor="mod-name">Moderator</label>
              <input id="mod-name" type="text" placeholder="e.g. Paul Grantham" value={mod.name || ''} onChange={(e) => update((d) => setModerator(d, e.target.value))} />
              <span className="mod-as">{mod.name && mod.name.trim() ? <>Signing as <b>{mod.initials}</b> ({mod.name}) — stamped on each approval.</> : 'Sign in — your initials are stamped on each approval.'}{!mod.name && who ? <> <button type="button" className="btn btn-tiny" onClick={() => update((d) => setModerator(d, who))}>Sign in as {who}</button></> : null}</span>
            </div>
            {samePerson && <div className="alert alert-ok">The moderator and the lead assessor are the same person. A one-person scheme says so: the signed decision records it and the certificate prints it (honesty over pretence).</div>}
            {msg && <div className="alert alert-bad">{msg}</div>}
            <div id="moderation">
              {rows.map((r) => (
                <div key={r.id} className={'mod-row' + (r.removed ? ' rf-removed' : '')}>
                  <div className="mod-line">
                    <span className="mod-text"><b>{r.id}</b> — {r.text}<button type="button" className="rf-btn" style={{ marginLeft: 6 }} onClick={() => setRefine(refine && refine.id === r.id ? null : { id: r.id, text: r.text, reason: (refinements[r.id] || {}).reason || '' })}>Refine{r.reworded && <span className="rf-flag"> · reworded</span>}</button></span>
                    <span className="mod-right">
                      {r.v && <span className={'mod-by' + (r.by ? '' : ' unsigned')} title={r.byName || 'Not signed — enter the moderator name above'}>{r.by || '?'}</span>}
                      <Capsule value={r.v} options={['approve', 'pushback']} labels={{ approve: 'Approve', pushback: 'Push back' }} onPick={(v) => !lock && decide(r, v)} label={'Moderation decision for ' + r.id} disabled={!!lock} />
                    </span>
                  </div>
                  <div className={'mod-note' + (r.v === 'pushback' ? ' show' : '')}>
                    <div className="mn-label">Reason for push-back — saved and shared with the lead assessor</div>
                    <textarea rows={2} value={r.note} onChange={(e) => note(r, e.target.value)} placeholder="Why is this being returned? Be specific enough for the lead to act on it." />
                  </div>
                  {refine && refine.id === r.id && (
                    <div className="rf-panel open">
                      <textarea rows={2} value={refine.text} onChange={(e) => setRefine({ ...refine, text: e.target.value })} />
                      <input className="rf-why" placeholder="Why - the reason the Standards Panel will read (required)" value={refine.reason} onChange={(e) => setRefine({ ...refine, reason: e.target.value })} />
                      <div className="rf-row"><button type="button" className="rfa" onClick={submitRefine}>Submit rewording</button><button type="button" className="rfb" onClick={() => setRefine({ ...refine, text: r.original })}>Restore original</button><button type="button" className="rfb" onClick={() => setRefine(null)}>Cancel</button></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="note-label">Moderation record (adjustments with reasons)</div>
            <textarea rows={4} value={(doc.logs || {}).stage5 || ''} onChange={(e) => update((d) => { d.logs = d.logs || {}; d.logs.stage5 = e.target.value; })} placeholder="Score adjustments with written reasons; calibration observations…" />
          </div>
        </section>
      </CaseShell>
    </AppLayout>
  );
}
