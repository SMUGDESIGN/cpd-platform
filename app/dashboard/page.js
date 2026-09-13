'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../AppLayout';

/* The caseload, from the database. `summary` is the tool's own scoreEntry()
   result stored at save time, so this page shows the verdict the tool
   computed and never re-implements rule C2. Rank order mirrors the tool's
   dashRank(): needs action, then with provider, then in progress, then final. */
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
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/entries').then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setRows(d.entries)).catch((e) => setErr('Could not load the caseload (' + e + ').'));
  }, []);
  const sorted = (rows || []).slice().sort((a, b) => rank(a.summary, a.review) - rank(b.summary, b.review) || (a.ref || '').localeCompare(b.ref || ''));
  return (
    <AppLayout>
      <div className="page-head">
        <h1>Caseload</h1>
        <Link href="/tool" className="btn btn--primary">Open the assessment tool</Link>
      </div>
      {err && <div className="alert alert--error">{err}</div>}
      {rows && !rows.length && (
        <div className="panel">
          <p><strong>No cases yet.</strong> Open the assessment tool and start one, or import a backup file there - every case saves to this database from now on.</p>
        </div>
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
                    <td><Link href={'/cases/' + encodeURIComponent(r.id)} className="ref">{r.ref || '—'}</Link> <Link href={'/tool?entry=' + encodeURIComponent(r.id)} className="muted" title="Open in the assessment tool">tool</Link></td>
                    <td>{r.activity || 'New entry'}</td>
                    <td>{r.provider || '—'}</td>
                    <td><div className="stages">{[1,2,3,4,5,6,7,8].map((i) => <span key={i} className={'sq ' + (st[i] || 'none')} title={'Stage ' + i}>{i}</span>)}</div></td>
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
