'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { stage1Status, stage1Progress } from '@/lib/stage1';
import { stageCounts } from '@/lib/stage2';
import { withRefinements, moderationProgress, surveillanceDates } from '@/lib/scoring';
import { stage5Lock } from '@/lib/stage5';
import { stage6Lock } from '@/lib/stage6';

/* The assessor tool's frame, exactly as it was: the navy header with the
   white logo and the case title, the compact case strip, the sticky
   process-flow timeline (four phases on lilac trays, flow arrows, circular
   nodes with a progress ring and a traffic-light flag, locked stages dashed),
   and the fixed summary footer (white verdict band over the navy stats band).
   Only the mechanics changed: the nodes are links to stage pages and the
   numbers come from lib/scoring. Styles: app/tool.css (scoped .tool-shell). */
const PHASES = [
  { group: 'Intake gate', stages: [1] },
  { group: 'Evidence & scoring', stages: [2, 3, 4], grouped: true },
  { group: 'Reliability gate', stages: [5] },
  { group: 'Decision', stages: [6, 7], grouped: true },
  { group: 'In service', stages: [8] },
];
export const STAGE_NAMES = { 1: 'Submission & completeness', 2: 'Desk review & scoring', 3: 'Live verification', 4: 'Independent derivations', 5: 'Moderation', 6: 'Decision & remediation', 7: 'Outcome', 8: 'Surveillance & renewal' };

/* Locks and progress rings, the tool's rules (its compute() locks{} and stProg{}). */
export function stageMeta(doc, refinements, sum) {
  const st = (sum && sum.stages) || {};
  const s1 = stage1Status(doc, refinements);
  const s1Done = s1 === 'pass';
  const s1Msg = 'Locked — complete Stage 1 (all completeness items) first: nothing is judged until the submission is assessable';
  const locks = {
    1: '', 2: s1Done ? '' : s1Msg, 3: s1Done ? '' : s1Msg, 4: s1Done ? '' : s1Msg,
    5: stage5Lock(sum || {}, s1), 6: stage6Lock(sum || {}, s1), 7: stage6Lock(sum || {}, s1),
    8: surveillanceDates(doc) ? '' : 'Locked — surveillance begins once the material is approved and the accreditation date is set (Stage 7); the review dates are computed from it automatically',
  };
  const prog = { 1: stage1Progress(doc, refinements) };
  [2, 3, 4].forEach((n) => { const c = stageCounts(n, doc, refinements); prog[n] = c.total ? c.judged / c.total : (st[n] === 'pass' ? 1 : 0); });
  prog[5] = withRefinements(refinements, () => moderationProgress(doc.moderation));
  prog[6] = sum && sum.app ? sum.ans / sum.app : 0; prog[7] = prog[6];
  const sv = doc.surveillance || {}; let tot = 0, done = 0;
  ['sv1', 'sv2'].forEach((k) => { const v = sv[k] || {}; tot += 10; done += Object.values(v.items || {}).filter((x) => x === 'yes' || x === 'no').length + (v.outcome ? 1 : 0); });
  prog[8] = tot ? Math.min(1, done / tot) : 0;
  return { locks, prog, status: st };
}

