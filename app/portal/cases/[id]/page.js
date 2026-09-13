'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '../../../AppLayout';
import { when, longDay } from '../../../money';

const M = { done: 'Complete', progress: 'With us now', notstarted: 'Not yet started', action: 'Needs you' };

export default function CasePage() {
  const { id } = useParams();
  const params = useSearchParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [reply, setReply] = useState({});
  const load = useCallback(() => fetch('/api/portal/cases/' + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load this case (' + e + ').')), [id]);
  useEffect(() => { load(); }, [load]);
  async function act(body) {
    const r = await fetch('/api/portal/cases/' + encodeURIComponent(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); setErr(e.error || 'That did not save.'); return; }
    setNote(''); setReply({}); load();
  }
  const v = d?.view;
  return (
    <AppLayout>
      <p><Link href="/portal">← Overview</Link></p>
      {params.get('submitted') && <div className="alert alert--ok">Application received. Your reference is <b>{params.get('submitted')}</b>.</div>}
      {err && <div className="alert alert--error">{err}</div>}
      {v && (
        <>
          <div className="page-head"><div><h1>{v.activity}</h1><p className="muted">{v.ref} · {v.hours ? v.hours + ' CPD hours · ' : ''}{v.headline}</p></div></div>

          {v.outcome && (
            <div className={'panel outcome ' + v.outcome.state}>
              {v.outcome.state === 'accredited' && <><h2>Accredited</h2><p>Reference <b>{v.outcome.accRef || '—'}</b> · accredited {v.outcome.accDate || '—'} · valid until {v.outcome.expDate || '—'}.</p></>}
              {v.outcome.state === 'conditions' && <><h2>Accredited, with conditions</h2><p>Reference <b>{v.outcome.accRef || '—'}</b> · accredited {v.outcome.accDate || '—'} · valid until {v.outcome.expDate || '—'}. The conditions are listed below and are checked at your first annual review.</p></>}
              {v.outcome.state === 'refused' && <><h2>Not accredited on this attempt</h2><p>{v.outcome.reason === 'window' ? 'The fix window ended without a resubmission.' : (v.outcome.reason === 'deferral' ? 'The re-check after your resubmission still found essentials unmet.' : 'The essentials were met but the overall quality fell below the published floor.')} Full written feedback comes separately, and you are welcome to apply again.</p></>}
            </div>
          )}

          {v.review && (
            <div className="panel">
              <h2>Reviews and renewal</h2>
              <p><b>Next: {v.review.next} on {v.review.nextLong}</b>{v.review.daysLeft != null ? <> ({v.review.daysLeft < 0 ? 'overdue by ' + (-v.review.daysLeft) + ' days' : v.review.daysLeft + ' days away'})</> : null}. First annual review {v.review.firstReview}{v.review.sv1 ? ' - done, ' + v.review.sv1 : ''}; second {v.review.secondReview}{v.review.sv2 ? ' - done, ' + v.review.sv2 : ''}; accreditation runs until {v.review.validUntil}, when it renews on a fresh assessment.</p>
              <p className="muted">Before each review we ask for your learner feedback data, complaints log, change log and the current materials. A review samples; it does not re-assess.</p>
            </div>
          )}

          {v.conditions.length > 0 && (
            <div className="panel">
              <h2>Conditions to meet</h2>
              <ul className="plain">{v.conditions.map((c, i) => <li key={i} className={'cond ' + c.status}><b>{c.text}</b> - by {c.due}{c.status === 'unmet' ? ' · recorded as not met - your accreditation is at risk; contact us' : (c.status === 'overdue' ? ' · past due' : '')}</li>)}</ul>
            </div>
          )}

          {v.returned.length > 0 && (
            <div className={'panel ' + (v.itemsSent ? '' : 'panel--action')}>
              <h2>Items we need before assessment begins</h2>
              <p>Your submission was returned, not failed, for these:</p>
              <ul>{v.returned.map((r, i) => <li key={i}>{r.text}</li>)}</ul>
              {v.itemsSent ? <p className="muted">You told us these were sent on {when(v.itemsSent.at)}{v.itemsSent.note ? ' - "' + v.itemsSent.note + '"' : ''}. We will mark each item present as it is checked.</p> : (
                <div className="act-row">
                  <input className="input" placeholder="Optional note - how you sent them, anything to explain" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="btn btn--primary" onClick={() => act({ action: 'items_sent', text: note })}>We have sent these</button>
                </div>
              )}
            </div>
          )}

          {v.deferral && (
            <div className="panel panel--action">
              <h2>Fix window</h2>
              {!v.deferral.resubmittedAt
                ? <p>You have one opportunity to put the items below right, by <b>{longDay(v.deferral.due)}</b>{v.deferral.daysLeft != null ? <> ({v.deferral.daysLeft < 0 ? 'ended' : v.deferral.daysLeft + ' days left'})</> : null}{v.deferral.extended ? ' (extended at your request)' : ''}. Tell us when each is done; we re-check exactly what is listed and issue a final decision.</p>
                : <p>Resubmission received {when(v.deferral.resubmittedAt)}{v.deferral.recheckedAt ? '; re-check complete ' + when(v.deferral.recheckedAt) : ' - being re-checked now'}.</p>}
            </div>
          )}

          {v.asks.length > 0 && (
            <div className="panel panel--action">
              <h2>What we need from you</h2>
              {v.asks.map((a) => (
                <div key={a.n} className={'ask' + (a.fixReported ? ' done' : '')}>
                  <p><b>{a.n}.</b> {a.ask}{a.due ? <span className="muted"> · respond by {a.due}</span> : null}</p>
                  {a.replies.length > 0 && <ul className="thread">{a.replies.map((r, i) => <li key={i} className={r.from}><span className="muted">{when(r.ts)}</span> {r.text}</li>)}</ul>}
                  {a.fixReported ? <p className="muted">You reported this fixed on {when(a.fixReported)}. We re-check it and update the status here.</p> : (
                    <div className="act-row">
                      <input className="input" placeholder="What you have done, or a question for us" value={reply[a.n] || ''} onChange={(e) => setReply({ ...reply, [a.n]: e.target.value })} />
                      <button className="btn" onClick={() => act({ action: 'fix_reported', n: a.n, text: reply[a.n] || '', fixed: false })}>Send a reply</button>
                      <button className="btn btn--primary" onClick={() => act({ action: 'fix_reported', n: a.n, text: reply[a.n] || '', fixed: true })}>This is now fixed</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="panel">
            <h2>Progress</h2>
            <ol className="milestones">{v.milestones.map((m) => <li key={m.name} className={m.status}><span className="tag">{M[m.status]}</span><b>{m.name}</b><span className="muted"> - {m.detail}</span></li>)}</ol>
            {!v.asks.length && !v.returned.length && !v.outcome && <p className="muted">Nothing needed from you right now.</p>}
          </div>

          {d.feedback.length > 0 && (
            <div className="panel">
              <h2>Feedback on this activity</h2>
              {d.feedback.map((n) => <div key={n.id} className={'fb rag-' + n.rag}><p><b>{when(n.created_at)}</b> · {n.message}</p>{n.response ? <p className="muted">Your response: {n.response}</p> : <p className="muted"><Link href="/portal/feedback">Reply under Feedback</Link></p>}</div>)}
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
