'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../AppLayout';
import { gbp, when, longDay } from '../money';

const KIND = { submitted: 'New application', items_sent: 'Items sent', fix_reported: 'Fix reported / reply', feedback_ack: 'Feedback acknowledged', reminder: 'Invoice reminder sent' };

export default function Admin() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/admin/overview').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load (' + e + ').')), []);
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
            <Link href="/admin/organisations" className="stat"><b>{d.organisations.active}</b><span>active providers{d.organisations.total !== d.organisations.active ? ' of ' + d.organisations.total : ''}</span></Link>
            <Link href="/admin/users" className="stat"><b>{d.users.providers}</b><span>provider people · {d.users.staff} staff{d.users.inactive ? ' · ' + d.users.inactive + ' inactive' : ''}</span></Link>
            <Link href="/dashboard" className="stat"><b>{d.cases.open}</b><span>open cases · {d.cases.accredited} accredited{d.cases.unassigned ? ' · ' + d.cases.unassigned + ' not linked to a provider' : ''}</span></Link>
            <Link href="/admin/billing" className={'stat' + (d.money.overdue ? ' bad' : '')}><b>{gbp(d.money.outstanding)}</b><span>owed to the scheme{d.money.overdue ? ' · ' + gbp(d.money.overdue) + ' overdue' : ''} · {gbp(d.money.paid_this_year)} paid this year</span></Link>
          </div>
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
