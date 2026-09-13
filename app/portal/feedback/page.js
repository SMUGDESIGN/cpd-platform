'use client';
import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../../AppLayout';
import { when } from '../../money';

const RAG = { green: 'Looking good', amber: 'Needs attention', red: 'At risk' };

export default function Feedback() {
  const [d, setD] = useState(null);
  const [resp, setResp] = useState({});
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/portal/feedback').then((r) => r.json()).then(setD), []);
  useEffect(() => { load(); }, [load]);
  async function ack(id) {
    setErr('');
    const r = await fetch('/api/portal/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, response: resp[id] || '' }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); setErr(e.error || 'Could not send.'); return; }
    setResp({}); load();
  }
  return (
    <AppLayout>
      <h1>Feedback</h1>
      <div className="panel"><p>We collect verified learner feedback on everything we accredit. When an activity starts to look weak we tell you here, with the numbers, so you can act before it puts your accreditation at risk. Tell us what you will do; it is checked at your next review.</p></div>
      {err && <div className="alert alert--error">{err}</div>}
      {d && !d.notices.length && <div className="panel"><p className="muted">No feedback notes at the moment.</p></div>}
      {d && d.notices.map((n) => (
        <div key={n.id} className={'panel fb rag-' + n.rag}>
          <p><span className={'status rag ' + n.rag}>{RAG[n.rag]}</span> <b>{n.activity || 'Your organisation'}</b>{n.ref ? <span className="muted"> · {n.ref}</span> : null} · <span className="muted">{when(n.created_at)}</span></p>
          <p>{n.message}</p>
          {n.snapshot && n.snapshot.kind === 'learner-feedback' && (
            <div className="snap">
              <p className="muted">{n.snapshot.n} verified response{n.snapshot.n === 1 ? '' : 's'} over the last 12 months · overall {n.snapshot.overall != null ? n.snapshot.overall + '/100' : 'n/a'}{n.snapshot.trend != null ? ' · trend ' + (n.snapshot.trend > 0 ? '+' : '') + n.snapshot.trend + ' pts over the last quarter' : ''}</p>
              {n.snapshot.dims.map((d) => <div key={d.label} className={'dim ' + (d.mean >= 75 ? 'green' : (d.mean >= 55 ? 'amber' : 'red'))}><span className="dl">{d.label}</span><span className="track"><span className="fill" style={{ width: d.mean + '%' }} /></span><span className="dv">{d.mean}</span></div>)}
              {n.snapshot.comments && n.snapshot.comments.length > 0 && <div><p className="muted" style={{ marginTop: 8 }}>What learners wrote (anonymised):</p>{n.snapshot.comments.map((c, i) => <blockquote key={i} className="cmt">"{c.text}" <span className="muted">{c.when}</span></blockquote>)}</div>}
            </div>
          )}
          {n.snapshot && n.snapshot.kind !== 'learner-feedback' && typeof n.snapshot === 'object' && (
            <dl className="snapshot">{Object.keys(n.snapshot).map((k) => <div key={k}><dt>{k}</dt><dd>{String(n.snapshot[k])}</dd></div>)}</dl>
          )}
          {n.acknowledged_at ? <p className="muted">Your response on {when(n.acknowledged_at)}: {n.response}</p> : (
            <div className="act-row">
              <input className="input" placeholder="What you will do about it, and by when" value={resp[n.id] || ''} onChange={(e) => setResp({ ...resp, [n.id]: e.target.value })} />
              <button className="btn btn--primary" onClick={() => ack(n.id)}>Send our response</button>
            </div>
          )}
        </div>
      ))}
    </AppLayout>
  );
}
