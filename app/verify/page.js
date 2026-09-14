'use client';
import { useState } from 'react';

/* Public register lookup. The static website's register page will point its
   verify box here (or at /api/verify) once the platform is live. */
export default function Verify() {
  const [ref, setRef] = useState('');
  const [out, setOut] = useState(null);
  async function check(e) {
    e.preventDefault();
    const r = await fetch('/api/verify/' + encodeURIComponent(ref.trim()));
    setOut(r.ok ? (await r.json()).record : { missing: true });
  }
  return (
    <div className="public-wrap">
      <div className="public-card">
        <div className="brand-lockup"><img className="brand-logo brand-logo--mono" src="/images/cpd-approved-course-mono.png" alt="CPD Accreditation Scheme" /><span className="brand-words"><small>Register</small></span></div>
        <h1>Verify an accreditation</h1>
        <p>Enter the number from a certificate or a course badge.</p>
        <form onSubmit={check} className="act-row">
          <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. ACT-2026-0147" autoComplete="off" />
          <button className="btn btn--primary" type="submit">Check</button>
        </form>
        {out && out.missing && <div className="alert alert--error">No record found. Check the number - and if it genuinely appears on a certificate, please report it to us: misuse of the mark is sanctionable.</div>}
        {out && !out.missing && (
          <div className={'alert ' + (out.status.startsWith('Accredited') ? 'alert--ok' : 'alert--error')}>
            <p><b>{out.verify}</b></p>
            <p className="muted">{out.activity} · {out.provider}{out.hours ? ' · ' + out.hours + ' CPD hours' : ''}{out.mode ? ' · ' + out.mode : ''}{out.accredited ? ' · accredited ' + out.accredited : ''}{out.expires ? ' · expires ' + out.expires : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
