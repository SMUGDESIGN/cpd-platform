'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../../AppLayout';
import { when } from '../../money';

const STAFF = ['superadmin', 'support', 'assessor', 'moderator', 'coordinator'];
const LABEL = { superadmin: 'super admin', support: 'support', assessor: 'assessor', moderator: 'moderator', coordinator: 'coordinator', provider: 'provider' };

export default function Users() {
  const [rows, setRows] = useState(null);
  const [me, setMe] = useState({});
  const [f, setF] = useState({ name: '', email: '', role: 'assessor' });
  const [pw, setPw] = useState(null);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState(null); // {user, title, body}
  const [sent, setSent] = useState('');
  const [phoneEdit, setPhoneEdit] = useState({}); // id -> value while editing
  const load = useCallback(() => fetch('/api/admin/users').then((r) => r.json()).then((d) => { setRows(d.users); setMe(d.me || {}); }), []);
  useEffect(() => { load(); }, [load]);
  const superMe = me.role === 'superadmin';
  const grantable = STAFF.filter((r) => superMe || (r !== 'superadmin' && r !== 'support'));
  const canTouch = (u) => superMe || (u.role !== 'superadmin');
  const call = async (url, body, method) => {
    setMsg('');
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(x.error || 'That did not save.'); return null; }
    load(); return x;
  };
  return (
    <AppLayout>
      <div className="page-head"><h1>People</h1><nav className="subnav"><Link href="/admin">Admin</Link><Link href="/admin/organisations">Organisations</Link></nav></div>
      <div className="panel">
        <h2>New member of staff</h2>
        <form className="act-row" onSubmit={async (e) => { e.preventDefault(); const x = await call('/api/admin/users', f, 'POST'); if (x) { setPw(x); setF({ name: '', email: '', role: 'assessor' }); } }}>
          <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{grantable.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}</select>
          <button className="btn btn--primary" type="submit">Create</button>
        </form>
        <p className="muted">Provider people are added from their organisation's page. <b>Super admin</b> runs the whole platform and sees everything. <b>Support</b> looks after accounts, organisations and billing, runs Stage 1 of any case and nothing beyond it, and cannot touch a super admin. <b>Assessor</b> runs cases and signs decisions; <b>moderator</b> does Stage 5 only; <b>coordinator</b> does Stage 1 and returns.</p>
        {pw && <div className="alert alert--ok">Account created for {pw.user.email}. One-time password, shown once: <code>{pw.password}</code></div>}
        {msg && <div className="alert alert--error">{msg}</div>}
        {sent && <div className="alert alert--ok">{sent}</div>}
      </div>
      {note && (
        <div className="panel">
          <h2>Message {note.user.name}</h2>
          <p className="muted">Lands under their bell, and in their email straight away if they take email. Signed with your name.</p>
          <form className="form-narrow" onSubmit={async (e) => { e.preventDefault(); const x = await call('/api/admin/users/' + note.user.id, { action: 'message', title: note.title, body: note.body }, 'POST'); if (x) { setSent('Sent to ' + note.user.name + '.'); setNote(null); } }}>
            <div className="field"><label htmlFor="m-t">Subject</label><input id="m-t" className="input" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} required /></div>
            <div className="field"><label htmlFor="m-b">Message</label><textarea id="m-b" className="input" rows={4} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} /></div>
            <p className="act-row"><button className="btn btn--primary" type="submit">Send</button><button className="btn" type="button" onClick={() => setNote(null)}>Cancel</button></p>
          </form>
        </div>
      )}
      <div className="panel panel--table">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Organisation</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(rows || []).map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td>{u.name}{me.id === u.id ? <span className="muted"> (you)</span> : null}</td>
                <td>{u.email}</td>
                <td className="nowrap">{phoneEdit[u.id] !== undefined
                  ? <form className="act-row" onSubmit={async (e) => { e.preventDefault(); const x = await call('/api/admin/users/' + u.id, { phone: phoneEdit[u.id] }, 'PUT'); if (x) { const p = { ...phoneEdit }; delete p[u.id]; setPhoneEdit(p); } }}><input className="input input--inline" type="tel" value={phoneEdit[u.id]} onChange={(e) => setPhoneEdit({ ...phoneEdit, [u.id]: e.target.value })} style={{ width: 130 }} autoFocus /><button className="btn btn--tiny" type="submit">Save</button></form>
                  : <>{u.phone ? <a href={'tel:' + u.phone.replace(/\s+/g, '')}>{u.phone}</a> : <span className="muted">—</span>}{(canTouch(u) || me.id === u.id) && <button className="btn btn--tiny" style={{ marginLeft: 6 }} onClick={() => setPhoneEdit({ ...phoneEdit, [u.id]: u.phone || '' })} title="Edit phone">✎</button>}</>}</td>
                <td>{u.role === 'provider' || !canTouch(u) || me.id === u.id ? <span className={u.role === 'superadmin' ? 'status ok' : ''}>{LABEL[u.role] || u.role}</span>
                  : <select className="input input--inline" value={u.role} onChange={(e) => call('/api/admin/users/' + u.id, { role: e.target.value }, 'PUT')}>{STAFF.map((r) => <option key={r} value={r} disabled={!grantable.includes(r)}>{LABEL[r]}</option>)}</select>}</td>
                <td>{u.org_name || <span className="muted">scheme</span>}</td>
                <td className="nowrap">{u.last_login ? when(u.last_login) : '—'}</td>
                <td><span className={'status ' + (u.active ? 'ok' : 'bad')}>{u.active ? 'active' : 'deactivated'}</span></td>
                <td className="nowrap">
                  {me.id !== u.id && u.active && <><button className="btn btn--tiny" onClick={() => { setSent(''); setNote({ user: u, title: '', body: '' }); }}>Message</button>{' '}</>}
                  {canTouch(u) && <><button className="btn btn--tiny" onClick={async () => { const x = await call('/api/admin/users/' + u.id, { action: 'reset-password' }, 'POST'); if (x) setPw({ user: u, password: x.password }); }}>Reset password</button>{' '}
                  {me.id !== u.id && <button className="btn btn--tiny" onClick={() => call('/api/admin/users/' + u.id, { active: !u.active }, 'PUT')}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
