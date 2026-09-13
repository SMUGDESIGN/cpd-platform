import { query } from './db';
import { notify } from './notify.server';
import { surveillanceDates } from './providerView';
import { isoDay } from './framework';

/* Date-driven notifications: things that become true by the calendar rather
   than by anyone's action. Run once a day (api/cron/daily on Vercel, the
   Admin "run daily checks" button locally). Every one carries a dedupe key
   so a repeated run says nothing twice. */
const DAY = 86400000;
const daysTo = (iso) => Math.floor((new Date(iso + 'T23:59:59Z') - Date.now()) / DAY);

export async function runDailyChecks() {
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  const { rows: entries } = await query('SELECT id, ref, org_id, doc FROM entries WHERE archived_at IS NULL');
  for (const e of entries) {
    const d = e.doc || {};
    const label = (e.ref || d.caseInfo?.ref || 'a case') + ': ';
    const staffHref = '/cases/' + encodeURIComponent(e.id);
    const provHref = '/portal/cases/' + encodeURIComponent(e.id);
    const both = async (n) => {
      sent += await notify({ to: { internal: true }, href: staffHref, entryId: e.id, orgId: e.org_id, ...n });
      if (e.org_id) sent += await notify({ to: { orgId: e.org_id }, href: provHref, entryId: e.id, orgId: e.org_id, ...n });
    };
    // the fix window
    const df = d.deferral;
    if (df && df.issuedAt && !df.resubmittedAt && df.due) {
      const left = daysTo(df.due);
      if (left < 0) await both({ kind: 'deferral', title: label + 'the fix window has ended with no resubmission', body: 'Ended ' + df.due + '. Under rule C2 the outcome is refusal unless the window is extended with a written reason.', dedupeKey: 'defer-expired:' + e.id + ':' + df.due });
      else if (left <= 7) await both({ kind: 'deferral', title: label + 'fix window ends in ' + left + ' day' + (left === 1 ? '' : 's'), body: 'Ends ' + df.due + '.', dedupeKey: 'defer-7:' + e.id + ':' + df.due });
    }
    // conditions past their date
    for (const c of d.conditions || []) {
      if (c.status === 'open' && c.due && c.due < today) {
        await both({ kind: 'condition', title: label + 'a condition is past its date and unverified', body: c.text + ' - due ' + c.due + '.', dedupeKey: 'cond-overdue:' + e.id + ':' + c.id });
      }
    }
    // reviews and renewal, from the accreditation date
    if ((d.outcome || {}).approvedAt) {
      const sv = surveillanceDates(d);
      const visits = d.surveillance || {};
      if (sv) {
        for (const [k, name, when] of [['sv1', 'First annual review', sv.sv1], ['sv2', 'Second annual review', sv.sv2]]) {
          if (visits[k] && visits[k].outcome) continue;
          const iso = isoDay(when), left = daysTo(iso);
          if (left < 0) await both({ kind: 'review', title: label + name + ' is overdue', body: 'Was due ' + iso + '. The provider submissions pack (feedback data, complaints log, change log, current materials) is needed now.', dedupeKey: 'sv-overdue:' + e.id + ':' + k });
          else if (left <= 60) await both({ kind: 'review', title: label + name + ' due in ' + left + ' days', body: 'Due ' + iso + '. We ask for the submissions pack ahead of it.', dedupeKey: 'sv-due:' + e.id + ':' + k });
        }
        const exp = isoDay(sv.exp), left = daysTo(exp);
        if (left >= 0 && left <= 90) await both({ kind: 'review', title: label + 'accreditation renews in ' + left + ' days', body: 'Term ends ' + exp + '. Renewal is a fresh assessment - apply in good time.', dedupeKey: 'renewal:' + e.id + ':' + exp });
        else if (left < 0) await both({ kind: 'review', title: label + 'accreditation term has ended', body: 'Ended ' + exp + '. The register shows it as expired until a renewal is accredited.', dedupeKey: 'expired:' + e.id + ':' + exp });
      }
    }
  }
  // invoices past due
  const { rows: inv } = await query(`SELECT i.id, i.number, i.amount_pence, i.due_at, i.org_id, o.name FROM invoices i JOIN organisations o ON o.id = i.org_id WHERE i.status = 'issued' AND i.due_at < CURRENT_DATE`);
  for (const i of inv) {
    const amount = '£' + (i.amount_pence / 100).toFixed(2);
    sent += await notify({ to: { admin: true }, kind: 'invoice', title: i.name + ': invoice ' + i.number + ' is overdue', body: amount + ', due ' + i.due_at + '.', href: '/admin/organisations/' + i.org_id, orgId: i.org_id, dedupeKey: 'inv-overdue:' + i.id });
    sent += await notify({ to: { orgId: i.org_id }, kind: 'invoice', title: 'Invoice ' + i.number + ' is overdue', body: amount + ' was due ' + i.due_at + '. Please pay by bank transfer quoting the invoice number.', href: '/portal/billing', orgId: i.org_id, dedupeKey: 'inv-overdue:' + i.id });
  }
  return { entries: entries.length, overdueInvoices: inv.length, notificationsWritten: sent };
}
