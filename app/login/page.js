'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await signIn('credentials', { redirect: false, email, password });
    setBusy(false);
    if (res?.error) { setError('Invalid email or password.'); return; }
    /* Back to the page that sent us here - same-origin paths only, so a
       crafted link cannot bounce a fresh sign-in off to another site. */
    const back = params.get('callbackUrl') || '';
    router.push(back.startsWith('/') && !back.startsWith('//') ? back : '/dashboard');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-lockup"><img className="brand-logo brand-logo--mono" src="/images/cpd-approved-course-mono.png" alt="CPD Accreditation Scheme" /></div>
        <h1>Sign in</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <div className="alert alert--error">{error}</div>}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted">Forgotten your password? Support can reset it for you.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
