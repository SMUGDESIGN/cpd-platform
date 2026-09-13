'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../../../AppLayout';
import CaseShell from '../../CaseShell';
import { useCase } from '../../useCase';
import { summarise } from '@/lib/scoring';
import { visits, stage8Lock, setVisitItem, setVisitOutcome, setVisitNote, composeSurveillanceEmail, renewalDoc } from '@/lib/stage8';
import { setConditionStatus, condVerifyLabel } from '@/lib/stage6';
import { when } from '../../../money';

/* Stage 8 - surveillance and renewal (framework C4). Two annual visits and
   a renewal, all dated from the accreditation date; each visit checks the
   provider's submissions pack, samples for drift (never re-assesses), verifies
   the conditions that fall to it, and records an outcome. Locked until the
   dates exist. */
function Mail({ mail, setMail }) {
  const [copied, setCopied] = useState('');
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setCopied('Copied.'); } catch { setCopied('Could not copy - select the text.'); } };
  return (
    <div className="mail">
      {mail.alreadyDone && <div className="lock-note show">This review is already recorded complete - only send this if you genuinely need the pack again.</div>}
      <div className="field"><label>To</label><input  value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} /></div>
      <div className="field"><label>Subject</label><input  value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></div>
      <div className="field"><label>Body</label><textarea  rows={14} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></div>
      <div className="act-row"><button className="rfb" onClick={() => copy(mail.body)}>Copy body</button><a className="rfb" href={'mailto:' + encodeURIComponent(mail.to) + '?subject=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.body)}>Open in email client</a><button className="rfb btn-tiny" onClick={() => setMail(null)}>Close</button></div>
      {copied && <p className="purpose">{copied}</p>}
    </div>
  );
}

/* Defined at module level, never inside a render: an inline component is a new
   type every render, React remounts it on each save, and clicks land on
   detached rows (caught in testing - the second click of a run was lost). */
function List({ items, title, onAnswer }) {
  return (
    <>
      <div className="sect">{title}</div>
      <ul className="ck-list">{items.map((it) => <li key={it.id} className={'ck ' + (it.answer || 'unset')}><div className="ck__text"><b>{it.id}</b> — {it.text}{it.reworded && <span className="tag">reworded</span>}</div><div className="yn"><button type="button" className={'yn__b yes' + (it.answer === 'yes' ? ' on' : '')} onClick={() => onAnswer(it.id, 'yes')}>Yes</button><button type="button" className={'yn__b no' + (it.answer === 'no' ? ' on' : '')} onClick={() => onAnswer(it.id, 'no')}>No</button></div></li>)}</ul>
    </>
  );
}

function Visit({ v, doc, update, who, setMail, refinements, setMsg }) {
  const [closing, setClosing] = useState(null);
  const act = (fn) => { const trial = JSON.parse(JSON.stringify(doc)); const res = fn(trial); if (res && res.ok === false) { setMsg(res.reason); return; } setMsg(''); update((d) => fn(d)); };
  return (
    <div className={'panel sv-card ' + v.cls}>
      <div className="stage-head"><h2>{v.name}</h2><span className={'status ' + (v.done ? 'ok' : (v.cls === 'overdue' ? 'bad' : (v.cls === 'duesoon' ? 'warn' : 'idle')))}>{v.pill}</span></div>
      <List items={v.submissions} title="Provider submissions - requested on the anniversary" onAnswer={(id, a) => update((d) => setVisitItem(d, v.key, id, a))} />
      <p><button className="rfb btn-tiny" onClick={() => setMail(composeSurveillanceEmail(doc, refinements, v.key))}>Compose surveillance request email →</button></p>
      <List items={v.drift} title="Assessor drift checks - sample, do not re-assess" onAnswer={(id, a) => update((d) => setVisitItem(d, v.key, id, a))} />
      {v.conditions.length > 0 && (
        <>
          <div className="sect">Conditions to verify at this review</div>
          <ul className="plain">{v.conditions.map((c) => <li key={c.id} className={'cond ' + c.status}><b>{c.text}</b> <span className="muted">{c.refs && c.refs.length ? c.refs.join(', ') + ' · ' : ''}due {condVerifyLabel(c)} · {c.status}{c.closedBy ? ' by ' + c.closedBy : ''}</span>
            {c.status === 'open' && !closing && <span className="act-row"><button className="rfb btn-tiny" onClick={() => setClosing({ id: c.id, status: 'met', note: '' })}>Met</button><button className="rfb btn-tiny" onClick={() => setClosing({ id: c.id, status: 'unmet', note: '' })}>Unmet</button></span>}
            {closing && closing.id === c.id && <span className="act-row"><input  placeholder={closing.status === 'met' ? 'What was seen that shows it is met? (recorded)' : 'What was seen - why is it unmet? (recorded)'} value={closing.note} onChange={(e) => setClosing({ ...closing, note: e.target.value })} /><button className="rfa" onClick={() => { act((d) => setConditionStatus(d, c.id, closing.status, who, closing.note)); setClosing(null); }}>Record {closing.status}</button><button className="rfb btn-tiny" onClick={() => setClosing(null)}>Cancel</button></span>}
          </li>)}</ul>
        </>
      )}
      <div className="sv-outcome"><b>Review outcome:</b> <span className="yn">{[['satisfactory', 'Satisfactory', 'yes'], ['conditions', 'Conditions', 'warn'], ['escalate', 'Escalate', 'no']].map(([val, label, cls]) => <button key={val} type="button" className={'yn__b ' + cls + (v.outcome === val ? ' on' : '')} onClick={() => update((d) => setVisitOutcome(d, v.key, val))}>{label}</button>)}</span>
        {v.outcome === 'conditions' && <span className="warnnote">Named actions with deadlines - add them to the conditions register (Stage 6); they fall to the next review.</span>}
        {v.outcome === 'escalate' && <span className="bad">D4 sanctions route: conditions → suspension (mark use ceases). Record the grounds below.</span>}
      </div>
      <div className="sect">Surveillance record</div>
      <textarea  rows={3} value={v.note} onChange={(e) => update((d) => setVisitNote(d, v.key, e.target.value))} placeholder="What was sampled, what was found, conditions set and their deadlines… (the Learner feedback page copies an SV-09 note for you)" />
    </div>
  );
}

