'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '../AppLayout';
import { when } from '../money';

export default function Notifications() {
  const [d, setD] = useState(null);
  const router = useRouter();
  const load = useCallback(() => fetch('/api/notifications').then((r) => r.json()).then(setD), []);
  useEffect(() => { load(); }, [load]);
  async function open(n) {
    if (!n.read_at) await fetch('/api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [n.id] }) });
    window.dispatchEvent(new Event('cpd:notifications'));
    if (n.href) router.push(n.href); else load();
  }
  async function allRead() {
    await fetch('/api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ all: true }) });
    window.dispatchEvent(new Event('cpd:notifications')); load();
  }
  return (
    <AppLayout>
      <div className="page-head"><h1>Notifications</h1>{d && d.unread > 0 && <button className="btn" onClick={allRead}>Mark all read ({d.unread})</button>}</div>
      <div className="panel"><p className="muted">Everything the platform has told you, newest first. Email delivery is not switched on yet - what you see here is the record.</p></div>
      {d && !d.notifications.length && <div className="panel"><p className="muted">Nothing yet.</p></div>}
      {d && d.notifications.length > 0 && (
        <div className="panel panel--table">
          <ul className="notes">
            {d.notifications.map((n) => (
              <li key={n.id} className={n.read_at ? 'read' : 'unread'}>
                <button type="button" onClick={() => open(n)}>
                  <span className={'kind kind-' + n.kind}>{n.kind.replace('_', ' ')}</span>
                  <span className="ntitle">{n.title}</span>
                  {n.body && <span className="nbody">{n.body}</span>}
                  <span className="nwhen">{when(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppLayout>
  );
}
