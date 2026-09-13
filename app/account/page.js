'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import AppLayout from '../AppLayout';
import EmailPrefs from '../EmailPrefs';

export default function Account() {
  const { data: session } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function change(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    const r = await fetch('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setMsg('Password changed.'); setCurrent(''); setNext(''); } else setErr(d.error || 'Could not change the password.');
  }
  return (
    <AppLayout>
      <h1>Account</h1>
      <div className="panel">
        <p><strong>{session?.user?.name}</strong> · {session?.user?.email} · role: {session?.user?.role} · initials {session?.user?.initials}</p>
      </div>
      <EmailPrefs />
      <div className="panel">
        <h2>Change password</h2>
        <form onSubmit={change} className="form-narrow">
          <div className="field"><label htmlFor="cur">Current password</label><input id="cur" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></div>
          <div className="field"><label htmlFor="nxt">New password (12+ characters)</label><input id="nxt" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} autoComplete="new-password" /></div>
          {msg && <div className="alert alert--ok">{msg}</div>}
          {err && <div className="alert alert--error">{err}</div>}
          <button className="btn btn--primary" type="submit">Change password</button>
        </form>
      </div>
    </AppLayout>
  );
}