export default function Stage8() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { row, doc, refinements, err, saveState, failed, update, reload } = useCase(id, summarise);
  const [mail, setMail] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (err) return <AppLayout><div className="lock-note show">{err}</div></AppLayout>;
  if (!doc) return <AppLayout><p className="purpose">Loading…</p></AppLayout>;
  const sum = row.summary || summarise(doc, refinements);
  const lock = stage8Lock(doc);
  const vs = visits(doc, refinements);
  const who = ((doc.lead || {}).name || '').trim() || ((doc.moderator || {}).name || '').trim() || session?.user?.name || '';
  const startRenewal = async () => {
    if (!confirm('Duplicate this case as a renewal application? The facts carry over; every judgement starts blank; the new reference is ' + ((doc.caseInfo || {}).ref || '') + '-R.')) return;
    setBusy(true); setMsg('');
    const r = await fetch('/api/entries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: renewalDoc(doc), copyOrgFrom: id }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || 'Could not create the renewal case.'); return; }
    router.push('/cases/' + encodeURIComponent(j.id) + '/stage-1');
  };
  return (
    <AppLayout>
      <CaseShell id={id} doc={doc} summary={sum} refinements={refinements} saveState={saveState} failed={failed}>
        {failed && <div className="alert alert-bad">{saveState} <button className="btn btn-tiny" onClick={reload}>Reload</button></div>}
        <section className="stage active">
        <div className="panel">
          <div className="stage-head"><h2>Stage 8 — Surveillance &amp; renewal</h2>{vs && vs.info && <span className={'status ' + (vs.info.flag === 'overdue' ? 'bad' : (vs.info.flag === 'due' ? 'warn' : 'ok'))}>{vs.info.label}</span>}</div>
          <p className="purpose">The framework's C4 cycle: two annual surveillance visits and a renewal, all dated from the accreditation date — nothing is scheduled by hand, so a due review can never silently not exist. A visit samples the provider's pack and the current materials against the accredited version; it does not re-assess, and never the subject matter (A5).</p>
          {lock && <div className="lock-note show">{lock}</div>}
          {msg && <div className="lock-note show">{msg}</div>}
        </div>
        {vs && (
          <>
            <p className="purpose">Accredited {vs.sv1 && when(vs.acc).slice(0, 12)} · reviews fall on the anniversaries · term ends {vs.renewal.expText}.</p>
            <div className="grid2">
              <Visit v={vs.sv1} doc={doc} update={update} who={who} setMail={setMail} refinements={refinements} setMsg={setMsg} />
              <Visit v={vs.sv2} doc={doc} update={update} who={who} setMail={setMail} refinements={refinements} setMsg={setMsg} />
            </div>
            {mail && <div className="panel"><h2>Surveillance request email</h2><Mail mail={mail} setMail={setMail} /></div>}
            <div className={'panel sv-renewal' + (vs.renewal.expired ? ' overdue' : (vs.renewal.soon ? ' duesoon' : ''))}>
              <div className="stage-head"><h2>Renewal — term expires {vs.renewal.expText}</h2><span className={'status ' + (vs.renewal.expired ? 'bad' : (vs.renewal.soon ? 'warn' : 'ok'))}>{vs.renewal.expired ? 'EXPIRED ' + Math.abs(vs.renewal.days) + ' day' + (Math.abs(vs.renewal.days) === 1 ? '' : 's') + ' ago' : vs.renewal.days + ' day' + (vs.renewal.days === 1 ? '' : 's') + ' left'}</span></div>
              <p>Renewal is a full re-assessment at the current framework version — never an invoice (Part F: no auto-renewal traps; renewal is an explicit opt-in by the provider). Contact the provider around three months before expiry so a willing renewal never lapses by accident. The daily checks notify both sides at 90 days.</p>
              <button className="rfa" disabled={busy} onClick={startRenewal}>Duplicate as renewal application →</button>
            </div>
          </>
        )}
        </section>
      </CaseShell>
    </AppLayout>
  );
}
