'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppLayout from '../AppLayout';

/* The caseload. `summary` is lib/scoring.summarise() as saved by whichever
   stage page last touched the case, so this list never re-implements rule
   C2. Rank order: needs action, then overdue review, then with provider,
   then in progress, then final, then not started. */
function rank(s, review) {
  if (!s) return 4;
  if (s.drift || s.vcls === 'bad') return 0;
  if (review && review.flag === 'overdue') return 0.5;
  if (s.vcls === 'warn') return 1;
  if (s.ans > 0 && !s.fullyJudged) return 2;
  if (s.ans === 0) return 4;
  return 3;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(false);
  const [f, setF] = useState({ activity: '', provider: '', orgId: '' });
  const load = useCallback(() => {
    fetch('/api/entries').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => setRows(d.entries)).catch((e) => setErr('Could not load the caseload (' + e + ').'));
    fetch('/api/admin/organisations').then((r) => (r.ok ? r.json() : { organisations: [] })).then((d) => setOrgs(d.organisations || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const canEdit = ['superadmin', 'assessor', 'moderator', 'coordinator'].includes(session?.user?.role);
  const start = async (e) => {
    e.preventDefault(); setErr('');
    const r = await fetch('/api/entries/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || 'Could not start the case.'); return; }
    router.push('/cases/' + encodeURIComponent(d.id) + '/stage-1');
  };
  const sorted = (rows || []).slice().sort((a, b) => rank(a.summary, a.review) - rank(b.summary, b.review) || (a.ref || '').localeCompare(b.ref || ''));
  return (
    <AppLayout>
      <div className="page-head"><h1>Caseload</h1>{canEdit && <button className="btn btn--primary" onClick={() => setStarting(!starting)}>{starting ? 'Cancel' : 'Start a case'}</button>}</div>
      {err && <div className="alert alert--error">{err}</div>}
      {starting && (
        <div className="panel">
          <h2>Start a case</h2>
          <p className="muted">For an application that did not come through the portal. Provider applications submitted on the portal appear here on their own.</p>
          <form onSubmit={start} className="act-row">
            <input className="input" placeholder="Activity title" value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} />
            <select className="input" value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value })}><option value="">Provider organisation (optional)</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            {!f.orgId && <input className="input" placeholder="Provider name, if not on the platform" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />}
            <button className="btn btn--primary" type="submit">Open at Stage 1</button>
          </form>
        </div>
      )}
      {rows && !rows.length && (
        <div className="panel"><p><strong>No cases yet.</strong> Provider applications submitted on the portal appear here; or start one above.</p></div>
      )}
      {sorted.length > 0 && (
        <div className="panel panel--table">
          <table className="table">
            <thead>
              <tr><th>Ref</th><th>Activity</th><th>Provider</th><th>Stages 1-8</th><th>Gates</th><th>Score</th><th>Review due</th><th>Status</th><th>Saved</th><th>By</th></tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const s = r.summary || {};
                const st = s.stages || {};
                return (
                  <tr key={r.id}>
                    <td><Link href={'/cases/' + encodeURIComponent(r.id)} className="ref">{r.ref || '—'}</Link></td>
                    <td>{r.activity || 'New entry'}</td>
                    <td>{r.org_name || r.provider || '—'}</td>
                    <td><div className="stages">{[1,2,3,4,5,6,7,8].map((i) => <Link key={i} href={'/cases/' + encodeURIComponent(r.id) + '/stage-' + i} className={'sq ' + (st[i] || 'none')} title={'Stage ' + i}>{i}</Link>)}</div></td>
                    <td>{s.gT ? `${s.gM}/${s.gT}${s.gF ? ' · ' + s.gF + ' failing' : ''}` : '—'}</td>
                    <td>{s.app ? s.pct + '%' : '—'}</td>
                    <td>{r.review ? <span className={'status ' + (r.review.flag === 'overdue' ? 'bad' : (r.review.flag === 'due' ? 'warn' : 'idle'))} title={r.review.label}>{r.review.short}</span> : '—'}</td>
                    <td><span className={'status ' + (s.vcls || 'idle')}>{s.verdict || 'Not started'}</span></td>
                    <td className="nowrap">{(r.updated_at || '').slice(0, 10)}</td>
                    <td>{r.updated_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
