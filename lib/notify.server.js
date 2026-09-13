import { query } from './db';
import { INTERNAL_ROLES, ADMIN_ROLES } from './permissions';

/* Fan an event out to the people it concerns, one row each.
     to: { userIds:[..] | orgId:n | internal:true | admin:true }  (any mix)
     exclude: a user id that must not be told about their own action
     dedupeKey: same key for the same person is written once, ever
   Email: not sent from here. When the email route arrives it reads rows
   where email_sent_at IS NULL for people who asked for email - the
   notification is the record; email is one way of delivering it. */
export async function notify(n) {
  const ids = new Set(n.to?.userIds || []);
  if (n.to?.orgId) {
    const { rows } = await query('SELECT id FROM users WHERE org_id = $1 AND active', [n.to.orgId]);
    rows.forEach((r) => ids.add(r.id));
  }
  if (n.to?.internal || n.to?.admin) {
    const roles = n.to.admin && !n.to.internal ? ADMIN_ROLES : INTERNAL_ROLES;
    const { rows } = await query('SELECT id FROM users WHERE active AND org_id IS NULL AND role = ANY($1::text[])', [roles]);
    rows.forEach((r) => ids.add(r.id));
  }
  if (n.exclude) ids.delete(Number(n.exclude));
  const list = [...ids];
  if (!list.length) return 0;
  const { rowCount } = await query(
    `INSERT INTO notifications (user_id, kind, title, body, href, entry_id, org_id, dedupe_key)
     SELECT u, $2, $3, $4, $5, $6, $7, $8 FROM unnest($1::int[]) AS u
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [list, n.kind, n.title, n.body || null, n.href || null, n.entryId || null, n.orgId || null, n.dedupeKey || null]
  );
  /* email, for those who asked for it now - never allowed to fail the caller */
  if (rowCount && !n.skipEmail) {
    try {
      const { deliverImmediate } = await import('./emailDelivery.server');
      await deliverImmediate(list);
    } catch (e) { console.error('immediate email failed', e); }
  }
  return rowCount;
}
