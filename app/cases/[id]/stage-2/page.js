'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../../../AppLayout';
import CaseShell from '../../CaseShell';
import { useCase } from '../../useCase';
import { StageMatrix, NoticeDrawer } from '../../IndicatorRows';
import { summarise } from '@/lib/scoring';
import { stage1Status } from '@/lib/stage1';
import { stageRows, stageCounts, rate, saveNotice } from '@/lib/stage2';

/* Stage 2 - desk review and scoring: the 61 desk indicators, judged against
   the submitted material. Locked until Stage 1 passes (nothing is judged
   until the submission is assessable). A gate rated Not met opens the
   provider notice at once - the framework's "flagged early, never ambushed
   at decision". Everything saves through the case document; the caseload
   summary is lib/scoring.summarise(), the tool's own arithmetic. */
export default function Stage2() {
  const { id } = useParams();
  const { data: session } = useSession();
  const { row, doc, refinements, err, saveState, failed, update, saveRefinements, reload } = useCase(id, summarise);
  const [notice, setNotice] = useState(null); // indicator id
  const [rateMsgs, setRateMsgs] = useState({});
  if (err) return <AppLayout><div className="alert alert--error">{err}</div></AppLayout>;
  if (!doc) return <AppLayout><p className="muted">Loading…</p></AppLayout>;

  const s1 = stage1Status(doc, refinements);
  const locked = s1 !== 'pass';
  const rows = stageRows(2, doc, refinements);
  const counts = stageCounts(2, doc, refinements);
  const sum = row.summary || summarise(doc, refinements);
  const who = session?.user?.name || '';

  const onRate = (r, v) => {
    /* decide on a trial copy first - React applies the update later, so a result read
       inside the updater is never there in time */
    const trial = JSON.parse(JSON.stringify(doc));
    const res = rate(trial, r, v, { stage1Open: locked });
    if (!res.ok) { setRateMsgs({ [r.id]: res.reason }); return; }
    setRateMsgs({});
    update((d) => { rate(d, r, v, { stage1Open: locked }); });
    if (res.openNotice) setNotice(r.id);
  };
  const onFinding = (r, v) => update((d) => { d.indicators = d.indicators || {}; const x = d.indicators[r.id] || (d.indicators[r.id] = {}); x.e = v; delete x.autoE; });
  const onStep = (r, i, v) => update((d) => { d.indicators = d.indicators || {}; const x = d.indicators[r.id] || (d.indicators[r.id] = {}); x.se = Array.isArray(x.se) ? x.se : []; x.se[i] = v; });
  const onRefine = async (r, text, reason, notNeeded) => {
    if (!reason || !reason.trim()) { setRateMsgs({ [r.id]: 'Give the reason - a refinement is a proposal to the Standards Panel and travels with its why.' }); return; }
    const next = { ...refinements };
    const prev = next[r.id] || {};
    const to = { text: text === null ? (prev.text || null) : (text.trim() && text.trim() !== r.t ? text.trim() : null), notNeeded: notNeeded === null ? !!prev.notNeeded : !!notNeeded };
    if (!to.text && !to.notNeeded) delete next[r.id];
    else next[r.id] = { ...prev, text: to.text || undefined, notNeeded: to.notNeeded || undefined, by: who, at: new Date().toISOString(), reason: reason.trim(), history: [...(prev.history || []), { at: new Date().toISOString(), by: who, reason: reason.trim(), from: { text: prev.text || null, notNeeded: !!prev.notNeeded }, to }] };
    await saveRefinements(next); setRateMsgs({});
  };
  const onNoticeSave = (r, f) => { update((d) => { saveNotice(d, refinements, r.id, f, f.apply); }); setNotice(null); };
  const onNoticeClear = (r) => { update((d) => { if (d.notices) delete d.notices[r.id]; }); setNotice(null); };
  const onReply = (r, text) => update((d) => { const n = d.notices[r.id]; if (n) { n.responses = n.responses || []; n.responses.push({ ts: new Date().toISOString(), text }); } });
  const noticeRow = notice ? rows.find((r) => r.id === notice) : null;

  return (
    <AppLayout>
      <CaseShell id={id} doc={doc} summary={sum} saveState={saveState} failed={failed}>
        {failed && <div className="alert alert--error">{saveState} <button className="btn btn--tiny" onClick={reload}>Reload</button></div>}
        <div className="panel">
          <div className="page-head"><h2>Stage 2 — Desk review &amp; scoring</h2><span className="muted">{counts.judged} / {counts.total} judged · gates {counts.gatesMet} / {counts.gates}{counts.failing ? ' · ' + counts.failing + ' failing' : ''}{counts.na ? ' · ' + counts.na + ' N/A from the case setup' : ''}</span></div>
          <p className="muted">Every desk indicator, judged against the submitted material with cited evidence. Gates are Met or Not met - no score can rescue a failed gate, so a Not met opens the provider notice now. Scored rows carry two points: Met 2, Partially met 1, N/A excluded from the available points.</p>
          {locked && <div className="alert alert--error">Locked — complete Stage 1 (all completeness items) first: nothing is judged until the submission is assessable. {s1 === 'sent' ? 'The submission is with the provider.' : ''}</div>}
        </div>
        <StageMatrix rows={rows} locked={locked} onRate={onRate} onFinding={onFinding} onStep={onStep} onRefine={onRefine} onNotice={(r) => setNotice(r.id)} rateMsgs={rateMsgs} />
        <div className="sf">
          <div className="sf__v"><span className={'status ' + (sum.vcls || 'idle')}>{sum.verdict}</span></div>
          <div className="sf__stats"><div><b>{sum.gM} / {sum.gT}</b><span>gates met</span></div><div><b>{sum.gF}</b><span>gates failing</span></div><div><b>{sum.app ? sum.pct + '%' : '–'}</b><span>scored points</span></div><div><b>{sum.ans} / {sum.app}</b><span>indicators judged</span></div></div>
        </div>
        {noticeRow && <NoticeDrawer row={noticeRow} doc={doc} refinements={refinements} onSave={onNoticeSave} onClear={onNoticeClear} onReply={onReply} onClose={() => setNotice(null)} />}
      </CaseShell>
    </AppLayout>
  );
}
