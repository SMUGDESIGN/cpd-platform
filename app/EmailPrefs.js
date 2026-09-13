'use client';
import { useEffect, useState } from 'react';

/* The one control both account pages share: how this person is emailed. */
export default function EmailPrefs() {
  const [pref, setPref] = useState(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/account/prefs').then((r) => r.json()).then((d) => { setPref(d.emailNotifications); setEmail(d.email); }); }, []);
  async function save(v) {
    setPref(v); setMsg('');
    const r = await fetch('/api/account/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emailNotifications: v }) });
    setMsg(r.ok ? 'Saved.' : 'Could not save.');
  }
  if (pref === null) return null;
  const opts = [
    ['immediate', 'Straight away for anything urgent, the rest in a daily summary'],
    ['daily', 'One daily summary of everything'],
    ['off', 'No email - I will check the platform'],
  ];
  return (
    <div className="panel">
      <h2>Email</h2>
      <p className="muted">Notifications always appear under the bell. Choose whether they also reach {email}:</p>
      {opts.map(([v, label]) => <label key={v} className="check"><input type="radio" name="emailpref" checked={pref === v} onChange={() => save(v)} /> {label}</label>)}
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
