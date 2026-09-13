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
        <p className="muted">Provider people are added from their organisation's page. <b>Super admin</b> runs the whole platform and sees everything. <b>Support</b> looks after accounts, organisations and billing, reads cases but does not change them, and cannot touch a super admin. <b>Assessor</b> runs cases and signs decisions; <b>moderator</b> does Stage 5 only; <b>coordinator</b> does Stage 1 and returns.</p>
        {pw && <div className="alert alert--ok">Account created for {pw.user.email}. One-time password, shown once: <code>{pw.password}</code></div>}
        {msg && <div className="alert alert--error">{msg}</div>}
      </div>
      <div className="panel panel--table">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Organisation</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(rows || []).map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td>{u.name}{me.id === u.id ? <span className="muted"> (you)</span> : null}</td>
                <td>{u.email}</td>
                <td>{u.role === 'provider' || !canTouch(u) || me.id === u.id ? <span className={u.role === 'superadmin' ? 'status ok' : ''}>{LABEL[u.role] || u.role}</span>
                  : <select className="input input--inline" value={u.role} onChange={(e) => call('/api/admin/users/' + u.id, { role: e.target.value }, 'PUT')}>{STAFF.map((r) => <option key={r} value={r} disabled={!grantable.includes(r)}>{LABEL[r]}</option>)}</select>}</td>
                <td>{u.org_name || <span className="muted">scheme</span>}</td>
                <td className="nowrap">{u.last_login ? when(u.last_login) : '—'}</td>
                <td><span className={'status ' + (u.active ? 'ok' : 'bad')}>{u.active ? 'active' : 'deactivated'}</span></td>
                <td className="nowrap">
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
