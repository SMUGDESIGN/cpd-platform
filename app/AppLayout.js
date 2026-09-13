'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Bell from './Bell';
import ViewAs from './ViewAs';

/* Two houses, one shell. Staff see the caseload and the tool; providers see
   their portal. The nav is decided by the role on the session, and a person
   on the wrong side of the house is sent to their own front door - the API
   would refuse them anyway (lib/session.js), this just saves them the 403. */
const STAFF_NAV = [
  { href: '/dashboard', label: 'Caseload' },
  { href: '/tool', label: 'Assessment tool' },
  { href: '/learner-feedback', label: 'Learner feedback' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/admin', label: 'Admin', admin: true },
  { href: '/account', label: 'Account' },
];
const PROVIDER_NAV = [
  { href: '/portal', label: 'Overview', exact: true },
  { href: '/portal/apply', label: 'Apply' },
  { href: '/portal/billing', label: 'Billing' },
  { href: '/portal/feedback', label: 'Feedback' },
  { href: '/portal/account', label: 'Account' },
];

function useSignOutIfDead() {
  const { data: session, status } = useSession();
  const dead = status === 'authenticated' && session?.user?.active === false;
  useEffect(() => { if (dead) signOut({ callbackUrl: '/login' }); }, [dead]);
  return dead;
}

export default function AppLayout({ children, wide }) {
  const { data: session, status } = useSession();
  const path = usePathname() || '';
  const router = useRouter();
  const dead = useSignOutIfDead();
  const role = session?.user?.role;
  const provider = role === 'provider';

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (provider && !path.startsWith('/portal') && !path.startsWith('/notifications')) router.replace('/portal');
    if (!provider && role && path.startsWith('/portal')) router.replace('/dashboard');
    if (role && role !== 'superadmin' && role !== 'support' && path.startsWith('/admin')) router.replace('/dashboard');
  }, [status, provider, role, path, router]);

  if (dead) {
    return <div className="app-shell"><main className="container"><p className="muted">Your session has ended - taking you back to sign in…</p></main></div>;
  }
  const adminRole = role === 'superadmin' || role === 'support';
  const nav = (provider ? PROVIDER_NAV : STAFF_NAV).filter((n) => !n.admin || adminRole);
  const on = (n) => (n.exact ? path === n.href : path.startsWith(n.href));
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Link href={provider ? '/portal' : '/dashboard'} className="brand-lockup brand-lockup--bar">
          <span className="brand-mark">CPD</span>
          <span className="brand-words">Accreditation Scheme <small>{provider ? 'Provider portal' : (role === 'superadmin' ? 'Super admin' : 'Assessor platform')}</small></span>
        </Link>
        <nav className="topnav" aria-label="Main">
          {nav.map((n) => <Link key={n.href} href={n.href} className={on(n) ? 'on' : ''}>{n.label}</Link>)}
        </nav>
        <div className="topbar__user">
          <Bell />
          <span>{session?.user?.name}{session?.user?.orgName ? <small className="topbar__org"> · {session.user.orgName}</small> : null}</span>
          <button type="button" className="btn btn--ghost" onClick={() => signOut({ callbackUrl: '/login' })}>Sign out</button>
        </div>
      </header>
      <ViewAs />
      <main className={wide ? 'container container--wide' : 'container'} id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
