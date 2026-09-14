'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/* The link in the confirmation email lands here. A button, not an
   automatic call: the confirmation must be a person's click. */
function Confirm() {
  const params = useSearchParams();
  const t = params.get('t') || '';
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await fetch('/api/signup/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t }) });
    const d = await r.json().catch(() => ({}));
    setOut(r.ok ? { ok: true, name: d.name } : { ok: false, error: d.error || 'Could not confirm.' });
    setBusy(false);
  }
  return (
    <div className="public-wrap">
      <div className="public-card">
        <div className="brand-lockup"><img className="brand-logo brand-logo--mono" src="/images/cpd-approved-course-mono.png" alt="CPD Accreditation Scheme" /></div>
        <h1>Confirm your email</h1>
        {!out && (t
          ? <><p>Press the button to confirm that this address is yours. Our support team then checks the registration and sends your portal login.</p><button className="btn btn--primary" onClick={go} disabled={busy}>{busy ? 'Confirming…' : 'Confirm my email'}</button></>
          : <div className="alert alert--error">This link is missing its code. Open the link from the email again, or sign up again from the website.</div>)}
        {out && out.ok && <div className="alert alert--ok">Thank you - <b>{out.name}</b> is confirmed. Nothing more to do: you will hear from us once the registration has been checked.</div>}
        {out && !out.ok && <div className="alert alert--error">{out.error}</div>}
      </div>
    </div>
  );
}
export default function VerifyPage() { return <Suspense fallback={null}><Confirm /></Suspense>; }
