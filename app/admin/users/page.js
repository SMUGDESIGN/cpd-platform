'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '../../AppLayout';
import AdminNav from '../AdminNav';
import { when } from '../../money';

/* THE CPD TEAM - the Hub's team directory, on the platform. Cards with a
   coloured initials cover and the role in the corner, or the same people as
   a table; search finds anyone. Clicking a person opens their panel: contact
   details and a Message for everyone. A super admin also has an Edit link on
   each card and row that opens the account controls (role, access,
   password) - nobody else sees it; support reads the team, keeps phone
   numbers current and messages people. Provider logins live on their
   organisation's page and are folded away at the foot here. */
const STAFF = ['superadmin', 'support', 'assessor', 'moderator', 'coordinator'];
const LABEL = { superadmin: 'Super admin', support: 'Support', assessor: 'Assessor', moderator: 'Moderator', coordinator: 'Coordinator', provider: 'Provider' };
const BLURB = { superadmin: 'runs the whole platform and sees everything', support: 'looks after accounts, organisations and billing, and runs Stage 1', assessor: 'runs cases and signs decisions', moderator: 'second assessor - Stage 5 only', coordinator: 'intake - Stage 1 and returns', provider: 'a provider organisation login' };
const PALETTE = [['#211A5E', '#4B3FA6'], ['#7a3b62', '#a85a86'], ['#2f5d4a', '#4f8f72'], ['#7a4b26', '#a8763f'], ['#1f5f63', '#0A7A6E'], ['#3c4c75', '#5b6ea8']];
const look = (name) => { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

export default function Users() {
  const [rows, setRows] = useState(null);
  const [me, setMe] = useState({});
  const [f, setF] = useState({ name: '', email: '', role: 'assessor' });
  const [pw, setPw] = useState(null);
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState('');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState('cards');
  const [viewing, setViewing] = useState(null); // { id, mode: 'view' | 'edit' }
  const [note, setNote] = useState(null);
  const [phone, setPhone] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => fetch('/api/admin/users').then((r) => r.json()).then((d) => { setRows(d.users); setMe(d.me || {}); }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { const s = window.localStorage.getItem('cpd.team.layout'); if (s === 'table' || s === 'cards') setLayout(s); } catch (e) {} }, []);
  const chooseLayout = (v) => { setLayout(v); try { window.localStorage.setItem('cpd.team.layout', v); } catch (e) {} };
  const superMe = me.role === 'superadmin';
  const canPhone = (u) => superMe || me.id === u.id || (me.role === 'support' && u.role !== 'superadmin');
  const call = async (url, body, method) => {
    setMsg('');
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(x.error || 'That did not save.'); return null; }
    await load(); return x;
  };
  const staff = (rows || []).filter((u) => u.role !== 'provider');
  const providers = (rows || []).filter((u) => u.role === 'provider');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((u) => !q || u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (LABEL[u.role] || '').toLowerCase().includes(q) || (u.phone || '').includes(q));
  }, [staff, search]);
  /* the open panel follows the list, so a change made in it shows at once */
  const open = viewing ? (rows || []).find((u) => u.id === viewing.id) || null : null;
  const editing = !!(open && viewing.mode === 'edit' && superMe);
  const view = (u) => setViewing({ id: u.id, mode: 'view' });
  const editUser = (e, u) => { e.stopPropagation(); setViewing({ id: u.id, mode: 'edit' }); };

  const Card = ({ u }) => {
    const [a, b] = look(u.name);
    return (
      <div className="tcard" role="button" tabIndex={0} onClick={() => view(u)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view(u); } }}>
        <div className={'tcard__cover' + (u.active ? '' : ' tcard__cover--off')} style={{ background: 'linear-gradient(135deg, ' + a + ', ' + b + ')' }}>
          <span className="tcard__initials">{initials(u.name)}</span>
          <span className="tcard__corner">{LABEL[u.role] || u.role}</span>
          {superMe && <button type="button" className="tcard__edit" onClick={(e) => editUser(e, u)} title="Edit this account">Edit</button>}
          {me.id === u.id && <span className="tcard__label">You</span>}
          {!u.active && <span className="tcard__label tcard__label--off">Deactivated</span>}
        </div>
        <div className="tcard__body">
          <span className="tcard__title">{u.name}</span>
          <span className="tcard__line">{u.email}</span>
          <span className="tcard__line">{u.phone ? <a href={'tel:' + u.phone.replace(/\s+/g, '')} onClick={(e) => e.stopPropagation()}>{u.phone}</a> : <span className="muted">no phone</span>}</span>
          <span className="tcard__line muted">{u.last_login ? 'Signed in ' + when(u.last_login) : 'Never signed in'}</span>
        </div>
      </div>
    );
  };

  return (
    <AppLayout side={<AdminNav />}>
      <div className="page-head">
        <div><h1>The CPD Team</h1><p className="muted" style={{ margin: 0 }}>{staff.length} people · {staff.filter((u) => u.active).length} active</p></div>
        {superMe && <button className="btn btn--primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'New member of staff'}</button>}
      </div>
      {msg && <div className="alert alert--error">{msg}</div>}
      {sent && <div className="alert alert--ok">{sent}</div>}
      {pw && <div className="alert alert--ok">Account created for {pw.user.email}. One-time password, shown once: <code>{pw.password}</code></div>}
      {adding && superMe && (
        <div className="panel">
          <h2>New member of staff</h2>
          <form className="act-row" onSubmit={async (e) => { e.preventDefault(); const x = await call('/api/admin/users', f, 'POST'); if (x) { setPw(x); setF({ name: '', email: '', role: 'assessor' }); setAdding(false); } }}>
            <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
            <input className="input" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{STAFF.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}</select>
            <button className="btn btn--primary" type="submit">Create</button>
          </form>
          <p className="muted">{STAFF.map((r) => <span key={r}><b>{LABEL[r]}</b> {BLURB[r]}. </span>)}</p>
        </div>
      )}
      {!superMe && <p className="muted">Read-only for support: accounts, roles, access and passwords are a super admin's. You can keep phone numbers current and message anyone here.</p>}

      <div className="filters-bar">
        <input className="input" type="search" placeholder="Search by name, email, role or phone…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
        <div className="segmented" role="group" aria-label="Layout">
          <button type="button" className={layout === 'cards' ? 'on' : ''} onClick={() => chooseLayout('cards')}>Cards</button>
          <button type="button" className={layout === 'table' ? 'on' : ''} onClick={() => chooseLayout('table')}>Table</button>
        </div>
      </div>

      {rows && !shown.length && <div className="panel"><p className="muted">{search ? 'Nobody matches that.' : 'Nobody on the team yet.'}</p></div>}
      {rows && shown.length > 0 && layout === 'cards' && (
        <div className="panel"><div className="cardgrid">{shown.map((u) => <Card key={u.id} u={u} />)}</div></div>
      )}
      {rows && shown.length > 0 && layout === 'table' && (
        <div className="panel panel--table">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Last sign-in</th><th>Status</th>{superMe && <th></th>}</tr></thead>
            <tbody>{shown.map((u) => (
              <tr key={u.id} className={'row-link' + (u.active ? '' : ' inactive')} onClick={() => view(u)}>
                <td><b>{u.name}</b>{me.id === u.id ? <span className="muted"> - you</span> : null}</td>
                <td>{LABEL[u.role] || u.role}</td><td>{u.email}</td><td className="nowrap">{u.phone || <span className="muted">—</span>}</td>
                <td className="nowrap">{u.last_login ? when(u.last_login) : '—'}</td>
                <td><span className={'status ' + (u.active ? 'ok' : 'bad')}>{u.active ? 'active' : 'deactivated'}</span></td>
                {superMe && <td className="nowrap"><button type="button" className="btn btn--tiny" onClick={(e) => editUser(e, u)}>Edit</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {providers.length > 0 && (
        <details className="panel panel--fold">
          <summary>Provider people ({providers.length}) - the logins that belong to organisations; managed from each organisation's page</summary>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Organisation</th><th>Last sign-in</th><th>Status</th></tr></thead>
            <tbody>{providers.map((u) => <tr key={u.id} className={u.active ? '' : 'inactive'}><td>{u.name}</td><td>{u.email}</td><td>{u.org_name}</td><td className="nowrap">{u.last_login ? when(u.last_login) : '—'}</td><td><span className={'status ' + (u.active ? 'ok' : 'bad')}>{u.active ? 'active' : 'deactivated'}</span></td></tr>)}</tbody>
          </table>
        </details>
      )}

      {open && (
        <>
          <div className="modal-backdrop" onClick={() => { setViewing(null); setNote(null); setPhone(null); }} />
          <div className="modal" role="dialog" aria-label={open.name}>
            <div className="modal__head">
              <div className="tcard__cover tcard__cover--small" style={{ background: 'linear-gradient(135deg, ' + look(open.name)[0] + ', ' + look(open.name)[1] + ')' }}><span className="tcard__initials">{initials(open.name)}</span></div>
              <div><h2 style={{ margin: 0 }}>{open.name}{me.id === open.id ? <span className="muted"> - you</span> : null}</h2><p className="muted" style={{ margin: 0 }}>{LABEL[open.role]} - {BLURB[open.role]}.</p></div>
              <button type="button" className="modal__close" onClick={() => { setViewing(null); setNote(null); setPhone(null); }} aria-label="Close">×</button>
            </div>
            <div className="modal__body">
              <dl className="kv">
                <dt>Email</dt><dd><a href={'mailto:' + open.email}>{open.email}</a></dd>
                <dt>Phone</dt><dd>
                  {phone === null
                    ? <>{open.phone ? <a href={'tel:' + open.phone.replace(/\s+/g, '')}>{open.phone}</a> : <span className="muted">not set</span>}{canPhone(open) && <button className="btn btn--tiny" style={{ marginLeft: 8 }} onClick={() => setPhone(open.phone || '')}>Edit</button>}</>
                    : <form className="act-row" onSubmit={async (e) => { e.preventDefault(); const x = await call('/api/admin/users/' + open.id, { phone }, 'PUT'); if (x) setPhone(null); }}><input className="input input--inline" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus /><button className="btn btn--tiny" type="submit">Save</button><button className="btn btn--tiny" type="button" onClick={() => setPhone(null)}>Cancel</button></form>}
                </dd>
                <dt>Status</dt><dd><span className={'status ' + (open.active ? 'ok' : 'bad')}>{open.active ? 'active' : 'deactivated'}</span></dd>
                <dt>Last sign-in</dt><dd>{open.last_login ? when(open.last_login) : 'never'}</dd>
                <dt>Joined</dt><dd>{when(open.created_at)}</dd>
              </dl>
              {me.id !== open.id && open.active && (
                note === null
                  ? <p><button className="btn" onClick={() => { setSent(''); setNote({ title: '', body: '' }); }}>Message {open.name.split(' ')[0]}</button> <span className="muted">Lands under their bell, and in their email straight away if they take email.</span></p>
                  : <form className="form-narrow" onSubmit={async (e) => { e.preventDefault(); const x = await call('/api/admin/users/' + open.id, { action: 'message', title: note.title, body: note.body }, 'POST'); if (x) { setSent('Sent to ' + open.name + '.'); setNote(null); setViewing(null); } }}>
                    <div className="field"><label>Subject</label><input className="input" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} required autoFocus /></div>
                    <div className="field"><label>Message</label><textarea className="input" rows={4} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} /></div>
                    <p className="act-row"><button className="btn btn--primary" type="submit">Send</button><button className="btn" type="button" onClick={() => setNote(null)}>Cancel</button></p>
                  </form>
              )}
              {editing && (
                <div className="modal__admin">
                  <h3>Account</h3>
                  <p className="act-row">
                    {me.id !== open.id
                      ? <label className="act-row">Role <select className="input input--inline" value={open.role} onChange={(e) => call('/api/admin/users/' + open.id, { role: e.target.value }, 'PUT')}>{STAFF.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}</select></label>
                      : <span className="muted">Your own role is changed by another super admin.</span>}
                    <button className="btn btn--tiny" onClick={async () => { const x = await call('/api/admin/users/' + open.id, { action: 'reset-password' }, 'POST'); if (x) setPw({ user: open, password: x.password }); }}>Reset password</button>
                    {me.id !== open.id && <button className="btn btn--tiny" onClick={() => call('/api/admin/users/' + open.id, { active: !open.active }, 'PUT')}>{open.active ? 'Deactivate' : 'Reactivate'}</button>}
                  </p>
                  <p className="muted">Remove = deactivate. An account is never deleted: a signed decision names a person and that name must resolve for ever.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
