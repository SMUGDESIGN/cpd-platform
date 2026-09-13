'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/* One case, loaded from the platform and saved back with the version it
   read, so two people can have the same case open and the second saver is
   told, never overwritten.
   `update(fn)` mutates a copy and schedules a debounced save; the summary
   passed in is what the caseload shows. */
export function useCase(id, summarise) {
  const [row, setRow] = useState(null);
  const [refinements, setRefinements] = useState({});
  const [err, setErr] = useState('');
  const [saveState, setSaveState] = useState('');
  const version = useRef(null);
  const timer = useRef(null);
  const pendingDoc = useRef(null);

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([fetch('/api/entries/' + encodeURIComponent(id)), fetch('/api/refinements')]);
    if (!r1.ok) { setErr(r1.status === 403 ? 'Your role can read this case but not open it for editing.' : 'Could not load the case (' + r1.status + ').'); return; }
    const d = await r1.json();
    const rf = r2.ok ? (await r2.json()).refinements || {} : {};
    version.current = d.version;
    setRow(d); setRefinements(rf); setErr('');
    setSaveState('loaded · version ' + d.version + (d.updated_by_name ? ' · last saved by ' + d.updated_by_name : ''));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    timer.current = null;
    const doc = pendingDoc.current; if (!doc) return;
    pendingDoc.current = null;
    const summary = summarise ? summarise(doc, refinements, row?.summary) : row?.summary;
    const r = await fetch('/api/entries/' + encodeURIComponent(id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc, summary, version: version.current }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { version.current = j.version; setRow((p) => ({ ...p, doc, summary, version: j.version })); setSaveState('saved ' + new Date().toTimeString().slice(0, 8) + ' · version ' + j.version); return; }
    if (r.status === 409) { setSaveState('SAVE FAILED - ' + (j.by ? j.by + ' saved this case after you opened it.' : 'saved elsewhere.') + ' Reload to see their version; your last change is not saved.'); return; }
    if (r.status === 403) { setSaveState('SAVE FAILED - ' + (j.error || 'not allowed for your role')); return; }
    setSaveState('SAVE FAILED - ' + (j.error || 'server error ' + r.status));
  }, [id, refinements, row, summarise]);

  const update = useCallback((fn) => {
    setRow((p) => {
      if (!p) return p;
      const doc = JSON.parse(JSON.stringify(p.doc));
      fn(doc);
      doc.savedAt = new Date().toISOString();
      pendingDoc.current = doc;
      return { ...p, doc };
    });
    setSaveState('saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }, [flush]);

  /* the proposal queue is model-level: replace the whole set */
  const saveRefinements = useCallback(async (next) => {
    setRefinements(next);
    const r = await fetch('/api/refinements', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refinements: next }) });
    if (!r.ok) setSaveState('SAVE FAILED - refinements not saved (' + r.status + ')');
  }, []);

  return { row, doc: row?.doc, refinements, err, saveState, update, saveRefinements, reload: load, failed: saveState.startsWith('SAVE FAILED') };
}
