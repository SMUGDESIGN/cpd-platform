'use client';
import { useEffect, useState } from 'react';
import AppLayout from '../AppLayout';

/* The proposal queue to the Standards Panel: every refinement made in the
   stage pages, with who, when and why. Read-only here; the Refine buttons are where they are
   made, and DECISIONS.md is where they are decided. */
export default function Proposals() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    fetch('/api/refinements').then((r) => r.json()).then((d) => {
      setItems(Object.keys(d.refinements || {}).sort().map((id) => ({ id, ...d.refinements[id] })));
    }).catch(() => setItems([]));
  }, []);
  return (
    <AppLayout>
      <h1>Proposals to the Standards Panel</h1>
      {items && !items.length && <div className="panel"><p>No refinements proposed yet. They are made from the Refine button beside any item in the assessment tool.</p></div>}
      {items && items.length > 0 && (
        <div className="panel panel--table">
          <table className="table">
            <thead><tr><th>Item</th><th>Proposal</th><th>Reason</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="ref">{p.id}</td>
                  <td>{p.notNeeded ? <em>Not needed</em> : null}{p.notNeeded && p.text ? ' · ' : ''}{p.text || ''}</td>
                  <td>{p.reason || '—'}</td>
                  <td>{p.by || '—'}</td>
                  <td className="nowrap">{(p.at || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
