'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { when } from './money';

/* The bell, the Hub's way: a badge with the unread count, and a popover
   under it with the unread items on top, the already-seen ones folded away
   underneath (context, not a to-do list), Mark all read, and Clear for the
   seen ones. Opening an item marks it read and goes where it points; an
   item with nowhere to go (a message from a colleague) just opens in place.
   Polled once a minute; refreshed by a window event when anything changes. */
export default function Bell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [d, setD] = useState({ unread: 0, notifications: [] });
  const load = useCallback(() => {
    fetch('/api/notifications').then((r) => (r.ok ? r.json() : null)).then((x) => { if (x) setD(x); }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('cpd:notifications', load);
    return () => { clearInterval(t); window.removeEventListener('cpd:notifications', load); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function markRead(ids) {
    await fetch('/api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : { all: true }) });
    window.dispatchEvent(new Event('cpd:notifications'));
  }
  async function openItem(n) {
    if (!n.read_at) markRead([n.id]);
    if (n.href) { setOpen(false); router.push(n.href); }
    else setExpanded(expanded === n.id ? null : n.id);
  }
  async function clearRead() {
    await fetch('/api/notifications', { method: 'DELETE' });
    setShowRead(false);
    window.dispatchEvent(new Event('cpd:notifications'));
  }

  const unread = d.notifications.filter((n) => !n.read_at);
  const read = d.notifications.filter((n) => n.read_at);
  const Item = (n) => (
    <button key={n.id} type="button" className={'notif__item' + (n.read_at ? '' : ' notif__item--unread')} onClick={() => openItem(n)}>
      <span className="notif__kind">{n.kind.replace('_', ' ')}</span>
      <span className="notif__title">{n.title}</span>
      {n.body && (expanded === n.id || !n.href) && <span className="notif__body">{n.body}</span>}
      <time className="notif__time">{when(n.created_at)}</time>
    </button>
  );

  return (
    <div className="notif">
      <button type="button" className={'bell' + (d.unread ? ' has' : '')} onClick={() => { setOpen((o) => !o); load(); }} aria-label={d.unread ? d.unread + ' unread notifications' : 'Notifications'} aria-expanded={open} title="Notifications">
        <span aria-hidden="true">&#9993;</span>{d.unread > 0 && <b>{d.unread > 99 ? '99+' : d.unread}</b>}
      </button>
      {open && (
        <>
          <div className="notif__backdrop" onClick={() => setOpen(false)} />
          <div className="notif__panel" role="dialog" aria-label="Notifications">
            <div className="notif__head"><strong>Notifications</strong>{d.unread > 0 && <button type="button" className="notif__markall" onClick={() => markRead(null)}>Mark all read</button>}</div>
            {!d.notifications.length
              ? <p className="notif__empty">Nothing yet.</p>
              : <>
                {unread.length ? <div className="notif__list">{unread.map(Item)}</div> : <p className="notif__empty">You&apos;re all caught up.</p>}
                {read.length > 0 && (
                  <div className="notif__earlier">
                    <button type="button" className="notif__earliertoggle" onClick={() => setShowRead((v) => !v)}>{showRead ? 'Hide' : 'Show'} {read.length} already seen</button>
                    {showRead && <><div className="notif__list">{read.map(Item)}</div><button type="button" className="notif__clear" onClick={clearRead}>Clear these</button></>}
                  </div>
                )}
              </>}
          </div>
        </>
      )}
    </div>
  );
}