export default function CaseShell({ id, doc, summary, refinements, saveState, failed, children, approveBar }) {
  const path = usePathname() || '';
  const [lockNote, setLockNote] = useState('');
  const ci = doc?.caseInfo || {};
  const sum = summary || {};
  const meta = stageMeta(doc || {}, refinements || {}, sum);
  const active = Number((path.match(/stage-(\d)/) || [])[1] || 0);
  useEffect(() => { if (!lockNote) return; const t = setTimeout(() => setLockNote(''), 8000); return () => clearTimeout(t); }, [lockNote]);
  const filled = ci.ref || ci.activity || ci.provider;
  const modes = [];
  if (ci.modes) { if (ci.modes.el) modes.push('E-learning'); if (ci.modes.lo) modes.push('Live online'); if (ci.modes.f2f) modes.push('Face-to-face'); }
  const modeTxt = modes.length ? modes.join(' + ') + (ci.modes && ci.modes.bl ? ' (blended)' : '') : 'no mode set';
  const flags = []; if (ci.assess) flags.push('assesses'); if (ci.cert) flags.push('certificates');
  const vcls = sum.vcls === 'ok' ? 'ok' : (sum.vcls === 'warn' ? 'warn' : (sum.vcls === 'bad' ? 'bad' : 'idle'));
  const na = doc ? Object.keys(doc.indicators || {}).filter((k) => (doc.indicators[k] || {}).r === 'N/A').length : 0;
  return (
    <div className="tool-shell">
      <header className="tool">
        <div className="wrap">
          <div className="brandwrap">
            <img className="brand-logo" src="/images/cpd-logo-white.svg" alt="CPD Accreditation" />
            <div><h1 id="case-title">{ci.ref || 'New entry'}{ci.activity ? ' — ' + ci.activity : ''}</h1></div>
          </div>
          <div className="toolbar">
            <div className="toolbar-btns">
              <Link href="/dashboard" className="btn btn-outline">&#9636; Caseload</Link>
              <Link href={'/cases/' + encodeURIComponent(id) + '/stage-1'} className="btn btn-outline">Case details</Link>
            </div>
            <span className={'save-state' + (failed ? ' bad' : '')} id="save-state">{saveState}</span>
          </div>
        </div>
      </header>
      <div className="wrap">
        <Link href={'/cases/' + encodeURIComponent(id) + '/stage-1'} className={'case-strip' + (filled ? '' : ' empty')} id="case-strip" title="Click to edit case details">
          {filled ? (<>
            <span className="cs-ref">{ci.ref || '(no ref)'}</span>
            {ci.activity && <><span className="cs-sep">|</span><span className="cs-field">{ci.activity}</span></>}
            {ci.provider && <><span className="cs-sep">|</span><span className="cs-field"><b>{ci.provider}</b></span></>}
            {ci.hours && <><span className="cs-sep">|</span><span className="cs-field">{ci.hours}h claimed</span></>}
            <span className="cs-sep">|</span><span className="cs-field">{modeTxt}</span>
            {flags.length > 0 && <><span className="cs-sep">|</span><span className="cs-tag">{flags.join(' · ')}</span></>}
            <span className="cs-edit">Edit &#9998;</span>
          </>) : 'No case details yet — click to add the ref, activity, provider and delivery details'}
        </Link>

        <div className="timeline-sticky">
          <nav className="stepper" aria-label="Assessment stages">
            {PHASES.map((ph, pi) => (
              <span key={ph.group} style={{ display: 'contents' }}>
                {pi > 0 && <span className="flow-arrow" aria-hidden="true">&rarr;</span>}
                <div className={'seg' + (ph.grouped ? ' grouped' : '')} data-group={ph.group}>
                  {ph.stages.map((n) => {
                    const s = meta.status[n]; const locked = !!meta.locks[n];
                    const cls = 'step' + (n === active ? ' active' : '') + (locked ? ' locked' : (s === 'pass' ? ' st-pass' : (s === 'act' ? ' st-act' : (s === 'sent' ? ' st-sent' : ''))));
                    const word = n === 8 ? (s === 'pass' ? 'surveillance complete' : (s === 'act' ? 'review overdue' : (s === 'sent' ? 'review due soon' : 'in service / not yet accredited'))) : (s === 'pass' ? 'passed' : (s === 'act' ? 'action needed' : (s === 'sent' ? 'with provider' : 'in progress')));
                    const flag = s === 'pass' ? '✓' : (s === 'act' ? '!' : (s === 'sent' ? '…' : ''));
                    const href = '/cases/' + encodeURIComponent(id) + '/stage-' + n;
                    return locked
                      ? <button key={n} type="button" className={cls} title={meta.locks[n]} onClick={() => setLockNote(meta.locks[n])}><span className="st-flag" aria-hidden="true" /><span className="num" style={{ '--p': 0 }}>{n}</span><span className="t">{STAGE_NAMES[n]}</span></button>
                      : <Link key={n} href={href} className={cls} title={'Stage ' + n + ' — ' + word}><span className="st-flag" aria-hidden="true">{flag}</span><span className="num" style={{ '--p': Math.round((meta.prog[n] || 0) * 100) }}>{n}</span><span className="t">{STAGE_NAMES[n]}</span></Link>;
                  })}
                </div>
              </span>
            ))}
          </nav>
          {lockNote && <div className="lock-note show" role="status">{lockNote}</div>}
        </div>

        {children}
      </div>

      <div className="summary-footer" aria-live="polite">
        {approveBar}
        <div className="sf-verdict"><span className={'verdict-cell ' + vcls} id="s-verdict">{sum.verdict || 'Set up the case, then work the stages. The decision is computed from rule C2 — never chosen.'}</span></div>
        <div className="sf-stats"><div className="wrap"><div className="sf-stats-inner">
          <div className="cell"><b>{sum.gM || 0} / {sum.gT || 0}</b><span>gates met</span></div>
          <div className="cell"><b>{sum.gF || 0}</b><span>gates failing</span></div>
          <div className="cell"><b>{sum.app ? sum.pct + '%' : '–'}</b><span>scored points</span></div>
          <div className="cell"><b>{sum.ans || 0} / {sum.app || 0}</b><span>indicators judged</span></div>
          <div className="cell"><b>{na}</b><span>recorded N/A</span></div>
        </div></div></div>
      </div>
    </div>
  );
}
