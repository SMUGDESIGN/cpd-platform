'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/* The unread count in the top bar. Polled once a minute and refreshed when
   the notifications page says something was read (a window event, so the two
   never disagree for a minute). */
export default function Bell() {
  const [n, setN] = useState(0);
  const refresh = useCallback(() => {
    fetch('/api/notifications?count=1').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setN(d.unread); }).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    window.addEventListener('cpd:notifications', refresh);
    return () => { clearInterval(t); window.removeEventListener('cpd:notifications', refresh); };
  }, [refresh]);
  return (
    <Link href="/notifications" className={'bell' + (n ? ' has' : '')} aria-label={n ? n + ' unread notifications' : 'Notifications'} title="Notifications">
      <span aria-hidden="true">&#9993;</span>{n > 0 && <b>{n > 99 ? '99+' : n}</b>}
    </Link>
  );
}
