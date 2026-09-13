'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../AppLayout';
import { rag } from '@/lib/feedback';

const FLAG = { green: 'Healthy', amber: 'Watch', red: 'Action needed' };

function Activity({ a, onShare, sharing, shared }) {
  const [msg, setMsg] = useState(a.draft);
  const [ragSel, setRag] = useState(a.flag);
  const [copied, setCopied] = useState('');
  async function copyNote() {
    try { await navigator.clipboard.writeText(a.note); setCopied('Surveillance note copied - paste into the Stage 8 record.'); } catch { setCopied('Could not copy - select the note text below.'); }
  }
  return (
    <div className={'panel act flag-' + a.flag}>
      <div className="page-head">
        <div><h2>{a.activity}</h2><p className="muted">{a.provider} · {a.ref} · {a.n} verified response{a.n === 1 ? '' : 's'} in 12 months{a.entryId ? <> · <Link href={'/tool?entry=' + encodeURIComponent(a.entryId)}>open case</Link></> : null}</p></div>
        <span className={'status rag ' + a.flag}>{FLAG[a.flag]}{a.overall != null ? ' · ' + a.overall + '/100' : ''}</span>
      </div>
      <div className="grid2">
        <div>
          <h3 className="sect">Dimension scores</h3>
          {a.dims.map((d) => <div key={d.key} className={'dim ' + rag(d.mean)}><span className="dl">{d.label}</span><span className="track"><span className="fill" style={{ width: d.mean + '%' }} /></span><span className="dv">{d.mean}</span></div>)}
        </div>
        <div>
          <h3 className="sect">12-month trend</h3>
          <div className="trend">{a.months.map((m) => <div key={m.key} className={'tcol ' + (m.mean == null ? 'none' : rag(m.mean))} title={m.label + ': ' + (m.mean == null ? 'no responses' : m.mean + '/100 from ' + m.n)}><span className="tn">{m.n || ''}</span><span className="tbar" style={{ height: (m.mean == null ? 3 : Math.max(4, Math.round(m.mean * 0.82))) + 'px' }} /><span className="tlab">{m.label}</span></div>)}</div>
          {a.trend != null && <p className="muted">Trend: <b className={a.trend <= -6 ? 'bad' : (a.trend >= 6 ? 'ok' : '')}>{a.trend <= -6 ? 'declining' : (a.trend >= 6 ? 'improving' : 'steady')} ({a.trend > 0 ? '+' : ''}{a.trend} pts over the last quarter)</b>{a.trend <= -6 ? ' - raise with the provider now, not at review.' : ''}</p>}
          <h3 className="sect">Weaknesses and recent critical comments</h3>
          {!a.weak.length && !a.drifting.length && <p className="muted">No dimension below 75 - nothing needing action.</p>}
          <ul className="plain">{a.weak.map((d) => <li key={d.key}><b className="bad">{d.label} - {d.mean}/100.</b> Needs provider action.</li>)}{a.drifting.map((d) => <li key={d.key}>{d.label} - {d.mean}/100. Watch.</li>)}</ul>
          {a.comments.map((c, i) => <blockquote key={i} className="cmt">"{c.text}" <span className="muted">{c.when} · anonymised</span></blockquote>)}
        </div>
      </div>
      <div className="share">
        <h3 className="sect">Share with the provider</h3>
        {!a.orgId && <p className="muted">This case is not linked to a provider organisation yet - link it under Admin → Organisations to share.</p>}
        {a.orgId && (shared ? <div className="alert alert--ok">Shared. The provider sees it under Feedback in their portal and must respond.</div> : (
          <>
            <textarea className="input" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="act-row"><select className="input" style={{ flex: 'none', width: 120 }} value={ragSel} onChange={(e) => setRag(e.target.value)}><option value="green">green</option><option value="amber">amber</option><option value="red">red</option></select><button className="btn btn--primary" disabled={sharing} onClick={() => onShare(a, msg, ragSel)}>Share these numbers with {a.provider || 'the provider'}</button><button type="button" className="btn" onClick={copyNote}>Copy surveillance note (SV-09)</button></div>
            {copied && <p className="muted">{copied}</p>}
          </>
        ))}
      </div>
    </div>
  );
}

export default function LearnerFeedback() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState({});
  const load = useCallback(() => fetch('/api/learner-feedback').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load (' + e + ').')), []);
  useEffect(() => { load(); }, [load]);
  async function share(a, message, ragSel) {
    setSharing(true); setErr('');
    const r = await fetch('/api/admin/organisations/' + a.orgId + '/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entryId: a.entryId, rag: ragSel, message, snapshot: a.snapshot }) });
    setSharing(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Could not share.'); return; }
    setShared({ ...shared, [a.ref]: true });
  }
  return (
    <AppLayout>
      <div className="page-head"><h1>Learner feedback</h1>{d && <span className="muted">{d.responses12m} responses in 12 months · {d.responsesTotal} all time</span>}</div>
      <div className="panel"><p>Certificate-verified feedback from the public form at <code>/feedback</code>, one response per completion. Scores are 0-100 per dimension. <b>Red</b> below 55 or a clear decline; <b>amber</b> below 75 or drifting. Sharing sends the aggregate and anonymised comments to the provider's portal - never identities - and they must say what they will do. SV-09 at the annual review checks they did.</p></div>
      {err && <div className="alert alert--error">{err}</div>}
      {d && !d.activities.length && <div className="panel"><p className="muted">No feedback in the last 12 months.</p></div>}
      {d && d.activities.map((a) => <Activity key={a.ref} a={a} onShare={share} sharing={sharing} shared={!!shared[a.ref]} />)}
    </AppLayout>
  );
}
