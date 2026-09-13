'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import AppLayout from '../../AppLayout';
import { when } from '../../money';

const STAFF = ['admin', 'assessor', 'moderator', 'coordinator'];

export default function Users() {
  const { data: session } = useSession();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ name: '', email: '', role: 'assessor' });
  const [pw, setPw] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => fetch('/api/admin/users').then((r) => r.json()).then((d) => setRows(d.users)), []);
  useEffect(() => { load(); }, [load]);
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
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{STAFF.map((r) => <option key={r}>{r}</option>)}</select>
          <button className="btn btn--primary" type="submit">Create</button>
        </form>
        <p className="muted">Provider people are added from their organisation's page. Roles: admin runs the platform; assessor runs cases and signs decisions; moderator does Stage 5 only; coordinator does Stage 1 and returns.</p>
        {pw && <div className="alert alert--ok">Account created for {pw.user.email}. One-time password, shown once: <code>{pw.password}</code></div>}
        {msg && <div className="alert alert--error">{msg}</div>}
      </div>
      <div className="panel panel--table">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Organisation</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(rows || []).map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td>{u.name}{Number(session?.user?.id) === u.id ? <span className="muted"> (you)</span> : null}</td>
                <td>{u.email}</td>
                <td>{u.role === 'provider' ? 'provider' : <select className="input input--inline" value={u.role} onChange={(e) => call('/api/admin/users/' + u.id, { role: e.target.value }, 'PUT')}>{STAFF.map((r) => <option key={r}>{r}</option>)}</select>}</td>
                <td>{u.org_name || <span className="muted">scheme</span>}</td>
                <td className="nowrap">{u.last_login ? when(u.last_login) : '—'}</td>
                <td><span className={'status ' + (u.active ? 'ok' : 'bad')}>{u.active ? 'active' : 'deactivated'}</span></td>
                <td className="nowrap">
                  <button className="btn btn--tiny" onClick={async () => { const x = await call('/api/admin/users/' + u.id, { action: 'reset-password' }, 'POST'); if (x) setPw({ user: u, password: x.password }); }}>Reset password</button>{' '}
                  {Number(session?.user?.id) !== u.id && <button className="btn btn--tiny" onClick={() => call('/api/admin/users/' + u.id, { active: !u.active }, 'PUT')}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
