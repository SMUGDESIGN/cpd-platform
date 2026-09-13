import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { requireProvider } from '@/lib/session';
import { providerView, askKeys } from '@/lib/providerView';
import { notify } from '@/lib/notify.server';

async function ownRow(id, orgId) {
  const { rows } = await query('SELECT id, ref, doc, summary, version, created_at, updated_at FROM entries WHERE id = $1 AND org_id = $2 AND archived_at IS NULL', [id, orgId]);
  return rows[0] || null;
}

export async function GET(_req, { params }) {
  const { orgId, res } = await requireProvider();
  if (res) return res;
  const row = await ownRow(params.id, orgId);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [notices, events] = await Promise.all([
    query('SELECT id, rag, message, snapshot, created_at, acknowledged_at, response FROM feedback_notices WHERE entry_id = $1 AND org_id = $2 ORDER BY created_at DESC', [row.id, orgId]),
    query('SELECT kind, message, at FROM portal_events WHERE entry_id = $1 AND org_id = $2 ORDER BY at DESC LIMIT 50', [row.id, orgId]),
  ]);
  return NextResponse.json({ view: providerView(row), feedback: notices.rows, events: events.rows });
}

/* The provider's two actions on a case - both written INTO the case document
   so the assessor sees them where they already look (the notice's reply
   thread, the return record), and into portal_events so nothing goes unread.
   The save bumps the document version like any other save; the tool learns
   of it as a "saved elsewhere" and reloads, which is right. */
export async function POST(req, { params }) {
  const { session, orgId, res } = await requireProvider();
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  const text = String(b.text || '').trim().slice(0, 4000);
  const who = session.user.name;
  const out = await withTransaction(async (tx) => {
    const { rows } = await tx('SELECT id, doc, version FROM entries WHERE id = $1 AND org_id = $2 AND archived_at IS NULL FOR UPDATE', [params.id, orgId]);
    const row = rows[0];
    if (!row) return { status: 404, error: 'Not found' };
    const doc = row.doc;
    const now = new Date().toISOString();
    let kind, message;
    if (b.action === 'items_sent') {
      const returns = doc.returns || [];
      const last = returns[returns.length - 1];
      if (!last) return { status: 400, error: 'Nothing has been returned on this case' };
      last.providerSentAt = now; last.providerNote = text; last.providerBy = who;
      doc.returns = returns;
      kind = 'items_sent'; message = 'Provider says the returned items have been sent' + (text ? ': ' + text : '');
    } else if (b.action === 'fix_reported') {
      const keys = askKeys(doc);
      const key = keys[Number(b.n) - 1];
      if (!key) return { status: 400, error: 'That item is not open' };
      const n = doc.notices[key];
      n.responses = n.responses || [];
      n.responses.push({ ts: now, text: 'Provider (' + who + '): ' + (text || 'reports this is now fixed'), from: 'provider' });
      if (b.fixed) n.providerFixedAt = now;
      kind = 'fix_reported'; message = (b.fixed ? 'Provider reports a fix done' : 'Provider replied') + ' on item ' + b.n + (text ? ': ' + text : '');
    } else {
      return { status: 400, error: 'Unknown action' };
    }
    doc.remediationLog = doc.remediationLog || [];
    doc.remediationLog.push({ id: 'l' + Date.now(), ts: now, text: message + ' (via the portal)', auto: 1 });
    const next = row.version + 1;
    await tx('UPDATE entries SET doc = $2, version = $3, updated_at = now() WHERE id = $1', [row.id, JSON.stringify(doc), next]);
    await tx('INSERT INTO entry_versions (entry_id, version, doc, saved_by) VALUES ($1, $2, $3, $4)', [row.id, next, JSON.stringify(doc), session.user.id]);
    await tx('INSERT INTO portal_events (org_id, entry_id, kind, message, by_user) VALUES ($1,$2,$3,$4,$5)', [orgId, row.id, kind, message, session.user.id]);
    const { rows: ref } = await tx('SELECT ref FROM entries WHERE id = $1', [row.id]);
    return { status: 200, ref: ref[0]?.ref, message };
  });
  if (out.status !== 200) return NextResponse.json({ error: out.error }, { status: out.status });
  /* the assessors hear about it where they work */
  await notify({ to: { internal: true }, kind: 'provider_reply', title: (out.ref || 'a case') + ': ' + (session.user.orgName || 'provider') + ' replied', body: out.message, href: '/tool?entry=' + encodeURIComponent(params.id), entryId: params.id, orgId });
  const row = await ownRow(params.id, orgId);
  return NextResponse.json({ ok: true, view: providerView(row) });
}
