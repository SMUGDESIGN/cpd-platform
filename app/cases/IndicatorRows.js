'use client';
import { useState } from 'react';
import { STD_NAMES } from '@/lib/frameworkData';
import { RATING_GATE, RATING_SCORED, RATING_SHORT, causeOptions, sameCauseGates, deadlineFrom } from '@/lib/stage2';

/* The indicator matrix, one stage at a time - shared by Stages 2, 3 and 4.
   Rows come from lib/stage2.stageRows(); every change goes back through
   `onRate`, `onFinding`, `onStep`, `onRefine`, `onNotice` so the page owns
   the document and the save. Ratings are click-driven capsules (no native
   selects), gates two-way, scored rows four-way; a Not met gate shows the
   hard-stop chip until its notice is logged. */

function Capsule({ value, options, onPick, label }) {
  return (
    <div className="cap" role="group" aria-label={label}>
      {options.map((o) => <button type="button" key={o} className={'cap__b ' + o.replace(/[^a-z]/gi, '').toLowerCase() + (value === o ? ' on' : '')} onClick={() => onPick(o)}>{RATING_SHORT[o] || o}</button>)}
    </div>
  );
}

function Info({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info">
      <button type="button" className="info__i" aria-label={'What to check for ' + row.id} onClick={() => setOpen(!open)}>i</button>
      {open && (
        <div className="info__pop" role="dialog">
          <div className="info__head"><b>{row.id}</b> · what to check &amp; where it came from <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          {row.look && <><h4>What to check</h4><p>{row.look}</p></>}
          {row.steps.length > 0 && <><h4>The obvious route</h4><ol>{row.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
          {row.sources.length > 0 && <><h4>Where this comes from</h4><ul>{row.sources.map((s, i) => <li key={i}><b>{s.s}</b> — {s.why}</li>)}</ul></>}
        </div>
      )}
    </span>
  );
}

export function IndicatorRow({ row, locked, onRate, onFinding, onStep, onRefine, onNotice, rateMsg }) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [rf, setRf] = useState(null);
  const filled = row.se.filter((x) => x && x.trim()).length;
  const nudge = row.rating && !row.finding && filled === 0;
  const failing = row.m && row.rating === 'Not met' && row.applicable;
  if (!row.applicable) {
    return <li className="irow na"><div className="irow__text"><b>{row.id}</b> {row.text}<span className="tag">N/A · {row.naReason}</span></div></li>;
  }
  return (
    <li className={'irow' + (row.removed ? ' removed' : '') + (failing ? ' failing' : '')}>
      <div className="irow__text">
        <b>{row.id}</b> {row.text}
        {row.m ? <span className="tag tag--gate">gate</span> : <span className="tag">2 pts</span>}
        {row.reworded && <span className="tag">reworded</span>}
        {row.removed && <span className="tag tag--scheme">not needed (refinement)</span>}
        <Info row={row} />
        <button type="button" className="rf-btn" onClick={() => setRf(rf ? null : { text: row.text, reason: '' })}>Refine</button>
      </div>
      {!row.removed && (
        <div className="irow__ctl">
          <Capsule value={row.rating} options={row.m ? RATING_GATE : RATING_SCORED} onPick={(v) => !locked && onRate(row, v)} label={'Rating for ' + row.id} />
          {rateMsg && <div className="lock-note">{rateMsg}</div>}
          <input className="input input--finding" placeholder="Overall finding / summary - feeds provider notices and the fix list" value={row.finding} disabled={locked} onChange={(e) => onFinding(row, e.target.value)} />
          {row.steps.length > 0 && (
            <div className="ev">
              <button type="button" className={'ev__toggle' + (filled === row.steps.length ? ' done' : (nudge ? ' nudge' : ''))} onClick={() => setStepsOpen(!stepsOpen)}>Step evidence · {filled} / {row.steps.length}{nudge ? ' · rated with no evidence' : ''}</button>
              {stepsOpen && <ol className="ev__steps">{row.steps.map((s, i) => <li key={i}><label>{s}</label><input className="input" value={row.se[i] || ''} disabled={locked} onChange={(e) => onStep(row, i, e.target.value)} /></li>)}</ol>}
            </div>
          )}
          {failing && (
            <button type="button" className={'np-chip' + (row.notice && row.notice.contactedAt ? ' logged' : '')} onClick={() => onNotice(row)}>
              {row.notice && row.notice.contactedAt ? '✓ Provider contacted' + (row.notice.due ? ' · respond by ' + row.notice.due : ' · no deadline set') + ' — edit notice' : (locked ? '● Rated before Stage 1 passed - the notice waits until the submission is complete' : '● Hard stop — contact the provider (open notice)')}
            </button>
          )}
        </div>
      )}
      {rf && (
        <div className="rf-panel">
          <textarea className="input" rows={2} value={rf.text} onChange={(e) => setRf({ ...rf, text: e.target.value })} />
          <input className="input" placeholder="Why - the reason the Standards Panel will read (required)" value={rf.reason} onChange={(e) => setRf({ ...rf, reason: e.target.value })} />
          <div className="act-row">
            <button className="btn btn--primary btn--tiny" onClick={() => { onRefine(row, rf.text, rf.reason, null); setRf(null); }}>Submit rewording</button>
            <button className="btn btn--tiny" onClick={() => { onRefine(row, row.t, 'restored the original wording', null); setRf(null); }}>Restore original</button>
            <button className="btn btn--tiny" onClick={() => { onRefine(row, null, rf.reason, !row.removed); setRf(null); }}>{row.removed ? 'Needed again' : 'Not needed'}</button>
            <button className="btn btn--tiny" onClick={() => setRf(null)}>Cancel</button>
          </div>
          <p className="muted">Proposal to the Standards Panel: applies to every case now (pilot), recorded with your name, the date and your reason.</p>
        </div>
      )}
    </li>
  );
}

/* Rows grouped by standard, in framework order. */
export function StageMatrix({ rows, ...handlers }) {
  const byStd = {};
  rows.forEach((r) => { (byStd[r.std] || (byStd[r.std] = [])).push(r); });
  return Object.keys(byStd).sort().map((std) => (
    <section key={std} className="std">
      <h3 className="std__h">Standard {std} — {STD_NAMES[std]}</h3>
      <ul className="irows">{byStd[std].map((r) => <IndicatorRow key={r.id} row={r} rateMsg={handlers.rateMsgs?.[r.id]} {...handlers} />)}</ul>
    </section>
  ));
}

/* The hard-stop provider notice drawer. */
export function NoticeDrawer({ row, doc, refinements, onSave, onClear, onReply, onClose }) {
  const n = row.notice || {};
  const [f, setF] = useState({ ask: n.ask || row.finding || '', due: n.due || '', channel: n.channel || '', cause: row.cause || '', apply: true });
  const [reply, setReply] = useState('');
  const others = sameCauseGates(doc, refinements, row.id, f.cause);
  return (
    <aside className="drawer" role="dialog" aria-label={'Provider notice for ' + row.id}>
      <div className="drawer__head"><div><small>Hard stop — mandatory gate not met</small><h3>Provider notice · {row.id}</h3></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <p className="muted">{row.text}</p>
      <p className="muted">A mandatory indicator has been rated Not met. No overall score can rescue a failed gate - so the provider is contacted now, not at decision. Record what they must supply or correct, and the date by which they must do it.</p>
      {row.finding && <div className="np-evi">Assessor finding on file: {row.finding}</div>}
      <div className="field"><label>Cause — the one thing that clears this gate (groups gates into a job)</label>
        <input className="input" list="cause-list" value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })} placeholder="e.g. Outcomes list missing - pick or type" />
        <datalist id="cause-list">{causeOptions(doc, refinements).map((c) => <option key={c} value={c} />)}</datalist>
        {others.length > 0 && <label className="check"><input type="checkbox" checked={f.apply} onChange={(e) => setF({ ...f, apply: e.target.checked })} /> Same cause on {others.map((o) => o.id).join(', ')} - saving marks them contacted with this ask and deadline too (one job, one notice)</label>}
      </div>
      <div className="field"><label>What we need from the provider</label><textarea className="input" rows={4} value={f.ask} onChange={(e) => setF({ ...f, ask: e.target.value })} placeholder="State plainly what is missing or must change, and the evidence required to clear this gate…" /></div>
      <div className="field"><label>Respond by (deadline)</label>
        <div className="pills">{[[14, '+10 working days'], [28, '+4 weeks'], [56, '+8 weeks (fix window)']].map(([d, l]) => <button type="button" key={d} onClick={() => setF({ ...f, due: deadlineFrom(d) })}>{l}</button>)}</div>
        <input className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} placeholder="e.g. 21 August 2026" />
      </div>
      <div className="field"><label>Contact route &amp; reference</label><input className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} placeholder="e.g. portal message #, email to…" /></div>
      <div className="act-row"><button className="btn btn--primary" onClick={() => onSave(row, f)}>Save &amp; mark contacted</button>{n.contactedAt && <button className="btn" onClick={() => onClear(row)}>Clear notice</button>}</div>
      {n.contactedAt && <p className="muted">Contacted {String(n.contactedAt).slice(0, 10)}{n.due ? ' · due ' + n.due : ''}</p>}
      <div className="field"><label>Provider responses (logged as they reply)</label>
        {(n.responses || []).length ? <ul className="thread">{n.responses.map((r, i) => <li key={i} className={r.from || 'scheme'}><span className="muted">{String(r.ts).slice(0, 16).replace('T', ' ')}</span> {r.text}</li>)}</ul> : <p className="muted">No provider reply logged yet.</p>}
        {n.contactedAt && <div className="act-row"><input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What the provider said back - dated on this thread…" /><button className="btn btn--tiny" onClick={() => { if (reply.trim()) { onReply(row, reply.trim()); setReply(''); } }}>+ Log reply</button></div>}
      </div>
    </aside>
  );
}
