import { query } from './db';

/* One way out for email. EMAIL_PROVIDER decides:
     log     (default) - nothing leaves the machine; the email is written to
             email_outbox with status 'logged' so it can be read on the Admin page.
     resend  - sent through Resend's HTTP API with RESEND_API_KEY; no SDK, no
             dependency, works from a Vercel function.
   Every attempt is an outbox row first, then updated with the outcome, so a
   provider failure is visible. Never throws: a broken sender must not break
   the action that raised the notification. */
export function emailMode() {
  const p = (process.env.EMAIL_PROVIDER || 'log').toLowerCase();
  return p === 'resend' && process.env.RESEND_API_KEY ? 'resend' : (p === 'resend' ? 'resend-unconfigured' : 'log');
}
export const EMAIL_FROM = process.env.EMAIL_FROM || 'CPD Accreditation Scheme <notifications@example.org>';
export const BASE_URL = (process.env.NEXTAUTH_URL || 'http://localhost:3006').replace(/\/$/, '');

export async function sendEmail({ userId, to, subject, text, html, notificationIds }) {
  const mode = emailMode();
  const provider = mode === 'log' ? 'log' : 'resend';
  const { rows } = await query(
    `INSERT INTO email_outbox (user_id, to_email, subject, text_body, html_body, notification_ids, provider, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'logged') RETURNING id`,
    [userId || null, to, subject, text, html || null, notificationIds || [], provider]
  );
  const id = rows[0].id;
  if (mode === 'log') return { ok: true, id, mode };
  if (mode === 'resend-unconfigured') {
    await query("UPDATE email_outbox SET status='failed', error=$2 WHERE id=$1", [id, 'EMAIL_PROVIDER=resend but RESEND_API_KEY is not set']);
    return { ok: false, id, mode, error: 'RESEND_API_KEY not set' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, html: html || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      await query("UPDATE email_outbox SET status='failed', error=$2 WHERE id=$1", [id, (j.message || j.error || ('HTTP ' + r.status)).toString().slice(0, 500)]);
      return { ok: false, id, mode, error: j.message || ('HTTP ' + r.status) };
    }
    await query("UPDATE email_outbox SET status='sent', provider_id=$2 WHERE id=$1", [id, j.id || null]);
    return { ok: true, id, mode, providerId: j.id };
  } catch (e) {
    await query("UPDATE email_outbox SET status='failed', error=$2 WHERE id=$1", [id, String(e.message || e).slice(0, 500)]);
    return { ok: false, id, mode, error: String(e.message || e) };
  }
}

/* Plain text is the source; the HTML is the same words in a plain frame. */
export function render({ heading, items, footer }) {
  const text = [heading, '', ...items.map((i) => '- ' + i.title + (i.body ? '\n  ' + i.body : '') + (i.href ? '\n  ' + BASE_URL + i.href : '')), '', footer].join('\n');
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1B1B2F;max-width:640px">
<div style="background:#211A5E;color:#fff;padding:12px 18px;border-bottom:4px solid #9A94D0"><b style="letter-spacing:1px">CPD</b> Accreditation Scheme</div>
<div style="padding:18px"><p>${esc(heading)}</p>
${items.map((i) => `<div style="border-left:4px solid #9A94D0;padding:6px 12px;margin:10px 0"><b>${esc(i.title)}</b>${i.body ? `<br>${esc(i.body)}` : ''}${i.href ? `<br><a href="${esc(BASE_URL + i.href)}" style="color:#211A5E">Open it</a>` : ''}</div>`).join('')}
<p style="font-size:12.5px;color:#6B6B85">${esc(footer)}</p></div></div>`;
  return { text, html };
}
