'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { STAGES, FREE_TEXT } from '@/lib/feedback';

/* The public learner feedback form - the website's five-step form rebuilt
   here against the platform: the course is checked on the real register,
   the response is stored server-side, de-duplicated per completion. Month
   pills, not a date picker (house style). Deep link: ?course=ACT-… */
function monthPills() {
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date(); const out = [];
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: mo[d.getMonth()] + ' ' + d.getFullYear() }); }
  return out;
}

function Form() {
  const params = useSearchParams();
  const [step, setStep] = useState(1);
  const [ref, setRef] = useState(params.get('course') || '');
  const [course, setCourse] = useState(null);
  const [checkMsg, setCheckMsg] = useState('');
  const [serial, setSerial] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mayContact, setMayContact] = useState(false);
  const [answers, setAnswers] = useState({});
  const [comments, setComments] = useState({});
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const pills = useMemo(monthPills, []);
  const total = 5;

  async function check(r) {
    const v = String(r || ref).trim().toUpperCase();
    setCourse(null); setCheckMsg('');
    if (!v) return;
    const res = await fetch('/api/feedback/check?ref=' + encodeURIComponent(v));
    if (!res.ok) { setCheckMsg('No record found for ' + v + '. Check the number on your certificate or the course badge - and if the number genuinely appears on a certificate, please report it to us: misuse of the mark is sanctionable.'); return; }
    const d = await res.json(); setCourse(d); setRef(v);
  }
  useEffect(() => { if (params.get('course')) check(params.get('course')); /* eslint-disable-next-line */ }, []);

  function next(n) {
    setErr('');
    if (step === 1) {
      if (!course) { setErr('Please check your course accreditation number first - the Check button confirms which course you took.'); return; }
      if (!completedOn) { setErr('Please tell us which month you completed the course.'); return; }
    } else if (step >= 2 && step <= 4) {
      const qs = STAGES[step - 2].questions;
      const missing = qs.filter((q) => !answers[q.key]).length;
      if (missing) { setErr('Please answer every question on this page (' + missing + ' unanswered).'); return; }
    }
    setStep(n); window.scrollTo(0, 0);
  }
  async function submit(e) {
    e.preventDefault(); setErr('');
    const res = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref, certSerial: serial, completedOn, name, email, mayContact, answers, comments, website: '' }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || 'Could not save your feedback. Please try again.'); return; }
    setDone(d); setStep(6); window.scrollTo(0, 0);
  }
  const Stage = ({ i }) => {
    const s = STAGES[i];
    return (
      <>
        <h2>{s.title}</h2>{s.lede && <p className="lede">{s.lede}</p>}
        {s.questions.map((q) => (
          <div className="fq" key={q.key}>
            <p className="fq__t">{q.text}</p>{q.sub && <p className="muted">{q.sub}</p>}
            <div className="fq__opts">{q.options.map((o) => <label key={o} className={answers[q.key] === o ? 'on' : ''}><input type="radio" name={q.key} checked={answers[q.key] === o} onChange={() => setAnswers({ ...answers, [q.key]: o })} /><span>{(q.labels || {})[o] || o}</span></label>)}</div>
            {q.show && q.show[answers[q.key]] && <input className="input" placeholder={q.placeholder} value={comments[q.show[answers[q.key]]] || ''} onChange={(e) => setComments({ ...comments, [q.show[answers[q.key]]]: e.target.value })} />}
          </div>
        ))}
      </>
    );
  };
  return (
    <div className="public-wrap">
      <div className="public-card public-card--wide">
        <div className="brand-lockup"><span className="brand-mark">CPD</span><span className="brand-words">Accreditation Scheme<br /><small>Learner feedback</small></span></div>
        {step <= total && <div className="steps">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n < step ? 'done' : (n === step ? 'now' : '')} />)}<em>Step {step} of {total}</em></div>}
        <form onSubmit={submit} noValidate>
          {step === 1 && (
            <>
              <h2>First, your course</h2>
              <p className="lede">The accreditation number is on your certificate and on the course's badge. It proves you took an accredited course - we never publish or share who said what.</p>
              <div className="fq"><p className="fq__t">Course accreditation number</p>
                <div className="act-row"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } }} placeholder="e.g. ACT-2026-0147" autoComplete="off" /><button type="button" className="btn" onClick={() => check()}>Check</button></div>
                {course && <div className="alert alert--ok"><b>✓ {course.activity}</b> - {course.provider}<br /><span className="muted">{course.hours ? course.hours + ' CPD hours · ' : ''}status: {course.status}{course.status === 'Suspended' ? ' - feedback is still welcome: your completion predates the suspension and feeds our review.' : ''}</span></div>}
                {checkMsg && <div className="alert alert--error">{checkMsg}</div>}
              </div>
              <div className="fq"><p className="fq__t">Certificate number / serial <span className="muted">(if your certificate shows one - helps us match your completion)</span></p><input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. 2026-08-00341" autoComplete="off" /></div>
              <div className="fq"><p className="fq__t">When did you complete the course?</p><div className="pills">{pills.map((p) => <button type="button" key={p.key} className={completedOn === p.key ? 'on' : ''} onClick={() => setCompletedOn(p.key)}>{p.label}</button>)}</div></div>
              <div className="fq"><p className="fq__t">Your name <span className="muted">(as it appears on your certificate)</span></p><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
              <div className="fq"><p className="fq__t">Email <span className="muted">(optional - only used if we need to confirm your completion)</span></p><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <label className="check"><input type="checkbox" checked={mayContact} onChange={(e) => setMayContact(e.target.checked)} /> You may contact me about this feedback if something needs clarifying.</label></div>
              <p className="privacy"><b>What happens to this:</b> your ratings are shared with the provider in aggregate, and written comments are shared anonymised. Your name and email are never given to the provider - they exist only so we can confirm the feedback came from a real completion. Feedback feeds the course's annual quality review.</p>
            </>
          )}
          {step >= 2 && step <= 4 && <Stage i={step - 2} />}
          {step === 5 && (
            <>
              <h2>In your words</h2><p className="lede">All optional - but written comments are what providers act on fastest. Shared anonymised.</p>
              {FREE_TEXT.map((f) => <div className="fq" key={f.key}><p className="fq__t">{f.text}</p><textarea className="input" rows={3} value={comments[f.key] || ''} onChange={(e) => setComments({ ...comments, [f.key]: e.target.value })} /></div>)}
              <p className="privacy">Think something in the course is factually wrong, or want a formal response? That is a complaint, which follows its own published procedure - this form is feedback, and the provider will not know who wrote it.</p>
            </>
          )}
          {step === 6 && done && (
            <>
              <h2>Thank you - it counts.</h2>
              <p className="lede">Your feedback was recorded against <b>{done.activity} ({done.ref})</b>. Here is exactly what happens to it:</p>
              <ul><li>The provider sees your ratings in aggregate and your comments anonymised - most act quickly on what learners tell them.</li><li>It joins the course's year-round feedback picture: strengths, weaknesses and trends.</li><li>At the course's annual quality review, our assessor checks whether negative feedback and trends were addressed. If they were not, we set named actions with deadlines - unresolved, they lead to suspension.</li></ul>
              <p className="lede">A scheme that never listens to learners is a logo shop. Thanks for keeping this one honest.</p>
            </>
          )}
          {err && <div className="alert alert--error">{err}</div>}
          {step <= total && (
            <div className="act-row" style={{ justifyContent: 'space-between' }}>
              <span>{step > 1 && <button type="button" className="btn" onClick={() => { setErr(''); setStep(step - 1); }}>Back</button>}</span>
              {step < total ? <button type="button" className="btn btn--primary" onClick={() => next(step + 1)}>Next</button> : <button type="submit" className="btn btn--primary">Submit feedback</button>}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return <Suspense fallback={null}><Form /></Suspense>;
}
