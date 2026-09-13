import { query } from './db';
import { sendEmail, render, BASE_URL } from './email.server';

/* Which kinds cannot wait for the digest when a person has chosen 'immediate'. */
export const URGENT_KINDS = ['returned', 'ask', 'deferral', 'decision', 'issued', 'condition', 'invoice', 'application', 'provider_reply'];

const FOOTER = 'You are receiving this because of your account on the CPD Accreditation Scheme platform. Change how you are emailed under Account at ' + BASE_URL + '.';

async function pendingFor(where, params) {
  const { rows } = await query(
    `SELECT n.id, n.user_id, n.kind, n.title, n.body, n.href, u.email, u.name, u.email_notifications AS pref
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.email_sent_at IS NULL AND u.active AND u.email_notifications <> 'off' ${where}
      ORDER BY n.user_id, n.created_at`, params
  );
  const byUser = {};
  rows.forEach((r) => { (byUser[r.user_id] || (byUser[r.user_id] = { user: r, items: [] })).items.push(r); });
  return Object.values(byUser);
}

async function sendBatch(group, heading) {
  const { user, items } = group;
  const subject = items.length === 1 ? '[CPD Accreditation] ' + items[0].title : '[CPD Accreditation] ' + items.length + ' things need your attention';
  const { text, html } = render({ heading, items, footer: FOOTER });
  const ids = items.map((i) => i.id);
  const out = await sendEmail({ userId: user.user_id, to: user.email, subject, text, html, notificationIds: ids });
  if (out.ok) await query('UPDATE notifications SET email_sent_at = now() WHERE id = ANY($1::int[])', [ids]);
  return out;
}

/* Right after a notification is written: urgent kinds go now to people who
   chose 'immediate'. Grouped per person, so one action that raised three
   rows sends one email. */
export async function deliverImmediate(userIds) {
  if (!userIds || !userIds.length) return 0;
  const groups = await pendingFor("AND u.email_notifications = 'immediate' AND n.user_id = ANY($1::int[]) AND n.kind = ANY($2::text[])", [userIds, URGENT_KINDS]);
  let sent = 0;
  for (const g of groups) { const r = await sendBatch(g, 'Hello ' + (g.user.name || '') + ' - something on the platform needs you:'); if (r.ok) sent++; }
  return sent;
}

/* Once a day: everything still unsent, one email per person. */
export async function deliverDigests() {
  const groups = await pendingFor('', []);
  let sent = 0, failed = 0;
  for (const g of groups) { const r = await sendBatch(g, 'Hello ' + (g.user.name || '') + ' - your daily summary from the CPD Accreditation Scheme:'); if (r.ok) sent++; else failed++; }
  return { people: groups.length, sent, failed };
}
