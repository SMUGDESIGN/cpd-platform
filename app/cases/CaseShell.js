'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* The case header and the eight-stage strip. Stages rebuilt as pages link
   here; the rest still open in the framed tool until they move. */
export const STAGES = [
  { n: 1, name: 'Submission & completeness', page: true },
  { n: 2, name: 'Desk review & scoring', page: true }, { n: 3, name: 'Live verification', page: true }, { n: 4, name: 'Independent derivations', page: true },
  { n: 5, name: 'Moderation' }, { n: 6, name: 'Decision & remediation' }, { n: 7, name: 'Outcome' }, { n: 8, name: 'Surveillance & renewal' },
];

export default function CaseShell({ id, doc, summary, saveState, failed, children }) {
  const path = usePathname() || '';
  const ci = doc?.caseInfo || {};
  const st = summary?.stages || {};
  return (
    <>
      <div className="case-head">
        <div>
          <p className="muted"><Link href="/dashboard">← Caseload</Link></p>
          <h1>{ci.ref || 'New entry'}{ci.activity ? <span className="case-head__act"> — {ci.activity}</span> : null}</h1>
          <p className="muted">{ci.provider || 'no provider named'}{ci.hours ? ' · ' + ci.hours + ' CPD hours' : ''}{summary?.verdict ? <> · <span className={'status ' + (summary.vcls || 'idle')}>{summary.verdict}</span></> : null}</p>
        </div>
        <div className={'save-state' + (failed ? ' bad' : '')}>{saveState}</div>
      </div>
      <nav className="stage-strip" aria-label="Stages">
        {STAGES.map((s) => {
          const href = s.page ? '/cases/' + encodeURIComponent(id) + '/stage-' + s.n : '/tool?entry=' + encodeURIComponent(id);
          const cls = 'stage-pill ' + (st[s.n] || '') + (path.endsWith('/stage-' + s.n) ? ' on' : '') + (s.page ? '' : ' tool');
          return <Link key={s.n} href={href} className={cls} title={s.page ? s.name : s.name + ' - opens in the assessment tool until this stage is rebuilt as a page'}><b>{s.n}</b><span>{s.name}</span></Link>;
        })}
      </nav>
      {children}
    </>
  );
}
