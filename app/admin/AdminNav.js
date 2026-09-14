'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* The admin area's own nav, down the left the way the Hubs do it: overview,
   organisations, the team, billing - each with the count of what is waiting
   there. Sticky under the top bar; on a narrow screen it becomes a row
   across the top of the page. */
const ITEMS = [
  { href: '/admin', label: 'Overview', exact: true, count: (c) => c.unseen, title: 'Unread from providers' },
  { href: '/admin/organisations', label: 'Organisations', count: (c) => c.pending, title: 'Sign-ups awaiting vetting', warn: true },
  { href: '/admin/users', label: 'The CPD Team' },
  { href: '/admin/billing', label: 'Billing due', count: (c) => c.overdue, title: 'Invoices overdue', warn: true },
  { href: '/dashboard', label: 'Intake queue', count: (c) => c.intake, title: 'Cases waiting at Stage 1', anchor: '/admin#intake' },
];
export default function AdminNav() {
  const path = usePathname() || '';
  const [c, setC] = useState({});
  useEffect(() => {
    const load = () => fetch('/api/admin/nav').then((r) => (r.ok ? r.json() : null)).then((x) => { if (x) setC(x); }).catch(() => {});
    load(); const t = setInterval(load, 60000); window.addEventListener('cpd:notifications', load);
    return () => { clearInterval(t); window.removeEventListener('cpd:notifications', load); };
  }, []);
  const on = (i) => (i.exact ? path === i.href : path.startsWith(i.href));
  return (
    <aside className="sidebar" aria-label="Admin">
      <nav className="sidebar__nav">
        {ITEMS.map((i) => {
          const n = i.count ? i.count(c) : 0;
          return (
            <Link key={i.href} href={i.anchor || i.href} className={'sidebar__link' + (on(i) ? ' sidebar__link--active' : '')}>
              <span className="sidebar__label">{i.label}</span>
              {n > 0 && <span className={'sidebar__count' + (i.warn ? ' sidebar__count--warn' : '')} title={i.title}>{n > 99 ? '99+' : n}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
