'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await signIn('credentials', { redirect: false, email, password });
    setBusy(false);
    if (res?.error) setError('Invalid email or password.');
    else router.push('/dashboard');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-lockup">
          <span className="brand-mark">CPD</span>
          <span className="brand-words">Accreditation Scheme<br /><small>Assessor platform</small></span>
        </div>
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
        <p className="muted">Forgotten your password? An admin can reset it from the command line for now.</p>
      </div>
    </div>
  );
}
