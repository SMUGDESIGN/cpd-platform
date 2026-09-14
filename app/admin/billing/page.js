'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../../AppLayout';
import AdminNav from '../AdminNav';
import { gbp, when, longDay } from '../../money';

/* Billing due - the support desk's money screen: what is outstanding, who
   owes it, how long it has been overdue and when it was last chased. Chase
   sends the organisation a reminder there and then; paid records the money. */
export default function Billing() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState({});
  const load = useCallback(() => fetch('/api/admin/invoices').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setD).catch((e) => setErr('Could not load (' + e + ').')), []);
  useEffect(() => { load(); }, [load]);
  async function call(url, body, method) {
    setMsg('');
    const r = await fetch(url, { method: method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(x.error || 'Failed (' + r.status + ')'); return null; }
    load(); return x;
  }
  const remind = async (i) => {
    const x = await call('/api/admin/invoices/' + i.id, { action: 'remind', note: note[i.id] || '' });
    if (x) { setMsg('Reminder ' + x.reminders + ' sent to ' + i.org_name + ' for ' + i.number + '.'); setNote({ ...note, [i.id]: '' }); }
  };
  const groups = [];
  (d?.invoices || []).forEach((i) => { let g = groups.find((x) => x.org_id === i.org_id); if (!g) { g = { org_id: i.org_id, org_name: i.org_name, contact_name: i.contact_name, contact_email: i.contact_email, phone: i.phone, rows: [] }; groups.push(g); } g.rows.push(i); });
  return (
    <AppLayout side={<AdminNav />}>
      <div className="page-head"><h1>Billing due</h1></div>
      {err && <div className="alert alert--error">{err}</div>}
      {msg && <div className="alert alert--ok">{msg}</div>}
      {d && (
        <>
          <div className="stats">
            <div className={'stat' + (d.overdue ? ' bad' : '')}><b>{gbp(d.total)}</b><span>outstanding across {d.invoices.length} invoice{d.invoices.length === 1 ? '' : 's'}{d.overdue ? ' · ' + gbp(d.overdue) + ' overdue' : ''}</span></div>
            <div className="stat"><b>{groups.length}</b><span>organisation{groups.length === 1 ? '' : 's'} owing</span></div>
          </div>
          {!groups.length && <p className="muted">Nothing outstanding.</p>}
          {groups.map((g) => (
            <div className="panel" key={g.org_id}>
              <div className="page-head"><h2><Link href={'/admin/organisations/' + g.org_id}>{g.org_name}</Link></h2><span className="muted">{g.contact_name || ''}{g.contact_email ? ' · ' + g.contact_email : ''}{g.phone ? ' · ' + g.phone : ''} · owes {gbp(g.rows.reduce((s, r) => s + r.amount_pence, 0))}</span></div>
              <table className="table">
                <thead><tr><th>Invoice</th><th>For</th><th>Case</th><th>Due</th><th>Amount</th><th>Chased</th><th></th></tr></thead>
                <tbody>
                  {g.rows.map((i) => (
                    <tr key={i.id} className={i.days_overdue > 0 ? 'overdue' : ''}>
                      <td className="ref">{i.number}</td>
                      <td>{i.description}</td>
                      <td>{i.case_ref ? <Link href={'/cases/' + encodeURIComponent(i.entry_id) + '/stage-1'}>{i.case_ref}</Link> : '—'}</td>
                      <td className="nowrap">{i.due_at ? <>{longDay(i.due_at)}{i.days_overdue > 0 && <span className="status bad" style={{ marginLeft: 6 }}>{i.days_overdue} day{i.days_overdue === 1 ? '' : 's'} overdue</span>}</> : '—'}</td>
                      <td className="nowrap">{gbp(i.amount_pence)}</td>
                      <td className="nowrap">{i.reminders ? i.reminders + '× · last ' + when(i.reminded_at) : 'never'}</td>
                      <td className="nowrap">
                        <span className="act-row">
                          <input className="input input--inline" placeholder="note for the reminder (optional)" value={note[i.id] || ''} onChange={(e) => setNote({ ...note, [i.id]: e.target.value })} style={{ width: 220 }} />
                          <button className="btn btn--tiny" onClick={() => remind(i)}>Send reminder</button>
                          <button className="btn btn--tiny" onClick={() => call('/api/admin/invoices/' + i.id, { status: 'paid' }, 'PUT')}>Mark paid</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </AppLayout>
  );
}
