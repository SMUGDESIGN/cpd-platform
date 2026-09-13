'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../AppLayout';
import { gbp, longDay } from '../money';

const M = { done: 'Complete', progress: 'With us now', notstarted: 'Not yet', action: 'Needs you' };

function CaseCard({ c }) {
  const needs = (c.returned.length && !c.itemsSent) || c.asks.some((a) => !a.fixReported) || c.conditions.some((x) => x.status !== 'open');
  return (
    <Link href={'/portal/cases/' + encodeURIComponent(c.id)} className={'case-card' + (needs ? ' needs' : '')}>
      <div className="case-card__head"><span className="ref">{c.ref || 'Reference pending'}</span><span className={'status ' + (needs ? 'bad' : (c.accredited ? 'ok' : 'idle'))}>{c.headline}</span></div>
      <h3>{c.activity}</h3>
      {c.accredited && c.outcome && (
        <p className="muted">{c.outcome.accRef ? c.outcome.accRef + ' · ' : ''}accredited {c.outcome.accDate || '—'} · valid until {c.outcome.expDate || '—'}
          {c.review ? <> · next: {c.review.next} on {c.review.nextLong}{c.review.daysLeft != null && c.review.daysLeft <= 60 ? <b> ({c.review.daysLeft < 0 ? 'overdue' : c.review.daysLeft + ' days'})</b> : null}</> : null}</p>
      )}
      {!c.accredited && <div className="mini-milestones">{c.milestones.map((m) => <span key={m.name} className={'mm ' + m.status} title={m.name}>{M[m.status]}</span>)}</div>}
      {c.conditions.length > 0 && <p className="muted">{c.conditions.length} condition{c.conditions.length === 1 ? '' : 's'} to meet</p>}
    </Link>
  );
}

export default function PortalHome() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/portal/overview').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load your overview (' + e + ').')); }, []);
  return (
    <AppLayout>
      <div className="page-head"><h1>{d ? d.org.name : 'Overview'}</h1><Link href="/portal/apply" className="btn btn--primary">Apply for accreditation</Link></div>
      {err && <div className="alert alert--error">{err}</div>}
      {d && (
        <>
          {(d.money.outstanding > 0 || d.feedbackWaiting > 0) && (
            <div className="panel panel--notice">
              {d.money.outstanding > 0 && <p><b>{gbp(d.money.outstanding)} outstanding</b>{d.money.overdue ? <> · {d.money.overdue} invoice{d.money.overdue === 1 ? '' : 's'} overdue</> : null} · <Link href="/portal/billing">Billing</Link></p>}
              {d.feedbackWaiting > 0 && <p><b>{d.feedbackWaiting} feedback note{d.feedbackWaiting === 1 ? '' : 's'}</b> waiting for your reply · <Link href="/portal/feedback">Feedback</Link></p>}
            </div>
          )}
          <h2>In assessment</h2>
          {!d.inAssessment.length && <div className="panel"><p>Nothing in assessment. <Link href="/portal/apply">Apply for accreditation</Link> of a course.</p></div>}
          <div className="cards">{d.inAssessment.map((c) => <CaseCard key={c.id} c={c} />)}</div>
          <h2>Accredited</h2>
          {!d.accredited.length && <div className="panel"><p>No accredited activities yet.</p></div>}
          <div className="cards">{d.accredited.map((c) => <CaseCard key={c.id} c={c} />)}</div>
        </>
      )}
    </AppLayout>
  );
}
