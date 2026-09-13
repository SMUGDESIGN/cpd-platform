'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../../../AppLayout';
import CaseShell from '../../CaseShell';
import { useCase } from '../../useCase';
import { NoticeDrawer } from '../../IndicatorRows';
import { summarise } from '@/lib/scoring';
import { stage1Status } from '@/lib/stage1';
import { saveNotice, deadlineFrom } from '@/lib/stage2';
import { failingRows, jobs, overview, commsLog, composeProviderEmail, logRemediation, removeRemediationEntry, issueDeferral, markResubmitted, markRechecked, extendDeferral, addCondition, setConditionStatus, removeCondition, condVerifyLabel, condSourceLabel, stage6Lock, deferralInfo, conditionsInfo, formatDateLong, DEFERRAL_DAYS } from '@/lib/stage6';
import { when } from '../../../money';

/* Stage 6 - decision and remediation loop. The fix list is generated live
   from the failing gates, grouped into jobs by the cause on each notice - one
   job, one notice. The single deferral runs as a record with a clock; the
   conditions register says what "accredited with conditions" means; the
   remediation log is the dated narrative. Locked until moderation passes. */
function Mail({ mail, setMail, extra }) {
  const [copied, setCopied] = useState('');
  const copy = async (t, w) => { try { await navigator.clipboard.writeText(t); setCopied(w + ' copied.'); } catch { setCopied('Could not copy - select the text.'); } };
  return (
    <div className="mail">
      <div className="field"><label>To</label><input className="input" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} /></div>
      <div className="field"><label>Subject</label><input className="input" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></div>
      <div className="field"><label>Body</label><textarea className="input" rows={14} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></div>
      <div className="act-row">
        <button className="btn" onClick={() => copy(mail.body, 'Body')}>Copy body</button>
        <a className="btn" href={'mailto:' + encodeURIComponent(mail.to) + '?subject=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.body)}>Open in email client</a>
        {extra}
        <button className="btn btn--tiny" onClick={() => setMail(null)}>Close</button>
      </div>
      {copied && <p className="muted">{copied}</p>}
      <p className="muted">This composes text only - nothing sends from here. Review it, then send from your own email client.</p>
    </div>
  );
}

