'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../AppLayout';
import { gbp, when, longDay } from '../money';

const KIND = { submitted: 'New application', items_sent: 'Items sent', fix_reported: 'Fix reported / reply', feedback_ack: 'Feedback acknowledged' };

export default function Admin() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/admin/overview').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load (' + e + ').')), []);
  useEffect(() => { load(); }, [load]);
  async function seen(ids) { await fetch('/api/admin/events', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }); load(); }
  return (
    <AppLayout>
      <div className="page-head"><h1>Admin</h1><nav className="subnav"><Link href="/admin/organisations">Organisations</Link><Link href="/admin/users">People</Link></nav></div>
      {err && <div className="alert alert--error">{err}</div>}
      {d && (
        <>
          <div className="stats">
            <Link href="/admin/organisations" className="stat"><b>{d.organisations.active}</b><span>active providers{d.organisations.total !== d.organisations.active ? ' of ' + d.organisations.total : ''}</span></Link>
            <Link href="/admin/users" className="stat"><b>{d.users.providers}</b><span>provider people · {d.users.staff} staff{d.users.inactive ? ' · ' + d.users.inactive + ' inactive' : ''}</span></Link>
            <Link href="/dashboard" className="stat"><b>{d.cases.open}</b><span>open cases · {d.cases.accredited} accredited{d.cases.unassigned ? ' · ' + d.cases.unassigned + ' not linked to a provider' : ''}</span></Link>
            <Link href="/admin/organisations" className={'stat' + (d.money.overdue ? ' bad' : '')}><b>{gbp(d.money.outstanding)}</b><span>owed to the scheme{d.money.overdue ? ' · ' + gbp(d.money.overdue) + ' overdue' : ''} · {gbp(d.money.paid_this_year)} paid this year</span></Link>
          </div>
          <div className="panel">
            <div className="page-head"><h2>From providers, unread ({d.unseenEvents.length})</h2>{d.unseenEvents.length > 0 && <button className="btn" onClick={() => seen(d.unseenEvents.map((e) => e.id))}>Mark all read</button>}</div>
            {!d.unseenEvents.length && <p className="muted">Nothing waiting.</p>}
            <ul className="events">{d.unseenEvents.map((e) => <li key={e.id}><span className="muted">{when(e.at)}</span> <b>{e.org_name}</b>{e.ref ? <> · <Link href={'/tool?entry=' + encodeURIComponent(e.entry_id)}>{e.ref}</Link></> : null} · {KIND[e.kind] || e.kind}{e.message ? ': ' + e.message : ''} <button className="btn btn--tiny" onClick={() => seen([e.id])}>read</button></li>)}</ul>
          </div>
          {d.overdueInvoices.length > 0 && (
            <div className="panel panel--action">
              <h2>Overdue invoices</h2>
              <ul className="plain">{d.overdueInvoices.map((i) => <li key={i.number}><Link href={'/admin/organisations/' + i.org_id}>{i.org_name}</Link> · {i.number} · {gbp(i.amount_pence)} · due {longDay(i.due_at)}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
