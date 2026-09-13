'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import AppLayout from '../../AppLayout';
import EmailPrefs from '../../EmailPrefs';

export default function ProviderAccount() {
  const { data: session } = useSession();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');
  useEffect(() => { fetch('/api/portal/account').then((r) => r.json()).then((x) => { setD(x); setF({ contactName: x.org.contact_name || '', contactEmail: x.org.contact_email || '', phone: x.org.phone || '', address: x.org.address || '', website: x.org.website || '' }); }); }, []);
  async function save(e) {
    e.preventDefault(); setMsg('');
    const r = await fetch('/api/portal/account', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    setMsg(r.ok ? 'Saved.' : 'Could not save.');
  }
  async function changePw(e) {
    e.preventDefault(); setPwMsg('');
    const r = await fetch('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pw) });
    const x = await r.json().catch(() => ({}));
    setPwMsg(r.ok ? 'Password changed.' : (x.error || 'Could not change the password.'));
    if (r.ok) setPw({ current: '', next: '' });
  }
  return (
    <AppLayout>
      <h1>Account</h1>
      {d && f && (
        <>
          <div className="panel">
            <h2>{d.org.name}</h2>
            <p className="muted">Status: {d.org.status}. The organisation's name is changed by the scheme - contact us.</p>
            <form onSubmit={save} className="form-wide">
              <div className="grid2">
                <div className="field"><label>Contact name</label><input className="input" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></div>
                <div className="field"><label>Contact email</label><input className="input" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></div>
                <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
                <div className="field"><label>Website</label><input className="input" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
              </div>
              <div className="field"><label>Address</label><textarea className="input" rows={3} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
              {msg && <div className="alert alert--ok">{msg}</div>}
              <button className="btn btn--primary" type="submit">Save details</button>
            </form>
          </div>
          <div className="panel">
            <h2>People with access</h2>
            <ul className="plain">{d.users.map((u) => <li key={u.id}>{u.name} · {u.email}{!u.active ? ' · deactivated' : ''}{session?.user?.email === u.email ? ' (you)' : ''}</li>)}</ul>
            <p className="muted">To add or remove a colleague, ask us - we set up access and hand over a one-time password.</p>
          </div>
          <EmailPrefs />
          <div className="panel">
            <h2>Your password</h2>
            <form onSubmit={changePw} className="form-narrow">
              <div className="field"><label>Current password</label><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" /></div>
              <div className="field"><label>New password (12+ characters)</label><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={12} autoComplete="new-password" /></div>
              {pwMsg && <div className={'alert ' + (pwMsg === 'Password changed.' ? 'alert--ok' : 'alert--error')}>{pwMsg}</div>}
              <button className="btn btn--primary" type="submit">Change password</button>
            </form>
          </div>
        </>
      )}
    </AppLayout>
  );
}
