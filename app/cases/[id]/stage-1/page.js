'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../../../AppLayout';
import CaseShell from '../../CaseShell';
import { useCase } from '../../useCase';
import { stage1Items, stage1ReturnInfo, stage1Status, stage1Progress, composeReturnEmail } from '@/lib/stage1';
import { summarise } from '@/lib/scoring';
import { when } from '../../../money';

/* Stage 1 - submission and completeness check.
   A coordinator confirms the submission can be assessed. Nothing is judged on
   quality: an incomplete submission is RETURNED to the provider, not failed,
   and every later stage stays locked until every applicable item is Yes.
   Scheme-side items (COI screen, fee) lock assessment too but are never put
   to the provider. The return is a record; the provider sees it in the portal
   and is notified the moment it is logged. */
export default function Stage1() {
  const { id } = useParams();
  const { data: session } = useSession();
  const { row, doc, refinements, err, saveState, failed, update, saveRefinements, reload } = useCase(id, summarise);
  const [mail, setMail] = useState(null);
  const [copied, setCopied] = useState('');
  const [refine, setRefine] = useState(null); // {id, text, reason}
  if (err) return <AppLayout><div className="alert alert--error">{err}</div></AppLayout>;
  if (!doc) return <AppLayout><p className="muted">Loading…</p></AppLayout>;

  const ci = doc.caseInfo || {};
  const items = stage1Items(doc, refinements);
  const ri = stage1ReturnInfo(doc, refinements);
  const status = stage1Status(doc, refinements);
  const progress = Math.round(stage1Progress(doc, refinements) * 100);
  const setCase = (k, v) => update((d) => { d.caseInfo[k] = v; if (k === 'el' || k === 'lo' || k === 'f2f') { d.caseInfo.modes = d.caseInfo.modes || {}; d.caseInfo.modes[k] = v; d.caseInfo.modes.bl = [d.caseInfo.modes.el, d.caseInfo.modes.lo, d.caseInfo.modes.f2f].filter(Boolean).length >= 2; delete d.caseInfo[k]; } });
  const answer = (cid, v) => update((d) => { d.completeness = d.completeness || {}; d.completeness[cid] = d.completeness[cid] === v ? '' : v; });
  const openMail = () => { setMail(composeReturnEmail(doc, refinements)); setCopied(''); };
  const logSent = () => {
    const m = composeReturnEmail(doc, refinements);
    if (!m.n) return;
    update((d) => { d.returns = d.returns || []; d.returns.push({ sentAt: new Date().toISOString(), to: mail?.to || m.to, items: m.items, subject: m.subject, by: session?.user?.name || '' }); });
    setMail(null);
  };
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what + ' copied.'); } catch { setCopied('Could not copy - select the text.'); } };
  const submitRefine = async () => {
    if (!refine) return;
    const who = session?.user?.name || '';
    const original = items.find((i) => i.id === refine.id)?.original || '';
    if (!refine.reason.trim()) { setCopied('Give the reason - a refinement is a proposal to the Standards Panel.'); return; }
    const next = { ...refinements };
    const text = refine.text.trim();
    if (!text || text === original) { delete next[refine.id]; }
    else {
      const prev = next[refine.id] || {};
      next[refine.id] = { ...prev, text, by: who, at: new Date().toISOString(), reason: refine.reason.trim(), history: [...(prev.history || []), { at: new Date().toISOString(), by: who, reason: refine.reason.trim(), from: { text: prev.text || null, notNeeded: !!prev.notNeeded }, to: { text, notNeeded: !!prev.notNeeded } }] };
    }
    await saveRefinements(next); setRefine(null);
  };
  const statusWord = { pass: 'Passed - every item present', act: 'Action needed', sent: 'With the provider', '': 'In progress' }[status];

  return (
    <AppLayout>
      <CaseShell id={id} doc={doc} summary={row.summary} refinements={refinements} saveState={saveState} failed={failed}>
        {failed && <div className="alert alert-bad">{saveState} <button className="btn btn-tiny" onClick={reload}>Reload</button></div>}
        <section className="stage active">
          <div className="panel">
            <div className="stage-head"><h2>Stage 1 — Submission &amp; completeness check</h2><span className="gate-chip">{statusWord} · {progress}%</span></div>
            <p className="purpose">A coordinator checks the submission can be assessed. Mark each item <b>Yes</b> (present) or <b>No</b> (missing). Nothing is judged on quality yet — an incomplete submission is returned to the provider, not failed, and assessment stays locked until every item is Yes.</p>
            <div id="completeness">
              {items.map((it) => (
                <div key={it.id}>
                  <div className="ck-yn">
                    <span className="cyn-text"><b>{it.id}</b> — {it.text}{it.side === 'scheme' && <span className="cs-tag" style={{ marginLeft: 6 }}>scheme-side</span>}
                      <button type="button" className="rf-btn" style={{ marginLeft: 6 }} onClick={() => setRefine(refine && refine.id === it.id ? null : { id: it.id, text: it.text, reason: (refinements[it.id] || {}).reason || '' })}>Refine{it.reworded && <span className="rf-flag"> · reworded</span>}</button>
                    </span>
                    <span className={'yn-controls' + (it.answer === 'yes' ? ' on-yes' : (it.answer === 'no' ? ' on-no' : ''))}>
                      <span className="yn-knob" />
                      <button type="button" className="yn-btn yes-side" onClick={() => answer(it.id, 'yes')}>Yes</button>
                      <button type="button" className="yn-btn no-side" onClick={() => answer(it.id, 'no')}>No</button>
                    </span>
                  </div>
                  {refine && refine.id === it.id && (
                    <div className="rf-panel open">
                      <textarea rows={2} value={refine.text} onChange={(e) => setRefine({ ...refine, text: e.target.value })} />
                      <input className="rf-why" placeholder="Why - the reason the Standards Panel will read (required)" value={refine.reason} onChange={(e) => setRefine({ ...refine, reason: e.target.value })} />
                      <div className="rf-row"><button type="button" className="rfa" onClick={submitRefine}>Submit rewording</button><button type="button" className="rfb" onClick={() => { setRefine({ ...refine, text: it.original }); }}>Restore original</button><button type="button" className="rfb" onClick={() => setRefine(null)}>Cancel</button></div>
                      <div className="rf-note">Proposal to the Standards Panel: applies to every case now (pilot), recorded with your name, the date and your reason.</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {copied && <p className="np-hint">{copied}</p>}

            {(ri.missing.length > 0 || ri.returns.length > 0) && (
              <div className={'s1-return' + (ri.sent || !ri.missing.length ? ' sent' : '')}>
                {ri.missing.length > 0 ? <>
                  <p><b>{ri.missing.length} item{ri.missing.length === 1 ? '' : 's'} marked missing.</b>{' '}
                    {ri.provider.length ? (ri.sent
                      ? <>Returned to the provider on <b>{(ri.last.sentAt || '').slice(0, 10)}</b> for {ri.provider.map((i) => i.id).join(', ')}. Not a fail - assessment has not begun. Mark each item Yes as it arrives; Stages 2-4 unlock when every item is present.</>
                      : <>An incomplete submission is <em>returned</em> to the provider, not failed - request the missing items before assessment begins. Still to send: <b>{ri.pending.map((i) => i.id).join(', ')}</b>.</>)
                      : <>Nothing to send - the outstanding item{ri.scheme.length === 1 ? ' is' : 's are'} scheme-side.</>}</p>
                  {ri.scheme.length > 0 && <div className="s1-scheme">Scheme-side, never asked of the provider: {ri.scheme.map((i) => i.id).join(', ')} — clear these here.</div>}
                  {ri.provider.length > 0 && !mail && <button type="button" className="s1-return-btn" onClick={openMail}>{ri.sent ? 'Compose a further return email' : 'Compose return-for-completion email'} →</button>}
                </> : <p><b>Submission complete.</b> Every item is now present; the return below is on record.</p>}
                {mail && (
                  <div className="mail">
                    <div className="field"><label>To</label><input className="input" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} /></div>
                    <div className="field"><label>Subject</label><input className="input" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></div>
                    <div className="field"><label>Body</label><textarea className="input" rows={12} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></div>
                    <div className="mail-actions">
                      <button type="button" className="rfb" onClick={() => copy(mail.body, 'Body')}>Copy body</button>
                      <a className="rfb" href={'mailto:' + encodeURIComponent(mail.to) + '?subject=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.body)}>Open in email client</a>
                      <button type="button" className="rfa" onClick={logSent}>Log as sent — record the return</button>
                      <button type="button" className="rfb" onClick={() => setMail(null)}>Close</button>
                    </div>
                    <p className="mail-note">This composes text only — nothing sends from here. Send it from your own email client, then log it. The provider sees the return on their portal and is notified when it is logged.</p>
                  </div>
                )}
                {ri.returns.length > 0 && <div className="s1-return-log">{ri.returns.slice().reverse().map((r, i) => <div key={i}>Returned {when(r.sentAt)}{r.to ? ' to ' + r.to : ''} for {(r.items || []).join(', ')}{r.by ? ' · ' + r.by : ''}{r.providerSentAt ? <span> · provider says sent {when(r.providerSentAt)}{r.providerNote ? ' - "' + r.providerNote + '"' : ''}</span> : null}</div>)}</div>}
              </div>
            )}

            <div className="note-label">Stage 1 notes</div>
            <textarea rows={4} value={(doc.logs || {}).stage1 || ''} onChange={(e) => update((d) => { d.logs = d.logs || {}; d.logs.stage1 = e.target.value; })} placeholder="What arrived, what was chased, who was spoken to…" />
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
              <div className="stage-head"><h2>Case setup</h2><span className="gate-chip">the facts the assessment is set up from</span></div>
              <p className="purpose">Exam bank and certificate decide whether C-13 and C-14 apply. Blended is derived from the delivery modes, never ticked.</p>
              <div className="modal-body" style={{ padding: 0 }}><div className="grid">
              <div className="field"><label>Application reference</label><input type="text" value={ci.ref || ''} onChange={(e) => setCase('ref', e.target.value)} placeholder="CA-2026-0001" /></div>
              <div className="field"><label>Activity</label><input type="text" value={ci.activity || ''} onChange={(e) => setCase('activity', e.target.value)} /></div>
              <div className="field"><label>Provider</label><input type="text" value={ci.provider || ''} onChange={(e) => setCase('provider', e.target.value)} /></div>
              <div className="field"><label>Provider email</label><input type="text" value={ci.providerEmail || ''} onChange={(e) => setCase('providerEmail', e.target.value)} /></div>
              <div className="field"><label>Stated CPD hours</label><input type="text" inputMode="decimal" value={ci.hours || ''} onChange={(e) => setCase('hours', e.target.value)} /></div>
              <div className="field"><label>Delivery modes</label><div className="opts">
                {[['el', 'E-learning'], ['lo', 'Live online'], ['f2f', 'Face-to-face']].map(([k, l]) => <label key={k}><input type="checkbox" checked={!!(ci.modes || {})[k]} onChange={(e) => setCase(k, e.target.checked)} /> {l}</label>)}
                <label style={{ opacity: .6 }}><input type="checkbox" checked={!!(ci.modes || {}).bl} disabled readOnly /> Blended — auto (2+ modes)</label>
              </div></div>
              <div className="field"><label>Assessment &amp; certificates</label><div className="opts">
                <label><input type="checkbox" checked={ci.assess !== false} onChange={(e) => setCase('assess', e.target.checked)} /> Assesses learners</label>
                <label><input type="checkbox" checked={!!ci.examBank} onChange={(e) => setCase('examBank', e.target.checked)} /> Includes an exam / question bank (C-13)</label>
                <label><input type="checkbox" checked={ci.cert !== false} onChange={(e) => setCase('cert', e.target.checked)} /> Issues certificates (C-14)</label>
              </div></div>
              </div></div>
          </div>
            {doc.application && (
              <div className="panel" style={{ marginTop: 16 }}>
                <div className="stage-head"><h2>As submitted via the portal</h2><span className="gate-chip">{when(doc.application.submittedAt)} · {doc.application.submittedBy}</span></div>
                {doc.application.audience && <p><b>Who it is for:</b> {doc.application.audience}</p>}
                {doc.application.description && <p><b>What it covers:</b> {doc.application.description}</p>}
                {doc.application.notes && <p><b>Notes:</b> {doc.application.notes}</p>}
              </div>
            )}
        </section>
      </CaseShell>
    </AppLayout>
  );
}