export default function Stage6() {
  const { id } = useParams();
  const { data: session } = useSession();
  const { row, doc, refinements, err, saveState, failed, update, reload } = useCase(id, summarise);
  const [notice, setNotice] = useState(null);
  const [mail, setMail] = useState(null);
  const [msg, setMsg] = useState('');
  const [ext, setExt] = useState(null); // {days, reason}
  const [cond, setCond] = useState({ text: '', refs: '', verifyAt: 'date', dueText: '' });
  const [closing, setClosing] = useState(null); // {id, status, note}
  const [rlog, setRlog] = useState('');
  if (err) return <AppLayout><div className="alert alert--error">{err}</div></AppLayout>;
  if (!doc) return <AppLayout><p className="muted">Loading…</p></AppLayout>;

  const sum = row.summary || summarise(doc, refinements);
  const s1 = stage1Status(doc, refinements);
  const lock = stage6Lock(sum, s1);
  const js = jobs(doc, refinements);
  const rows = failingRows(doc, refinements);
  const ov = overview(doc, refinements);
  const comms = commsLog(doc, refinements);
  const di = deferralInfo(doc);
  const ci = conditionsInfo(doc);
  const me = session?.user?.name || '';
  const who = ((doc.lead || {}).name || '').trim() || me;
  const act = (fn) => { const trial = JSON.parse(JSON.stringify(doc)); const res = fn(trial); if (!res.ok) { setMsg(res.reason); return null; } setMsg(''); update((d) => fn(d)); return res; };
  const partialIds = ov.partial.map((p) => p.id);

  return (
    <AppLayout>
      <CaseShell id={id} doc={doc} summary={sum} saveState={saveState} failed={failed}>
        {failed && <div className="alert alert--error">{saveState} <button className="btn btn--tiny" onClick={reload}>Reload</button></div>}
        <div className="panel">
          <div className="page-head"><h2>Stage 6 — Decision &amp; remediation loop</h2><span className="muted">One deferral · {DEFERRAL_DAYS} days · then final</span></div>
          <p className="muted">The fix list below is generated live from the failing mandatory gates, grouped into jobs by the cause you set on each notice — one job, one notice, however many gates it clears. After the provider resubmits, re-score the affected indicators in Stages 2–4 (plus a regression sample) — the decision recomputes automatically. There is no second deferral.</p>
          {lock && <div className="alert alert--error">{lock}</div>}
          {msg && <div className="alert alert--error">{msg}</div>}
        </div>

        <div className="panel">
          <h2>Fix list — failing mandatory gates, by job (live)</h2>
          {!js.length && <p className="muted">No mandatory gates failing.</p>}
          {js.map((job, ji) => {
            const all = job.contacted === job.rows.length, none = job.contacted === 0;
            return (
              <div key={ji} className="fjob">
                <div className="fjob__head"><b>Job {ji + 1}</b> · <span className={job.cause ? '' : 'muted'}>{job.cause || 'Cause not set - name what clears it on the notice, and gates that share it become one job'}</span> · {job.rows.length} gate{job.rows.length === 1 ? '' : 's'}
                  {all ? <span className="muted"> — provider contacted{job.due ? ', respond by ' + job.due : ''}</span> : (none ? <span className="bad"> — not yet contacted</span> : <span className="bad"> — {job.rows.length - job.contacted} of {job.rows.length} gates not yet contacted</span>)}
                  <button className="btn btn--tiny" onClick={() => setNotice(job.rows[0].id)}>notice for this job</button></div>
                {job.rows.map((r) => <div key={r.id} className="fitem"><span className="muted">{r.id}</span> {r.text}{r.finding ? <em> — {r.finding}</em> : null}{!(r.notice && r.notice.contactedAt) && <span className="bad"> — no notice</span>} <button className="btn btn--tiny" onClick={() => setNotice(r.id)}>notice</button></div>)}
              </div>
            );
          })}
          {js.length > 0 && !mail && <p><button className="btn" onClick={() => { const m = composeProviderEmail(doc, refinements); setMail(m); setMsg(m.missingNotice ? m.missingNotice + ' of ' + m.nj + ' item(s) have no deadline logged - open that job\'s notice first if you want a firm date carried through.' : ''); }}>Compose provider notice email — all outstanding items</button></p>}
          {mail && <Mail mail={mail} setMail={setMail} />}
        </div>

        <div className={'panel deferral ' + (!di ? (rows.length ? 'ready' : 'none') : (di.expired ? 'expired' : (di.rechecked ? (rows.length ? 'refuse' : 'done') : 'open')))}>
          <h2>The single deferral — the clock (live, from the record)</h2>
          {!di && !rows.length && <p className="muted">No deferral on this entry. The action appears here when a mandatory gate is failing after moderation.</p>}
          {!di && rows.length > 0 && (
            <>
              <p>{rows.length} gate{rows.length === 1 ? '' : 's'} failing: <b>{rows.map((r) => r.id).join(', ')}</b>. Issuing the deferral starts the one {DEFERRAL_DAYS}-day fix window from today and records who issued it. There is no second deferral.</p>
              <div className="act-row"><label>Issued by</label><input className="input" value={who} onChange={(e) => update((d) => { d.lead = d.lead || {}; d.lead.name = e.target.value; })} style={{ maxWidth: 260 }} /><button className="btn btn--primary" disabled={!!lock} onClick={() => { if (confirm('Issue the single deferral for ' + rows.map((r) => r.id).join(', ') + '?\n\nFix window: ' + DEFERRAL_DAYS + ' days. There is no second deferral - after this window the outcome is refusal unless the window is extended with a written reason.')) act((d) => issueDeferral(d, refinements, who)); }}>Issue the single deferral</button></div>
            </>
          )}
          {di && (
            <>
              <p><b>Deferral issued</b> {formatDateLong(new Date(di.rec.issuedAt))} by <b>{di.rec.by}</b> for <b>{(di.rec.items || []).join(', ')}</b> · fix window ends <b>{formatDateLong(di.due)}</b>{di.resubmitted ? '' : (di.expired ? <b> · expired {-di.daysLeft} day{-di.daysLeft === 1 ? '' : 's'} ago</b> : <> · {di.daysLeft} day{di.daysLeft === 1 ? '' : 's'} left</>)}</p>
              {(di.rec.extensions || []).length > 0 && <p className="muted">Extended: {di.rec.extensions.map((x) => x.from + ' to ' + x.to + ' - ' + x.reason + ' (' + (x.by || '?') + ', ' + (x.at || '').slice(0, 10) + ')').join('; ')}</p>}
              {di.rec.resubmittedAt && <p>Resubmission received <b>{formatDateLong(new Date(di.rec.resubmittedAt))}</b>{di.rec.recheckedAt ? <> · re-check complete <b>{formatDateLong(new Date(di.rec.recheckedAt))}</b> · {rows.length ? rows.length + ' gate' + (rows.length === 1 ? '' : 's') + ' still failing - refuse, no second deferral' : 'all gates now met - the outcome is on points'}</> : ' · re-score the listed gates in Stages 2-4 plus a regression sample, then log the re-check complete'}</p>}
              <div className="act-row">
                {!di.rec.resubmittedAt && !di.expired && <button className="btn btn--primary" onClick={() => { if (confirm('Log the provider\'s resubmission as received today?')) act((d) => markResubmitted(d)); }}>Resubmission received</button>}
                {!di.rec.resubmittedAt && !ext && <button className="btn" onClick={() => setExt({ days: '14', reason: '' })}>Extend the window (reason required)</button>}
                {di.rec.resubmittedAt && !di.rec.recheckedAt && <button className="btn btn--primary" onClick={() => { if (confirm('Log the re-check as complete?\n\n' + (rows.length ? rows.length + ' gate(s) still failing - the outcome becomes refusal (no second deferral).' : 'All gates are now met; the outcome goes to points.'))) act((d) => markRechecked(d, refinements)); }}>Re-check complete</button>}
              </div>
              {ext && <div className="act-row"><label>Extend by</label><input className="input" type="number" min="1" value={ext.days} onChange={(e) => setExt({ ...ext, days: e.target.value })} style={{ width: 80 }} /> days <input className="input" placeholder="Reason (required - recorded on the entry)" value={ext.reason} onChange={(e) => setExt({ ...ext, reason: e.target.value })} /><button className="btn btn--primary" onClick={() => { const r = act((d) => extendDeferral(d, parseInt(ext.days, 10), ext.reason, who)); if (r) setExt(null); }}>Extend</button><button className="btn btn--tiny" onClick={() => setExt(null)}>Cancel</button></div>}
            </>
          )}
        </div>

        <div className="grid2">
          <div className="panel">
            <h2>Partially met — conditions on the score (live)</h2>
            {!ov.partial.length && <p className="muted">Nothing partially met — scored indicators are either full marks or a clean fail.</p>}
            <ul className="plain">{ov.partial.map((p) => <li key={p.id}><b>{p.id}</b> {p.text}{p.finding ? <em> — {p.finding}</em> : null} <span className="tag">1 of 2 pts</span></li>)}</ul>
          </div>
          <div className="panel">
            <h2>Not applicable — excluded from the available points (live)</h2>
            {!ov.na.length && <p className="muted">Nothing excluded — every applicable indicator is in scope.</p>}
            <ul className="plain">{ov.na.map((p) => <li key={p.id}><b>{p.id}</b> {p.text} <span className="tag">N/A · {p.reason}</span></li>)}</ul>
          </div>
        </div>

        <div className="panel">
          <h2>Conditions register — what "accredited with conditions" means, as named actions with deadlines</h2>
          <div className="act-row">
            <input className="input" placeholder="The named action - what the provider must do" value={cond.text} onChange={(e) => setCond({ ...cond, text: e.target.value })} style={{ flex: 2 }} />
            <input className="input" list="cond-refs" placeholder={'Indicators, e.g. ' + (partialIds[0] || '1.5.2')} value={cond.refs} onChange={(e) => setCond({ ...cond, refs: e.target.value })} style={{ width: 150, flex: 'none' }} /><datalist id="cond-refs">{partialIds.map((p) => <option key={p} value={p} />)}</datalist>
            <select className="input" value={cond.verifyAt} onChange={(e) => setCond({ ...cond, verifyAt: e.target.value })} style={{ width: 200, flex: 'none' }}><option value="date">Verify by date</option><option value="sv1">Verify at Year-1 review</option><option value="sv2">Verify at Year-2 review</option></select>
            {cond.verifyAt === 'date' && <><span className="pills">{[28, 56, 90].map((n) => <button type="button" key={n} onClick={() => setCond({ ...cond, dueText: deadlineFrom(n) })}>+{n === 28 ? '4 weeks' : (n === 56 ? '8 weeks' : '90 days')}</button>)}</span><input className="input" placeholder="Due, e.g. 21 November 2026" value={cond.dueText} onChange={(e) => setCond({ ...cond, dueText: e.target.value })} style={{ width: 210, flex: 'none' }} /></>}
            <button className="btn btn--primary" onClick={() => { const r = act((d) => addCondition(d, { ...cond, who })); if (r) setCond({ text: '', refs: '', verifyAt: 'date', dueText: '' }); }}>Add condition</button>
          </div>
          {!ci.all.length && <p className="muted">No conditions on the register.{sum.computed === 'Accredited w/ conditions' ? ' The computed outcome is in the 70-84% band: name the conditions here before the decision can be signed.' : ''}{partialIds.length ? ' Partially met and available to draw on: ' + partialIds.join(', ') + '.' : ''}</p>}
          <ul className="plain">{ci.all.map((c, i) => {
            const today = new Date().toISOString().slice(0, 10);
            const cls = c.status === 'open' ? ((c.due && c.due < today) ? 'overdue' : 'open') : c.status;
            return <li key={c.id} className={'cond ' + cls}><b>C{i + 1}{c.refs && c.refs.length ? ' · ' + c.refs.join(', ') : ''}</b> {c.text}<div className="muted">Set {(c.setAt || '').slice(0, 10)} by {c.setBy || '?'} · from {condSourceLabel(c)} · verify at {condVerifyLabel(c)}{cls === 'overdue' ? <b className="bad"> · overdue</b> : null}{c.status !== 'open' ? ' · closed ' + (c.closedAt || '').slice(0, 10) + ' by ' + (c.closedBy || '?') + (c.note ? ' - ' + c.note : '') : ''}</div>
              <div className="act-row">{['open', 'met', 'unmet'].map((st) => <button key={st} type="button" className={'btn btn--tiny' + (c.status === st ? ' btn--primary' : '')} onClick={() => { if (st === 'open') act((d) => setConditionStatus(d, c.id, 'open', who)); else setClosing({ id: c.id, status: st, note: '' }); }}>{st === 'open' ? 'Open' : (st === 'met' ? 'Met' : 'Unmet')}</button>)}<button type="button" className="btn btn--tiny" onClick={() => { if (confirm('Remove this condition from the register? Close it as Met or Unmet instead unless it was entered in error.')) update((d) => removeCondition(d, c.id)); }}>×</button></div>
              {closing && closing.id === c.id && <div className="act-row"><input className="input" placeholder={closing.status === 'met' ? 'What was seen that shows the condition is met? (recorded)' : 'What was seen - why is the condition unmet? (recorded)'} value={closing.note} onChange={(e) => setClosing({ ...closing, note: e.target.value })} /><button className="btn btn--primary btn--tiny" onClick={() => { const r = act((d) => setConditionStatus(d, c.id, closing.status, who, closing.note)); if (r) setClosing(null); }}>Record {closing.status}</button><button className="btn btn--tiny" onClick={() => setClosing(null)}>Cancel</button></div>}
            </li>;
          })}</ul>
          {ci.unmet.length > 0 && <div className="alert alert--error">{ci.unmet.length} condition{ci.unmet.length === 1 ? '' : 's'} unmet - the D4 route: suspension until met. Record the grounds in the surveillance record and the remediation log.</div>}
        </div>

        <div className="panel">
          <h2>Provider communications — every notice issued on a Not-met gate, and their responses</h2>
          {!comms.length && <p className="muted">No provider notices issued yet — when a mandatory gate is marked Not met in Stages 2–4 and you log the notice, the full thread appears here.</p>}
          {comms.map((c) => (
            <div key={c.id} className={'com ' + (c.resolved ? 'resolved' : 'open')}>
              <div className="com__head"><b>{c.id}</b> {c.text} <span className={'status ' + (c.resolved ? 'ok' : 'warn')}>{c.resolved ? 'Resolved — now met' : 'Still open'}</span><span className="muted"> · sent {formatDateLong(new Date(c.notice.contactedAt))}{c.notice.due ? ' · due ' + c.notice.due : ''}{c.notice.channel ? ' · via ' + c.notice.channel : ''}{c.cause ? ' · job: ' + c.cause : ''}</span></div>
              <div className="com__line"><b>Requested</b> {c.notice.ask || c.finding || '(no detail recorded)'}</div>
              {(c.notice.responses || []).map((r, i) => <div key={i} className={'com__line ' + (r.from === 'provider' ? 'prov' : '')}><b>{when(r.ts)}</b> {r.text}</div>)}
              <button className="btn btn--tiny" onClick={() => setNotice(c.id)}>Open notice · log a reply</button>
            </div>
          ))}
        </div>

        <div className="panel">
          <h2>Remediation log</h2>
          <div className="act-row"><textarea className="input" rows={2} value={rlog} onChange={(e) => setRlog(e.target.value)} placeholder="Deferral issued (date), resubmission received, re-check results, regression sample…" /><button className="btn btn--primary" onClick={() => { if (!rlog.trim()) return; update((d) => logRemediation(d, rlog.trim())); setRlog(''); }}>+ Add entry</button></div>
          {!(doc.remediationLog || []).length && <p className="muted">No entries logged yet — add one above as things happen. Deferral, resubmission, re-check and conditions write here automatically.</p>}
          <ul className="plain rlog">{(doc.remediationLog || []).slice().reverse().map((e) => <li key={e.id}><span className="muted">{when(e.ts)}</span> {e.text}{e.auto ? <span className="tag">auto</span> : null} {!e.auto && <button className="btn btn--tiny" onClick={() => { if (confirm('Remove this log entry? This cannot be undone.')) update((d) => removeRemediationEntry(d, e.id)); }}>Remove</button>}</li>)}</ul>
        </div>

        <div className="sf">
          <div className="sf__v"><span className={'status ' + (sum.vcls || 'idle')}>{sum.verdict}</span></div>
          <div className="sf__stats"><div><b>{sum.gM} / {sum.gT}</b><span>gates met</span></div><div><b>{sum.gF}</b><span>gates failing</span></div><div><b>{sum.app ? sum.pct + '%' : '–'}</b><span>scored points</span></div><div><b>{sum.ans} / {sum.app}</b><span>indicators judged</span></div></div>
        </div>
        {notice && (() => { const allRows = [...rows, ...comms.map((c) => ({ id: c.id, text: c.text, finding: c.finding, cause: c.cause, notice: c.notice, m: 1 }))]; const nr = allRows.find((x) => x.id === notice); return nr ? <NoticeDrawer row={nr} doc={doc} refinements={refinements} onSave={(rr, f) => { update((d) => { saveNotice(d, refinements, rr.id, f, f.apply); }); setNotice(null); }} onClear={(rr) => { update((d) => { if (d.notices) delete d.notices[rr.id]; }); setNotice(null); }} onReply={(rr, text) => update((d) => { const n = d.notices[rr.id]; if (n) { n.responses = n.responses || []; n.responses.push({ ts: new Date().toISOString(), text }); } })} onClose={() => setNotice(null)} /> : null; })()}
      </CaseShell>
    </AppLayout>
  );
}
