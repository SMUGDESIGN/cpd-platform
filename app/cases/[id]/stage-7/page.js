'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../../../AppLayout';
import CaseShell from '../../CaseShell';
import { useCase } from '../../useCase';
import { summarise, conditionsInfo } from '@/lib/scoring';
import { verdictText, scorecard, decisionReady, signDecision, withdrawDecision, outcomeInfo, isApproved, approveMaterial, clearApproval, registerRecord, unitSpec, composeCongratsEmail } from '@/lib/stage7';
import { when } from '../../../money';

/* Stage 7 - the outcome. Rule C2 computes it and the words say why; a person
   signs it; the approval sets the dates; the deliverables are issued from the
   signed record: unit specification and certificate, register listing and
   verify text, the badge, the congratulations email. If the matrix moves
   after signing the page says "drifted" and issues nothing new. */
function Mail({ mail, setMail }) {
  const [copied, setCopied] = useState('');
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setCopied('Copied.'); } catch { setCopied('Could not copy - select the text.'); } };
  return (
    <div className="mail">
      <div className="field"><label>To</label><input  value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} /></div>
      <div className="field"><label>Subject</label><input  value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></div>
      <div className="field"><label>Body</label><textarea  rows={14} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></div>
      <div className="act-row"><button className="rfb" onClick={() => copy(mail.body)}>Copy body</button><a className="rfb" href={'mailto:' + encodeURIComponent(mail.to) + '?subject=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.body)}>Open in email client</a><button className="rfb btn-tiny" onClick={() => setMail(null)}>Close</button></div>
      {copied && <p className="purpose">{copied}</p>}
    </div>
  );
}

