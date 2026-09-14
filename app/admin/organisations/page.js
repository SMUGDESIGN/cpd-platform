'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../../AppLayout';
import AdminNav from '../AdminNav';
import { gbp } from '../../money';

export default function Organisations() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ name: '', contactName: '', contactEmail: '' });
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/admin/organisations').then((r) => r.json()).then((d) => setRows(d.organisations)), []);
  useEffect(() => { load(); }, [load]);
  async function create(e) {
    e.preventDefault(); setErr('');
    const r = await fetch('/api/admin/organisations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Could not create.'); return; }
    setF({ name: '', contactName: '', contactEmail: '' }); load();
  }
  return (
    <AppLayout side={<AdminNav />}>
      <div className="page-head"><h1>Organisations</h1></div>
      <div className="panel">
        <h2>New provider</h2>
        <form onSubmit={create} className="act-row">
          <input className="input" placeholder="Organisation name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input className="input" placeholder="Contact name" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <input className="input" type="email" placeholder="Contact email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
          <button className="btn btn--primary" type="submit">Create</button>
        </form>
        {err && <div className="alert alert--error">{err}</div>}
      </div>
      <div className="panel panel--table">
        <table className="table">
          <thead><tr><th>Provider</th><th>Contact</th><th>Status</th><th>People</th><th>Cases</th><th>Accredited</th><th>Owed</th><th>Unread</th></tr></thead>
          <tbody>
            {rows && !rows.length && <tr><td colSpan={8} className="muted">No providers yet.</td></tr>}
            {(rows || []).map((o) => (
              <tr key={o.id}>
                <td><Link href={'/admin/organisations/' + o.id} className="ref">{o.name}</Link></td>
                <td>{o.contact_name || '—'}{o.contact_email ? <span className="muted"> · {o.contact_email}</span> : null}</td>
                <td><span className={'status ' + (o.status === 'active' ? 'ok' : (o.status === 'pending' ? 'warn' : 'bad'))}>{o.status === 'pending' ? 'awaiting vetting' : o.status}</span></td>
                <td>{o.people}</td><td>{o.cases}</td><td>{o.accredited}</td>
                <td className="nowrap">{o.owed_pence ? <span className={o.overdue_invoices ? 'owed bad' : 'owed'}>{gbp(o.owed_pence)}{o.overdue_invoices ? ' · overdue' : ''}</span> : '—'}</td>
                <td>{o.unseen || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
