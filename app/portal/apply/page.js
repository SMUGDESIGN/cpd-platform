'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '../../AppLayout';

/* The application: the facts the case is set up from. Nothing here is a
   judgement - the coordinator's Stage 1 check and the assessment follow. */
export default function Apply() {
  const r = useRouter();
  const [f, setF] = useState({ activity: '', hours: '', el: false, lo: false, f2f: false, assess: true, examBank: false, cert: true, description: '', audience: '', contactEmail: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const res = await fetch('/api/portal/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || 'Could not submit.'); return; }
    r.push('/portal/cases/' + encodeURIComponent(d.id) + '?submitted=' + encodeURIComponent(d.ref));
  }
  return (
    <AppLayout>
      <h1>Apply for accreditation</h1>
      <div className="panel">
        <p>Tell us about the activity. We will confirm your reference straight away, check the submission is complete, and ask for anything missing before assessment begins. The full framework is already in your hands - nothing is judged that you have not seen.</p>
        <form onSubmit={submit} className="form-wide">
          <div className="field"><label htmlFor="activity">Activity title</label><input id="activity" className="input" value={f.activity} onChange={set('activity')} required /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="hours">Stated CPD hours</label><input id="hours" className="input" inputMode="decimal" value={f.hours} onChange={set('hours')} required placeholder="e.g. 6" /></div>
            <div className="field"><label htmlFor="contactEmail">Contact email for this application</label><input id="contactEmail" className="input" type="email" value={f.contactEmail} onChange={set('contactEmail')} placeholder="Defaults to your organisation's contact" /></div>
          </div>
          <fieldset className="field"><legend>How it is delivered (tick all that apply)</legend>
            <label className="check"><input type="checkbox" checked={f.el} onChange={set('el')} /> E-learning (self-paced)</label>
            <label className="check"><input type="checkbox" checked={f.lo} onChange={set('lo')} /> Live online</label>
            <label className="check"><input type="checkbox" checked={f.f2f} onChange={set('f2f')} /> Face to face</label>
          </fieldset>
          <fieldset className="field"><legend>Assessment and certificates</legend>
            <label className="check"><input type="checkbox" checked={f.assess} onChange={set('assess')} /> Learners are assessed (completion depends on their answers)</label>
            <label className="check"><input type="checkbox" checked={f.examBank} onChange={set('examBank')} /> There is an exam or question bank</label>
            <label className="check"><input type="checkbox" checked={f.cert} onChange={set('cert')} /> Learners receive a certificate</label>
          </fieldset>
          <div className="field"><label htmlFor="audience">Who it is for</label><input id="audience" className="input" value={f.audience} onChange={set('audience')} placeholder="Role, sector, prior knowledge" /></div>
          <div className="field"><label htmlFor="description">What it covers and what a learner will be able to do afterwards</label><textarea id="description" className="input" rows={5} value={f.description} onChange={set('description')} /></div>
          <div className="field"><label htmlFor="notes">Anything else we should know</label><textarea id="notes" className="input" rows={3} value={f.notes} onChange={set('notes')} /></div>
          {err && <div className="alert alert--error">{err}</div>}
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
        </form>
      </div>
    </AppLayout>
  );
}
