'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../AppLayout';
import { gbp, when, longDay } from '../money';

const KIND = { submitted: 'New application', items_sent: 'Items sent', fix_reported: 'Fix reported / reply', feedback_ack: 'Feedback acknowledged', reminder: 'Invoice reminder sent', approved: 'Sign-up approved', email_confirmed: 'Sign-up email confirmed', verification_resent: 'Confirmation email re-sent' };

export default function Admin() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [intake, setIntake] = useState(null);
  const load = useCallback(() => {
    fetch('/api/admin/overview').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load (' + e + ').'));
    fetch('/api/admin/intake').then((r) => (r.ok ? r.json() : { intake: [] })).then((x) => setIntake(x.intake || [])).catch(() => setIntake([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  async function seen(ids) { await fetch('/api/admin/events', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }); load(); }
  const [cron, setCron] = useState('');
  const [mail, setMail] = useState(null);
  const [mailMsg, setMailMsg] = useState('');
  const loadMail = useCallback(() => fetch('/api/admin/email').then((r) => (r.ok ? r.json() : null)).then(setMail), []);
  useEffect(() => { loadMail(); }, [loadMail]);
  async function mailAction(action) {
    setMailMsg('Working…');
    const r = await fetch('/api/admin/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const x = await r.json().catch(() => ({}));
    setMailMsg(action === 'digests' ? `Digests: ${x.people || 0} people, ${x.sent || 0} sent, ${x.failed || 0} failed.` : (x.ok ? `Test email ${x.mode === 'log' ? 'logged to the outbox (mode: log)' : 'sent'}.` : 'Test failed: ' + (x.error || r.status)));
    loadMail();
  }
  async function runChecks() {
    setCron('Running…');
    const r = await fetch('/api/admin/cron', { method: 'POST' });
    const x = await r.json().catch(() => ({}));
    setCron(r.ok ? `Checked ${x.entries} cases and ${x.overdueInvoices} overdue invoices; ${x.notificationsWritten} new notification${x.notificationsWritten === 1 ? '' : 's'}.` : (x.error || 'Failed.'));
    window.dispatchEvent(new Event('cpd:notifications'));
    loadMail();
  }
  return (
    <AppLayout>
      <div className="page-head"><h1>Admin</h1><nav className="subnav"><Link href="/admin/organisations">Organisations</Link><Link href="/admin/users">People</Link><Link href="/admin/billing">Billing due</Link><button type="button" className="btn btn--tiny" onClick={runChecks} title="Fix windows ending, conditions overdue, reviews due, invoices overdue - what the nightly job does on Vercel">Run daily checks</button></nav></div>
      {cron && <div className="alert alert--ok">{cron}</div>}
      {err && <div className="alert alert--error">{err}</div>}
      {d && (
        <>
          <div className="stats">
            <Link href="/admin/organisations" className="stat"><b>{d.organisations.active}</b><span>active providers{d.organisations.total !== d.organisations.active ? ' of ' + d.organisations.total : ''}{d.organisations.pending ? ' · ' + d.organisations.pending + ' awaiting vetting' : ''}</span></Link>
            <Link href="/admin/users" className="stat"><b>{d.users.providers}</b><span>provider people · {d.users.staff} staff{d.users.inactive ? ' · ' + d.users.inactive + ' inactive' : ''}</span></Link>
            <Link href="/dashboard" className="stat"><b>{d.cases.open}</b><span>open cases · {d.cases.accredited} accredited{d.cases.unassigned ? ' · ' + d.cases.unassigned + ' not linked to a provider' : ''}</span></Link>
            <Link href="/admin/billing" className={'stat' + (d.money.overdue ? ' bad' : '')}><b>{gbp(d.money.outstanding)}</b><span>owed to the scheme{d.money.overdue ? ' · ' + gbp(d.money.overdue) + ' overdue' : ''} · {gbp(d.money.paid_this_year)} paid this year</span></Link>
          </div>
          {(d.pendingSignups.length > 0 || Object.keys(d.signupAttempts || {}).some((k) => !['created', 'verified'].includes(k))) && (
            <div className={'panel' + (d.pendingSignups.length ? ' panel--action' : '')}>
              <div className="page-head"><h2>Sign-ups to vet ({d.pendingSignups.length})</h2><span className="muted">From the website. Approval waits for the contact to confirm their email; Approve then creates the portal login and emails it; Decline closes the record.</span></div>
              {d.pendingSignups.length > 0 && (
                <table className="table">
                  <thead><tr><th>Organisation</th><th>Contact</th><th>Email</th><th>Delivers</th><th>Applied</th><th></th></tr></thead>
                  <tbody>{d.pendingSignups.map((o) => <tr key={o.id}><td><Link href={'/admin/organisations/' + o.id}><b>{o.name}</b></Link>{o.website ? <span className="muted"> · {o.website}</span> : null}</td><td>{o.contact_name}<br /><span className="muted">{o.contact_email}{o.phone ? ' · ' + o.phone : ''}</span></td><td><span className={'status ' + (o.email_verified_at ? 'ok' : 'warn')}>{o.email_verified_at ? 'confirmed' : 'not confirmed'}</span></td><td>{o.formats || '—'}</td><td className="nowrap">{when(o.applied_at)}</td><td className="nowrap"><Link className="btn btn--tiny" href={'/admin/organisations/' + o.id}>Vet</Link></td></tr>)}</tbody>
                </table>
              )}
              <p className="muted">Last 7 days at the sign-up door: {['created', 'verified', 'duplicate', 'honeypot', 'bad_token', 'bad_origin', 'rate_limited', 'invalid'].filter((k) => d.signupAttempts[k]).map((k) => k.replace('_', ' ') + ' ' + d.signupAttempts[k]).join(' · ') || 'nothing'}.</p>
            </div>
          )}
          {intake && (
            <div className={'panel' + (intake.some((i) => i.state === 'untouched') ? ' panel--action' : '')}>
              <div className="page-head"><h2>Intake - waiting at Stage 1 ({intake.length})</h2><span className="muted">{intake.filter((i) => i.kind === 'renewal').length} renewal{intake.filter((i) => i.kind === 'renewal').length === 1 ? '' : 's'} · {intake.filter((i) => i.source === 'portal').length} from the portal</span></div>
              {!intake.length && <p className="muted">Nothing waiting - every open case has cleared Stage 1.</p>}
              {intake.length > 0 && (
                <table className="table">
                  <thead><tr><th>Ref</th><th>Activity</th><th>Organisation</th><th>Kind</th><th>From</th><th>Lead</th><th>Stage 1</th><th>Waiting</th></tr></thead>
                  <tbody>{intake.map((i) => (
                    <tr key={i.id} className={i.state === 'untouched' ? 'overdue' : ''}>
                      <td className="ref"><Link href={'/cases/' + encodeURIComponent(i.id) + '/stage-1'}>{i.ref || '(no ref)'}</Link></td>
                      <td>{i.activity || <span className="muted">not set</span>}</td>
                      <td>{i.org_id ? <Link href={'/admin/organisations/' + i.org_id}>{i.org_name}</Link> : (i.provider || <span className="muted">not linked</span>)}</td>
                      <td>{i.kind === 'renewal' ? <span className="status warn" title={'Renews ' + i.renewal_of}>renewal</span> : 'application'}</td>
                      <td>{i.source === 'portal' ? 'portal' : (i.opened_by || 'staff')}</td>
                      <td>{i.lead || <span className="muted">unassigned</span>}</td>
                      <td><span className={'status ' + (i.state === 'untouched' ? 'bad' : (i.state === 'with provider' ? 'idle' : 'warn'))}>{i.state}</span>{i.returns ? <span className="muted"> · {i.returns} return{i.returns === 1 ? '' : 's'}</span> : null}</td>
                      <td className="nowrap">{i.days_waiting} day{i.days_waiting === 1 ? '' : 's'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
          <div className="panel">
            <div className="page-head"><h2>From providers, unread ({d.unseenEvents.length})</h2>{d.unseenEvents.length > 0 && <button className="btn" onClick={() => seen(d.unseenEvents.map((e) => e.id))}>Mark all read</button>}</div>
            {!d.unseenEvents.length && <p className="muted">Nothing waiting.</p>}
            <ul className="events">{d.unseenEvents.map((e) => <li key={e.id}><span className="muted">{when(e.at)}</span> <b>{e.org_name}</b>{e.ref ? <> · <Link href={'/cases/' + encodeURIComponent(e.entry_id)}>{e.ref}</Link></> : null} · {KIND[e.kind] || e.kind}{e.message ? ': ' + e.message : ''} <button className="btn btn--tiny" onClick={() => seen([e.id])}>read</button></li>)}</ul>
          </div>
          {mail && (
            <div className="panel">
              <div className="page-head"><h2>Email</h2><span className="act-row"><button className="btn btn--tiny" onClick={() => mailAction('digests')}>Send daily digests now</button><button className="btn btn--tiny" onClick={() => mailAction('test')}>Send me a test email</button></span></div>
              <p className="muted">Mode: <b>{mail.mode}</b>{mail.mode === 'log' ? ' - nothing leaves this machine; every email is written to the outbox below instead' : (mail.mode === 'resend-unconfigured' ? ' - EMAIL_PROVIDER is resend but RESEND_API_KEY is missing, so sends fail' : ' - sending through Resend')}. From: {mail.from}. Waiting for a digest: {mail.waiting.n} notification{mail.waiting.n === 1 ? '' : 's'} for {mail.waiting.people} {mail.waiting.people === 1 ? 'person' : 'people'}. Preferences: {mail.prefs.map((p) => p.pref + ' ' + p.n).join(', ') || 'none'}.</p>
              {mailMsg && <div className="alert alert--ok">{mailMsg}</div>}
              {mail.outbox.length > 0 && (
                <table className="table"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Items</th><th>Status</th></tr></thead>
                  <tbody>{mail.outbox.map((o) => <tr key={o.id}><td className="nowrap">{when(o.created_at)}</td><td>{o.to_email}</td><td>{o.subject}</td><td>{o.items || 0}</td><td><span className={'status ' + (o.status === 'failed' ? 'bad' : (o.status === 'sent' ? 'ok' : 'idle'))}>{o.status}{o.error ? ' - ' + o.error : ''}</span></td></tr>)}</tbody></table>
              )}
            </div>
          )}
          {d.overdueInvoices.length > 0 && (
            <div className="panel panel--action">
              <div className="page-head"><h2>Overdue invoices</h2><Link className="btn btn--tiny" href="/admin/billing">Chase from Billing due</Link></div>
              <ul className="plain">{d.overdueInvoices.map((i) => <li key={i.number}><Link href={'/admin/organisations/' + i.org_id}>{i.org_name}</Link> · {i.number} · {gbp(i.amount_pence)} · due {longDay(i.due_at)}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
