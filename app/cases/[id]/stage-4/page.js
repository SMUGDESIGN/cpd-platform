'use client';
import { useState } from 'react';
import StagePage from '../../StagePage';
import { derivation, applyDerivation, derivationFails } from '@/lib/stage2';

/* Stage 4 - independent derivations: the hours calculator. The assessor
   derives notional learning time from the material; 1.4.3 follows the
   arithmetic (more than 20% over = Not met) while the row is untouched or
   still carrying an auto value. It cannot be hand-set to Met while the
   calculator fails - the route to Met is correcting the derived figure. */
function HoursCalculator({ doc, update, locked, setNotice }) {
  const dv = derivation(doc);
  const [msg, setMsg] = useState('');
  const onDerived = (v) => {
    const trial = JSON.parse(JSON.stringify(doc)); trial.derived = v;
    const res = applyDerivation(trial, { stage1Open: locked });
    update((d) => { d.derived = v; applyDerivation(d, { stage1Open: locked }); });
    setMsg(res.changed ? '1.4.3 follows the calculator: ' + (derivation(trial).fail ? 'Not met' : 'Met') + '.' : (dv.ready ? 'The assessor has hand-rated 1.4.3; the calculator no longer moves it.' : ''));
    if (res.openNotice) setNotice('1.4.3');
  };
  const d143 = (doc.indicators || {})['1.4.3'] || {};
  return (
    <>
      <div className="note-label">Hours derivation — 1.4.3</div>
      <p className="purpose">Derive the notional learning time independently from the material (reading at a stated words-per-minute band, media runtime, per-item allowance for activities and assessment). The claim must sit within 20% of your figure.</p>
      <div className="deriv">
        <div className="cell"><b>{dv.claimed != null ? dv.claimed.toFixed(1) : '–'}</b><span>Claimed hours (case setup)</span></div>
        <div className="cell"><input type="text" inputMode="decimal" value={doc.derived || ''} disabled={locked} onChange={(e) => onDerived(e.target.value)} placeholder="e.g. 5.2" style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', padding: '2px 6px' }} /><span>Derived by the assessor</span></div>
        <div className={'cell' + (dv.ready ? (dv.fail ? ' hot' : ' fine') : '')}><b>{dv.ready ? (dv.over > 0 ? '+' : '') + dv.over + '%' : '–'}</b><span>Difference</span></div>
        <div className={'cell' + (dv.ready ? (dv.fail ? ' hot' : ' fine') : '')}><b>{dv.ready ? (dv.fail ? 'Not met' : 'Met') : '–'}</b><span>1.4.3{d143.r && !d143.auto ? ' · hand-set: ' + d143.r : ''}</span></div>
      </div>
      {msg && <p className="np-hint">{msg}</p>}
      {derivationFails(doc) && <div className="lock-note show">While the calculator shows a fail, 1.4.3 cannot be set to Met by hand. Manual Not met is always allowed — stricter than the rule is never a risk. Correct the derived figure; the gate turns green when the arithmetic does.</div>}
    </>
  );
}

export default function Stage4() {
  return <StagePage stage={4} title="Independent derivations" notesKey="stage4"
    notesPlaceholder="How the hours were derived: word counts and the band used, media runtime, allowances…"
    intro="The one thing the scheme recalculates itself rather than reads from the provider: CPD hours. The stated figure is checked against an independent derivation, and the gate follows the arithmetic."
    Extra={HoursCalculator} />;
}
