'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const NAV = [
  { href: '/dashboard', label: 'Caseload' },
  { href: '/tool', label: 'Assessment tool' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/account', label: 'Account' },
];

/* A token for a deactivated or deleted account still passes the middleware;
   the session resolves `active:false` and we sign out here rather than render
   a hollow app that 401s on every fetch. */
function useSignOutIfDead() {
  const { data: session, status } = useSession();
  const dead = status === 'authenticated' && session?.user?.active === false;
  useEffect(() => { if (dead) signOut({ callbackUrl: '/login' }); }, [dead]);
  return dead;
}

export default function AppLayout({ children, wide }) {
  const { data: session } = useSession();
  const path = usePathname();
  const dead = useSignOutIfDead();
  if (dead) {
    return <div className="app-shell"><main className="container"><p className="muted">Your session has ended - taking you back to sign in…</p></main></div>;
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Link href="/dashboard" className="brand-lockup brand-lockup--bar">
          <span className="brand-mark">CPD</span>
          <span className="brand-words">Accreditation Scheme <small>Assessor platform</small></span>
        </Link>
        <nav className="topnav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path?.startsWith(n.href) ? 'on' : ''}>{n.label}</Link>
          ))}
        </nav>
        <div className="topbar__user">
          <span>{session?.user?.name}</span>
          <button type="button" className="btn btn--ghost" onClick={() => signOut({ callbackUrl: '/login' })}>Sign out</button>
        </div>
      </header>
      <main className={wide ? 'container container--wide' : 'container'} id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
