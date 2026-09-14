'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '../../../AppLayout';
import { gbp, when, longDay } from '../../../money';

const KIND = { submitted: 'New application', items_sent: 'Items sent', fix_reported: 'Fix reported / reply', feedback_ack: 'Feedback acknowledged', reminder: 'Invoice reminder sent' };

export default function Organisation() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [nu, setNu] = useState({ name: '', email: '' });
  const [pw, setPw] = useState(null);
  const [inv, setInv] = useState({ description: 'Assessment fee', amount: '', dueAt: '', entryId: '' });
  const [fb, setFb] = useState({ entryId: '', rag: 'amber', message: '' });
  const [assign, setAssign] = useState('');
  const load = useCallback(() => fetch('/api/admin/organisations/' + id).then((r) => r.json()).then((x) => { setD(x); setF({ name: x.org.name, contactName: x.org.contact_name || '', contactEmail: x.org.contact_email || '', phone: x.org.phone || '', address: x.org.address || '', website: x.org.website || '', status: x.org.status, notes: x.org.notes || '' }); }), [id]);
  useEffect(() => { load(); }, [load]);
  const post = async (url, body, method = 'POST') => {
    setMsg('');
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(x.error || 'That did not save.'); return null; }
    load(); return x;
  };
  return (
    <AppLayout>
      <p><Link href="/admin/organisations">← Organisations</Link></p>
      {d && f && (
        <>
          <div className="page-head"><h1>{d.org.name}</h1><span className={'status ' + (d.org.status === 'active' ? 'ok' : 'bad')}>{d.org.status}</span></div>
          {msg && <div className="alert alert--error">{msg}</div>}
          <div className="stats">
            <div className="stat"><b>{d.cases.length}</b><span>cases · {d.cases.filter((c) => c.provider.accredited).length} accredited</span></div>
            <div className={'stat' + (d.owedPence ? ' bad' : '')}><b>{gbp(d.owedPence)}</b><span>owed</span></div>
            <div className="stat"><b>{d.users.filter((u) => u.active).length}</b><span>people with access</span></div>
            <div className="stat"><b>{d.events.filter((e) => !e.seen_at).length}</b><span>unread from them</span></div>
          </div>

          <div className="panel">
            <h2>Cases</h2>
            <table className="table">
              <thead><tr><th>Ref</th><th>Activity</th><th>Assessor view</th><th>Provider sees</th><th>Next review</th><th>Saved</th></tr></thead>
              <tbody>
                {!d.cases.length && <tr><td colSpan={6} className="muted">No cases linked yet.</td></tr>}
                {d.cases.map((c) => <tr key={c.id}><td><Link href={'/cases/' + encodeURIComponent(c.id)} className="ref">{c.ref || '—'}</Link></td><td>{c.activity}</td><td><span className={'status ' + c.vcls}>{c.verdict}</span></td><td>{c.provider.headline}</td><td className="nowrap">{c.provider.review ? c.provider.review.next + ' · ' + c.provider.review.nextLong : '—'}</td><td className="nowrap">{when(c.updatedAt)}{c.updatedBy ? ' · ' + c.updatedBy : ''}</td></tr>)}
              </tbody>
            </table>
            {d.unassigned.length > 0 && (
              <div className="act-row" style={{ marginTop: 12 }}>
                <select className="input" value={assign} onChange={(e) => setAssign(e.target.value)}><option value="">Link a case not yet assigned to a provider…</option>{d.unassigned.map((u) => <option key={u.id} value={u.id}>{u.ref || u.id} · {u.activity || 'untitled'}{u.provider ? ' · ' + u.provider : ''}</option>)}</select>
                <button className="btn" disabled={!assign} onClick={() => post('/api/admin/organisations/' + id + '/entries', { entryId: assign }).then(() => setAssign(''))}>Link to this provider</button>
              </div>
            )}
          </div>

          <div className="grid2">
            <div className="panel">
              <h2>People</h2>
              <ul className="plain">{d.users.map((u) => <li key={u.id}>{u.name} · {u.email}{!u.active ? ' · deactivated' : ''} <Link href="/admin/users" className="muted">manage</Link></li>)}</ul>
              <form className="act-row" onSubmit={async (e) => { e.preventDefault(); const x = await post('/api/admin/organisations/' + id + '/users', nu); if (x) { setPw(x); setNu({ name: '', email: '' }); } }}>
                <input className="input" placeholder="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required />
                <input className="input" type="email" placeholder="Email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required />
                <button className="btn btn--primary" type="submit">Add person</button>
              </form>
              {pw && <div className="alert alert--ok">Access created for {pw.user.email}. One-time password, shown once: <code>{pw.password}</code></div>}
            </div>
            <div className="panel">
              <h2>Details</h2>
              <form onSubmit={(e) => { e.preventDefault(); post('/api/admin/organisations/' + id, f, 'PUT').then((x) => x && setMsg('')); }}>
                <div className="field"><label>Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                <div className="grid2">
                  <div className="field"><label>Contact</label><input className="input" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></div>
                  <div className="field"><label>Email</label><input className="input" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></div>
                  <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
                  <div className="field"><label>Website</label><input className="input" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
                </div>
                <div className="field"><label>Address</label><textarea className="input" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
                <div className="field"><label>Status</label><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">active</option><option value="suspended">suspended - can sign in, cannot apply</option><option value="closed">closed - cannot sign in</option></select></div>
                <div className="field"><label>Internal notes (never shown to the provider)</label><textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
                <button className="btn btn--primary" type="submit">Save</button>
              </form>
            </div>
          </div>

          <div className="panel">
            <h2>Billing · {gbp(d.owedPence)} owed</h2>
            <table className="table">
              <thead><tr><th>Invoice</th><th>For</th><th>Case</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th><th>Chased</th><th></th></tr></thead>
              <tbody>
                {!d.invoices.length && <tr><td colSpan={9} className="muted">No invoices.</td></tr>}
                {d.invoices.map((i) => <tr key={i.id}><td className="ref">{i.number}</td><td>{i.description}</td><td>{(d.cases.find((c) => c.id === i.entry_id) || {}).ref || '—'}</td><td className="nowrap">{longDay(i.issued_at)}</td><td className="nowrap">{i.due_at ? longDay(i.due_at) : '—'}</td><td className="nowrap">{gbp(i.amount_pence)}</td><td><span className={'status ' + (i.status === 'paid' ? 'ok' : (i.status === 'void' ? 'idle' : 'warn'))}>{i.status}{i.paid_at ? ' ' + longDay(i.paid_at) : ''}</span></td>
                  <td className="nowrap">{i.reminders ? i.reminders + '× · ' + when(i.reminded_at) : (i.status === 'issued' ? 'never' : '—')}</td>
                  <td className="nowrap">{i.status === 'issued' && <><button className="btn btn--tiny" onClick={() => post('/api/admin/invoices/' + i.id, { action: 'remind' })}>Send reminder</button> <button className="btn btn--tiny" onClick={() => post('/api/admin/invoices/' + i.id, { status: 'paid' }, 'PUT')}>Mark paid</button> <button className="btn btn--tiny" onClick={() => confirm('Void ' + i.number + '?') && post('/api/admin/invoices/' + i.id, { status: 'void' }, 'PUT')}>Void</button></>}</td></tr>)}
              </tbody>
            </table>
            <form className="act-row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); post('/api/admin/organisations/' + id + '/invoices', inv).then((x) => x && setInv({ description: 'Assessment fee', amount: '', dueAt: '', entryId: '' })); }}>
              <input className="input" placeholder="Description" value={inv.description} onChange={(e) => setInv({ ...inv, description: e.target.value })} required />
              <input className="input" placeholder="Amount £" inputMode="decimal" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} required style={{ width: 120 }} />
              <input className="input" placeholder="Due YYYY-MM-DD" value={inv.dueAt} onChange={(e) => setInv({ ...inv, dueAt: e.target.value })} style={{ width: 150 }} />
              <select className="input" value={inv.entryId} onChange={(e) => setInv({ ...inv, entryId: e.target.value })}><option value="">No case</option>{d.cases.map((c) => <option key={c.id} value={c.id}>{c.ref || c.id}</option>)}</select>
              <button className="btn btn--primary" type="submit">Raise invoice</button>
            </form>
          </div>

          <div className="panel">
            <h2>Feedback shared with this provider</h2>
            {!d.notices.length && <p className="muted">Nothing shared yet.</p>}
            {d.notices.map((n) => <div key={n.id} className={'fb rag-' + n.rag}><p><span className={'status rag ' + n.rag}>{n.rag}</span> {n.ref ? <b>{n.ref} · </b> : null}{n.message} <span className="muted">· {when(n.created_at)} by {n.created_by_name}</span></p>{n.acknowledged_at ? <p className="muted">Provider replied {when(n.acknowledged_at)}: {n.response}</p> : <p className="muted">No reply yet.</p>}</div>)}
            <form className="act-row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); post('/api/admin/organisations/' + id + '/feedback', fb).then((x) => x && setFb({ entryId: '', rag: 'amber', message: '' })); }}>
              <select className="input" value={fb.entryId} onChange={(e) => setFb({ ...fb, entryId: e.target.value })}><option value="">Whole organisation</option>{d.cases.map((c) => <option key={c.id} value={c.id}>{c.ref || c.id} · {c.activity}</option>)}</select>
              <select className="input" value={fb.rag} onChange={(e) => setFb({ ...fb, rag: e.target.value })}><option value="green">green</option><option value="amber">amber</option><option value="red">red</option></select>
              <input className="input" placeholder="What the feedback shows and what you want them to do" value={fb.message} onChange={(e) => setFb({ ...fb, message: e.target.value })} required style={{ flex: 2 }} />
              <button className="btn btn--primary" type="submit">Share</button>
            </form>
          </div>

          <div className="panel">
            <h2>What they did in the portal</h2>
            {!d.events.length && <p className="muted">Nothing yet.</p>}
            <ul className="events">{d.events.map((e) => <li key={e.id} className={e.seen_at ? 'seen' : ''}><span className="muted">{when(e.at)}</span> {e.ref ? <b>{e.ref} · </b> : null}{KIND[e.kind] || e.kind}{e.message ? ': ' + e.message : ''}{e.by_name ? <span className="muted"> · {e.by_name}</span> : null}</li>)}</ul>
          </div>
        </>
      )}
    </AppLayout>
  );
}
