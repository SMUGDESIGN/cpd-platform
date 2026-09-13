'use client';
import { useState } from 'react';
import { STD_NAMES } from '@/lib/frameworkData';
import { RATING_GATE, RATING_SCORED, RATING_SHORT, causeOptions, sameCauseGates, deadlineFrom } from '@/lib/stage2';

/* The indicator matrix, one stage at a time - shared by Stages 2, 3 and 4.
   Marked up exactly as the assessor tool drew it (app/tool.css): .irow grid
   of id / text / controls, the sliding .cap capsule (knob translates by
   index, never measured), the step-evidence toggle, the [i] source popover,
   the Refine panel, the hard-stop chip. Rows come from lib/stage2.stageRows();
   every change goes back through the handlers so the page owns the save. */

/* Sliding capsule: one lilac track, a knob that slides to the chosen segment
   and recolours to what that value means. --seg per option count is fixed
   CSS (n2/n3/n4), the knob moves by translateX(idx*100%). */
const CAP_COLOR = { 'Met': 'var(--ok)', 'Not met': 'var(--bad)', 'Partially met': 'var(--warn)', 'N/A': 'var(--ink-3)', 'approve': 'var(--ok)', 'pushback': 'var(--bad)', 'satisfactory': 'var(--ok)', 'conditions': 'var(--warn)', 'escalate': 'var(--bad)', 'yes': 'var(--ok)', 'no': 'var(--bad)' };
export function Capsule({ value, options, labels, onPick, label, disabled }) {
  const idx = options.indexOf(value);
  return (
    <div className={'cap n' + options.length} role="group" aria-label={label}>
      <span className="cap-knob" style={{ transform: 'translateX(' + Math.max(0, idx) * 100 + '%)', opacity: idx >= 0 ? 1 : 0, background: idx >= 0 ? CAP_COLOR[value] || 'var(--lilac-tint-2)' : undefined }} />
      {options.map((o) => <button type="button" key={o} className={'cap-btn' + (value === o ? ' active' : '')} disabled={disabled} onClick={() => onPick(o)}>{(labels || RATING_SHORT)[o] || o}</button>)}
    </div>
  );
}

/* The [i] icon: what to check, the obvious route, where it came from. */
export function Info({ id, look, steps, sources }) {
  const [open, setOpen] = useState(false);
  if (!look && !(steps || []).length && !(sources || []).length) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="src-i" aria-label={'What to check for ' + id} title="What to check and where it came from" onClick={() => setOpen(!open)}>i</button>
      {open && (
        <div className="src-pop open" role="dialog" style={{ left: 0, top: 22 }}>
          <div className="src-pop-head"><span>{id} · what to check &amp; where it came from</span><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          <div className="src-pop-body">
            {look && <><div className="src-sect">What to check</div><div className="g-look">{look}</div></>}
            {(steps || []).length > 0 && <><div className="src-sect">The obvious route</div><ol className="g-steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
            {(sources || []).length > 0 && <><div className="src-sect">Where this comes from</div>{sources.map((s, i) => <div key={i} className="src-item"><span className="sname">{s.s}</span><span className="swhy">{s.why}</span></div>)}</>}
          </div>
        </div>
      )}
    </span>
  );
}

/* The dashed Refine toggle and its panel: reword, restore, or mark not needed - a
   proposal to the Standards Panel, with a required reason. */