export default function Stage7() {
  const { id } = useParams();
  const { data: session } = useSession();
  const { row, doc, refinements, err, saveState, failed, update, reload } = useCase(id, summarise);
  const [msg, setMsg] = useState('');
  const [lead, setLead] = useState(null);
  const [mail, setMail] = useState(null);
  const [spec, setSpec] = useState(false);
  const [pv, setPv] = useState(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { if (doc && lead === null) setLead((doc.lead || {}).name || session?.user?.name || ''); }, [doc, lead, session]);
  if (err) return <AppLayout><div className="lock-note show">{err}</div></AppLayout>;
  if (!doc) return <AppLayout><p className="purpose">Loading…</p></AppLayout>;

  const sum = row.summary || summarise(doc, refinements);
  const vt = verdictText(doc, sum);
  const dec = doc.decision;
  const ready = decisionReady(sum);
  const ci = conditionsInfo(doc);
  const o = outcomeInfo(doc);
  const approved = isApproved(doc);
  const reg = registerRecord(doc);
  const us = unitSpec(doc, refinements);
  const mod = doc.moderator || {};
  const same = lead && mod.name && lead.trim().toLowerCase() === mod.name.trim().toLowerCase();
  const act = (fn) => { const trial = JSON.parse(JSON.stringify(doc)); const res = fn(trial); if (!res.ok) { setMsg(res.reason); return null; } setMsg(''); update((d) => fn(d)); return res; };
  const copy = async (t, w) => { try { await navigator.clipboard.writeText(t); setCopied(w + ' copied.'); } catch { setCopied('Could not copy - select the text.'); } };
  const previewProvider = async () => { const r = await fetch('/api/entries/' + encodeURIComponent(id) + '/provider-view'); setPv(r.ok ? await r.json() : { error: r.status }); };
  const vcls = sum.vcls === 'ok' ? 'v-ok' : (sum.vcls === 'warn' ? 'v-warn' : (sum.vcls === 'bad' ? 'v-bad' : 'v-idle'));

  return (
    <AppLayout>
      <CaseShell id={id} doc={doc} summary={sum} refinements={refinements} saveState={saveState} failed={failed} approveBar={approved ? (<div className={'sf-approve' + (sum.drift ? ' drift' : (o.accDate ? ' done' : ''))}>
            {sum.drift ? <span>Signed decision no longer matches the matrix — resolve it above before anything is issued or dated.</span>
              : (!o.accDate ? <button className="sf-approve-btn" onClick={() => act((d) => approveMaterial(d, sum))}>✓ Approve this material — confirm accreditation &amp; set the dates</button>
                : <><span>✓ Accredited {o.accDate} · renews {o.expDate} · {o.accRef}{o.approvedBy ? ' · issued by ' + o.approvedBy : ''}</span><button className="rfb btn-tiny" onClick={() => { if (confirm('Clear the recorded accreditation dates for this entry?')) update((d) => clearApproval(d)); }}>Clear dates</button></>)}
          </div>) : null}>
        {failed && <div className="alert alert-bad">{saveState} <button className="btn btn-tiny" onClick={reload}>Reload</button></div>}
        <section className="stage active">
        <div className={'verdict ' + vcls}>
          <div className="verdict__badge">{dec && dec.verdict ? 'Signed ' + (dec.signedAt || '').slice(0, 10) + ' by ' + dec.by.name + ' - rule C2' : 'Computed outcome - rule C2'}{o.appRef ? ' - ' + o.appRef : ''}</div>
          <h2>{vt.title}</h2><p>{vt.text}</p>
        </div>
        {msg && <div className="lock-note show">{msg}</div>}

        {(dec && dec.verdict) ? (
          <div className={'dec-sign ' + (sum.drift ? 'drift' : 'signed')}>
            <div className="dec-row"><span className="dec-tag">Signed decision</span> <b>{dec.verdict}</b> · {dec.pct}% of points · gates {dec.gM}/{dec.gT} · framework v{dec.framework}</div>
            <div className="dec-row">By <b>{dec.by.name}</b>{dec.by.initials ? ' (' + dec.by.initials + ')' : ''} on {when(dec.signedAt)}{dec.moderator && dec.moderator.name ? ' · moderated by ' + dec.moderator.name : ' · no moderator name on record'}{dec.samePerson ? <> · <b>lead and moderator were the same person - recorded</b></> : null}</div>
            {sum.drift && <div className="dec-drift">The computed outcome has moved since signing: now <b>{sum.computed}</b> at {sum.pct}% (gates {sum.gM}/{sum.gT}). Either revert the change in the matrix or withdraw the signature and re-sign. Nothing new is issued while this stands.</div>}
            {(doc.decisionLog || []).length > 0 && <div className="dec-row muted">Earlier signatures withdrawn: {doc.decisionLog.map((x) => x.verdict + ' by ' + ((x.by || {}).name || '?') + ' (' + (x.signedAt || '').slice(0, 10) + ', withdrawn ' + (x.withdrawnAt || '').slice(0, 10) + ')').join('; ')}</div>}
            <div className="dec-row"><button className="rfb btn-tiny" onClick={() => { if (confirm('Withdraw the decision signed by ' + dec.by.name + ' on ' + (dec.signedAt || '').slice(0, 10) + '?' + (o.approvedBy || (doc.outcome || {}).approvedAt ? '\n\nThe recorded accreditation dates are cleared too. Anything already issued from them (certificate, register row, mark) is yours to recall.' : '') + '\n\nThe matrix and every note stay as they are; the withdrawn signature is kept on the entry.')) act((d) => withdrawDecision(d)); }}>Withdraw signature</button></div>
          </div>
        ) : ready ? (
          <div className="dec-sign ready">
            <div className="dec-row"><span className="dec-tag">Ready to sign</span> Rule C2 computed <b>{sum.computed}</b> - {sum.pct}% of points, gates {sum.gM}/{sum.gT}, moderation approved. Signing records who issued it, when, and on which numbers; it does not change the outcome.</div>
            <div className="dec-row dec-form"><label htmlFor="lead-name">Lead assessor</label><input id="lead-name"  value={lead || ''} onChange={(e) => setLead(e.target.value)} placeholder="Full name" /><button className="rfa" disabled={!(lead || '').trim()} onClick={() => { if (confirm('Sign the decision "' + sum.computed + '" (' + sum.pct + '% of points, gates ' + sum.gM + '/' + sum.gT + ') as ' + lead.trim() + '?\n\nThis is the record the certificate, register listing and client page are issued from. It does not change the outcome - rule C2 computed it.' + (same ? '\n\nYou are also the moderator on this case. That will be recorded on the decision.' : ''))) act((d) => signDecision(d, sum, lead)); }}>Sign the decision</button></div>
            <div className="dec-row muted">{same ? 'You are also the moderator on this case - that will be recorded on the decision.' : (mod.name ? 'Moderated by ' + mod.name + '.' : 'No moderator name is on record in Stage 5 - the decision will say so.')}</div>
            {sum.computed === 'Accredited w/ conditions' && !ci.open.length && <div className="dec-drift">70-84% band: name the conditions in the Stage 6 register before signing - the band has to say what it means.</div>}
          </div>
        ) : null}

        <div className="panel">
          <h3 className="sect">Scorecard by standard (applicable scored indicators)</h3>
          {scorecard(doc, refinements).map((s) => <div key={s.std} className={'dim ' + (s.cls === 'low' ? 'red' : (s.cls === 'mid' ? 'amber' : 'green'))}><span className="dl">{s.std}. {s.name}</span><span className="track"><span className="fill" style={{ width: (s.pct || 0) + '%' }} /></span><span className="dv">{s.pct == null ? 'no scored rows' : s.pct + '%'}{s.gF ? ' · ' + s.gF + ' gate' + (s.gF > 1 ? 's' : '') + ' failing' : ''}</span></div>)}
          <p className="purpose">Applicable: {sum.app} indicators. Gates: {sum.gM} met, {sum.gF} failing. Scored points: {sum.pct}%.</p>
        </div>


        <div className={'panel deliverables' + (approved && !sum.drift ? '' : ' locked')}>
          <h2>On approval — what the provider receives</h2>
          {!(approved && !sum.drift) && <p className="purpose">These deliverables unlock when the decision is signed as Accredited (or Accredited with conditions) above. Nothing here is issued from the live arithmetic, and nothing for an in-progress, held or refused submission.</p>}
          {approved && !sum.drift && (
            <>
              <div className="grid2">
                <div className="field"><label>Accreditation no.</label><input  value={(doc.outcome || {}).accRef || ''} placeholder={o.accRef} onChange={(e) => update((d) => { d.outcome = d.outcome || {}; d.outcome.accRef = e.target.value; })} /></div>
                <div className="field"><label>Accredited (date)</label><input  value={(doc.outcome || {}).accDate || ''} placeholder="e.g. 18 September 2026" onChange={(e) => update((d) => { d.outcome = d.outcome || {}; d.outcome.accDate = e.target.value; })} /></div>
                <div className="field"><label>Valid until</label><input  value={(doc.outcome || {}).expDate || ''} placeholder="e.g. 17 September 2029" onChange={(e) => update((d) => { d.outcome = d.outcome || {}; d.outcome.expDate = e.target.value; })} /></div>
              </div>
              <div className="cards">
                <div className="case-card"><h3>1 · Unit specification &amp; certificate</h3><p className="purpose">The formal accreditation document - the provider's record of exactly what was accredited (activity, hours, mode, dates, scope and the A5 boundary), with the certificate front page.</p><button className="rfb" onClick={() => setSpec(true)}>Preview / print unit specification →</button></div>
                <div className="case-card"><h3>2 · Register listing</h3><p className="purpose">The register comes from this signed, dated decision automatically - the public verify lookup answers for {reg.accRef} the moment the dates are set. The row below is for the static website's register file until it is pointed at the platform.</p>
                  <dl className="us-dl">{[['Accreditation no.', reg.accRef], ['Activity', reg.activity], ['Provider', reg.provider], ['CPD hours', reg.hours || '—'], ['Mode', reg.mode], ['Status', reg.status], ['Accredited', reg.accDate || '—'], ['Expires', reg.expDate || '—']].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                  <p className="verify-string">{reg.verify}</p>
                  <div className="act-row"><button className="rfb btn-tiny" onClick={() => copy(reg.rowText, 'Register row')}>Copy register row (for register-db.js)</button><button className="rfb btn-tiny" onClick={() => copy(reg.verify, 'Verify text')}>Copy verify text</button></div></div>
                <div className="case-card"><h3>3 · Accreditation badge &amp; verification</h3><div className="badge-mark"><div className="bm-cpd">CPD</div><div className="bm-acc">ACCREDITED</div><div className="bm-hours">{reg.hours ? reg.hours + ' CPD hours' : 'CPD accredited'}</div><div className="bm-ref">{reg.accRef}</div></div><p className="purpose">Verify at <code>{reg.verifyUrl}</code>. QR: a scan-tested encoder is added at deployment; the placeholder shows the exact URL.</p></div>
                <div className="case-card"><h3>4 · Congratulations email</h3><p className="purpose">Drafts the approval email - reference, hours, dates, what they receive, the A5 scope reminder and mark rules{ci.all.length ? ', and the conditions' : ''}.</p><button className="rfb" onClick={() => setMail(composeCongratsEmail(doc))}>Compose congratulations email →</button></div>
              </div>
              {mail && <Mail mail={mail} setMail={setMail} />}
            </>
          )}
          {copied && <p className="purpose">{copied}</p>}
        </div>

        <div className="panel">
          <div className="stage-head"><h2>What the provider sees</h2><button className="rfb btn-tiny" onClick={previewProvider}>Preview the portal view</button></div>
          <p className="purpose">The provider's case page in their portal shows only what has been communicated: returned items, notices sent, the fix window, the signed outcome, conditions, review dates. Preview it before anything is said.</p>
          {pv && pv.view && <div className="pv"><p><b>{pv.view.headline}</b>{!pv.linked ? <span className="muted"> · not linked to a provider organisation yet (Admin → Organisations)</span> : null}</p><ol className="milestones">{pv.view.milestones.map((m) => <li key={m.name} className={m.status}><span className="tag">{{ done: 'Complete', progress: 'With us now', notstarted: 'Not yet', action: 'Needs you' }[m.status]}</span><b>{m.name}</b></li>)}</ol>{pv.view.outcome && <p>Outcome shown: <b>{pv.view.outcome.state}</b>{pv.view.outcome.accRef ? ' · ' + pv.view.outcome.accRef : ''}</p>}{pv.view.asks.length > 0 && <p>{pv.view.asks.length} open ask{pv.view.asks.length === 1 ? '' : 's'} shown.</p>}{pv.view.conditions.length > 0 && <p>{pv.view.conditions.length} condition{pv.view.conditions.length === 1 ? '' : 's'} shown.</p>}</div>}
          {pv && pv.error && <div className="lock-note show">Could not load the preview ({pv.error}).</div>}
        </div>

        {spec && (
          <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setSpec(false); }}>
            <div className="unitspec">
              <div className="act-row no-print"><button className="rfa" onClick={() => window.print()}>Print</button><button className="rfb btn-tiny" onClick={() => setSpec(false)}>Close</button></div>
              <div className="us-head"><div className="us-brand">CPD Accreditation Scheme</div><div className="us-title">Unit Specification &amp; Certificate of Accreditation</div></div>
              <div className="us-cert"><div><div className="us-activity">{us.activity}</div><div className="us-provider">{us.provider}</div>
                <dl className="us-dl"><div><dt>Accreditation no.</dt><dd>{us.accRef}</dd></div><div><dt>CPD hours</dt><dd>{us.hours || '—'} (independently derived)</dd></div><div><dt>Delivery mode</dt><dd>{us.mode}</dd></div><div><dt>Accredited</dt><dd>{us.accDate || '—'}</dd></div><div><dt>Valid until</dt><dd>{us.expDate || '—'} (annual surveillance applies)</dd></div>{us.status.cond && <div><dt>Status</dt><dd>Accredited with conditions — {us.conditions} named action{us.conditions === 1 ? '' : 's'} verified at first surveillance</dd></div>}<div><dt>Decision signed</dt><dd>{us.dec ? us.dec.by.name + ', ' + (us.dec.signedAt || '').slice(0, 10) : '—'}</dd></div></dl></div>
                <div className="us-qr"><div className="qr-ph">QR</div><div className="muted">Verify at<br /><code>{us.verifyUrl}</code></div></div></div>
              <div className="us-section"><h4>What this accreditation certifies</h4><p>The named activity has been assessed against the CPD Accreditation Framework (v{us.framework}, {us.total} indicators across six standards; issued in full to every applicant) and meets it: {us.metCount} applicable indicators scored with cited evidence, all mandatory gates met, {us.modLine}. Accreditation is per-activity and time-limited, with annual surveillance.</p></div>
              <div className="us-section"><h4>Scope &amp; limits</h4><p>This badge means the activity meets the CPD framework. It is <b>not</b> a verification, endorsement or guarantee of the truth or legality of the content — the provider warrants its own accuracy and lawfulness. The mark must not be represented as anything more.</p></div>
              <div className="us-foot">CPD Accreditation Scheme · continuingprofessionaldevelopment.co.uk · This document is verifiable at the URL above.</div>
            </div>
          </div>
        )}
        </section>
      </CaseShell>
    </AppLayout>
  );
}
