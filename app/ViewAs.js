'use client';
import { useCallback, useEffect, useState } from 'react';

const LABEL = { support: 'Support', assessor: 'Assessor', moderator: 'Moderator', coordinator: 'Coordinator', provider: 'Provider' };

/* The strip a superadmin sees while testing: pick a role (and an
   organisation for provider), the whole platform answers as that role until
   "Back to super admin". Rendered only when /api/view-as says it is
   available - i.e. the real account is a superadmin - so nobody else ever
   sees a control that would do nothing for them. */
export default function ViewAs() {
  const [d, setD] = useState(null);
  const [role, setRole] = useState('');
  const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/view-as').then((r) => (r.ok ? r.json() : null)).then((x) => { setD(x); if (x?.viewingAs) { setRole(x.viewingAs); if (x.orgId) setOrg(String(x.orgId)); } }).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!d || !d.available) return null;
  const go = async () => {
    if (!role) return;
    setBusy(true);
    const r = await fetch('/api/view-as', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, orgId: org }) });
    setBusy(false);
    if (r.ok) window.location.href = role === 'provider' ? '/portal' : '/dashboard';
  };
  const back = async () => { setBusy(true); await fetch('/api/view-as', { method: 'DELETE' }); window.location.href = '/dashboard'; };
  return (
    <div className={'viewas' + (d.viewingAs ? ' on' : '')} role="status">
      <div className="viewas__inner">
        {d.viewingAs
          ? <span className="viewas__text">Viewing as <b>{LABEL[d.viewingAs]}</b>{d.viewingAs === 'provider' && d.orgId ? <> · {(d.organisations.find((o) => o.id === d.orgId) || {}).name}</> : null} — every page and every API answers as this role would see it. Your own account is untouched.</span>
          : <span className="viewas__text"><b>Super admin.</b> View the platform as another role while testing:</span>}
        <span className="viewas__ctl">
          <select className="input input--inline" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
            <option value="">Choose a role…</option>
            {d.roles.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}
          </select>
          {role === 'provider' && (
            <select className="input input--inline" value={org} onChange={(e) => setOrg(e.target.value)} disabled={busy}>
              <option value="">Which organisation…</option>
              {d.organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button type="button" className="btn btn--tiny btn--primary" disabled={busy || !role || (role === 'provider' && !org)} onClick={go}>{d.viewingAs ? 'Switch' : 'View as'}</button>
          {d.viewingAs && <button type="button" className="btn btn--tiny" disabled={busy} onClick={back}>Back to super admin</button>}
        </span>
      </div>
    </div>
  );
}