export function Refine({ text, original, removed, reworded, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(text);
  const [reason, setReason] = useState('');
  return (
    <>
      <button type="button" className="rf-btn" onClick={() => { setOpen(!open); setT(text); }}>Refine{reworded && <span className="rf-flag"> · reworded</span>}{removed && <span className="rf-flag"> · not needed</span>}</button>
      {open && (
        <div className="rf-panel open">
          <textarea rows={2} value={t} onChange={(e) => setT(e.target.value)} />
          <input className="rf-why" placeholder="Why - the reason the Standards Panel will read (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="rf-row">
            <button type="button" className="rfa" onClick={() => { onSubmit(t, reason, null); setOpen(false); }}>Submit rewording</button>
            <button type="button" className="rfb" onClick={() => { onSubmit(original, 'restored the original wording', null); setOpen(false); }}>Restore original</button>
            <label className="rf-nn"><input type="checkbox" checked={!!removed} onChange={(e) => { onSubmit(null, reason, e.target.checked); setOpen(false); }} />Not needed</label>
            <button type="button" className="rfb" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <div className="rf-note">Proposal to the Standards Panel: applies to every case now (pilot), recorded with your name, the date and your reason. The Refinements export is the proposal queue.</div>
        </div>
      )}
    </>
  );
}

export function IndicatorRow({ row, locked, onRate, onFinding, onStep, onRefine, onNotice, rateMsg }) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const filled = row.se.filter((x) => x && x.trim()).length;
  const nudge = row.rating && !row.finding && filled === 0;
  const failing = row.m && row.rating === 'Not met' && row.applicable;
  const disabled = locked || row.removed;
  return (
    <div className={'irow' + (row.applicable ? '' : ' na') + (row.removed ? ' rf-removed' : '')}>
      <div className="iid">{row.id}{row.m ? <span className="mtag">[M] gate</span> : null}</div>
      <div className="itext">
        <span style={{ textDecoration: row.removed ? 'line-through' : 'none', opacity: row.removed ? .5 : 1 }}>{row.text}</span>
        {' '}<Info id={row.id} look={row.look} steps={row.steps} sources={row.sources} />
        {' '}<Refine text={row.text} original={row.t} removed={row.removed} reworded={row.reworded} onSubmit={(t, reason, nn) => onRefine(row, t, reason, nn)} />
      </div>
      <div className="ictl">
        <span className="na-msg">N/A · {row.naReason}</span>
        {row.applicable && !row.removed && (<>
          <Capsule value={row.rating} options={row.m ? RATING_GATE : RATING_SCORED} onPick={(v) => !disabled && onRate(row, v)} label={'Rating for ' + row.id} disabled={disabled} />
          {rateMsg && <div className="lock-note show">{rateMsg}</div>}
          <input type="text" placeholder="Overall finding / summary - feeds provider notices & the fix list" value={row.finding} disabled={disabled} onChange={(e) => onFinding(row, e.target.value)} />
          {row.steps.length > 0 && (<>
            <button type="button" className={'ev-toggle' + (filled === row.steps.length ? ' done' : (nudge ? ' nudge' : (stepsOpen ? ' open' : '')))} onClick={() => setStepsOpen(!stepsOpen)}>Step evidence · {filled} / {row.steps.length}{nudge ? ' · rated with no evidence' : ''}</button>
            <div className={'ev-steps' + (stepsOpen ? ' open' : '')}>{row.steps.map((s, i) => <label key={i} className="ev-step"><span className="ev-step-t">{i + 1}. {s}</span><input type="text" value={row.se[i] || ''} disabled={disabled} onChange={(e) => onStep(row, i, e.target.value)} /></label>)}</div>
          </>)}
          {failing && (
            <button type="button" className={'np-chip' + (row.notice && row.notice.contactedAt ? ' logged' : '')} onClick={() => onNotice(row)}>
              {row.notice && row.notice.contactedAt ? '✓ Provider contacted' + (row.notice.due ? ' · respond by ' + row.notice.due : ' · no deadline set') + ' — edit notice' : (locked ? '● Rated before Stage 1 passed - the notice waits until the submission is complete' : '● Hard stop — contact the provider (open notice)')}
            </button>
          )}
        </>)}
      </div>
    </div>
  );
}

/* Rows grouped by standard, in framework order - the tool's .ck-group headers. */
export function StageMatrix({ rows, ...handlers }) {
  const byStd = {};
  rows.forEach((r) => { (byStd[r.std] || (byStd[r.std] = [])).push(r); });
  return Object.keys(byStd).sort().map((std) => (
    <div key={std}>
      <div className="ck-group">Standard {std} — {STD_NAMES[std]}</div>
      {byStd[std].map((r) => <IndicatorRow key={r.id} row={r} rateMsg={handlers.rateMsgs?.[r.id]} {...handlers} />)}
    </div>
  ));
}

/* The hard-stop provider notice - the drawer that slides in from the right. */
export function NoticeDrawer({ row, doc, refinements, onSave, onClear, onReply, onClose }) {
  const n = row.notice || {};
  const [f, setF] = useState({ ask: n.ask || row.finding || '', due: n.due || '', channel: n.channel || '', cause: row.cause || '', apply: true });
  const [reply, setReply] = useState('');
  const others = sameCauseGates(doc, refinements, row.id, f.cause);
  return (
    <aside className="notice-panel open" role="dialog" aria-label={'Provider notice for ' + row.id}>
      <div className="np-head"><div><div className="np-kicker">Hard stop — mandatory gate not met</div><h3>Provider notice · {row.id}</h3></div><button type="button" className="np-close" onClick={onClose} aria-label="Close">×</button></div>
      <div className="np-body">
        <div className="np-gate">{row.id} · {row.text}</div>
        <p className="np-expl">A mandatory indicator has been rated <strong>Not met</strong>. No overall score can rescue a failed gate — so the provider is contacted now, not at decision. Record what they must supply or correct, and the date by which they must do it.</p>
        {row.finding && <div className="np-evi">Assessor finding on file: {row.finding}</div>}
        <label className="np-label">Cause — the one thing that clears this gate (groups gates into a job)</label>
        <input type="text" className="np-due-input" list="cause-list" value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })} placeholder="e.g. Outcomes list missing - pick or type; the same words on another gate make it the same job" />
        <datalist id="cause-list">{causeOptions(doc, refinements).map((c) => <option key={c} value={c} />)}</datalist>
        {others.length > 0 && <div className="np-group"><label><input type="checkbox" checked={f.apply} onChange={(e) => setF({ ...f, apply: e.target.checked })} /> <span>Same cause on {others.map((o) => o.id).join(', ')} - saving marks {others.length === 1 ? 'it' : 'them'} contacted with this ask and deadline too (one job, one notice).</span></label></div>}
        <label className="np-label">What we need from the provider</label>
        <textarea rows={4} value={f.ask} onChange={(e) => setF({ ...f, ask: e.target.value })} placeholder="State plainly what is missing or must change, and the evidence required to clear this gate…" />
        <label className="np-label">Respond by (deadline)</label>
        <div className="np-pills">{[[14, '+10 working days'], [28, '+4 weeks'], [56, '+8 weeks (fix window)']].map(([d, l]) => <button type="button" key={d} className="np-pill" onClick={() => setF({ ...f, due: deadlineFrom(d) })}>{l}</button>)}</div>
        <input type="text" className="np-due-input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} placeholder="e.g. 21 August 2026" />
        <p className="np-hint">Typed date — pills fill it from today; edit freely. The 8-week option matches the single deferral fix window.</p>
        <label className="np-label">Contact route &amp; reference</label>
        <input type="text" className="np-due-input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} placeholder="e.g. portal message #, email to…" />
        <div className="np-actions"><button type="button" className="rfa" onClick={() => onSave(row, f)}>Save &amp; mark contacted</button><button type="button" className="rfb" onClick={() => onClear(row)}>Clear notice</button></div>
        {n.contactedAt && <div className="np-status">Contacted {String(n.contactedAt).slice(0, 10)}{n.due ? ' · due ' + n.due : ''}</div>}
        <div className="np-resp">
          <label className="np-label">Provider responses (logged as they reply)</label>
          {!(n.responses || []).length && <div className="npr-none">No provider reply logged yet.</div>}
          {(n.responses || []).map((r, i) => <div key={i} className="npr-item"><span className="npr-when">{String(r.ts).replace('T', ' ').slice(0, 16)}</span>{r.text}</div>)}
          <div className="np-resp-add"><textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What the provider said back — dated on this thread…" /><button type="button" className="rfa" style={{ flex: 'none' }} onClick={() => { if (reply.trim()) { onReply(row, reply.trim()); setReply(''); } }}>+ Log reply</button></div>
        </div>
      </div>
    </aside>
  );
}
