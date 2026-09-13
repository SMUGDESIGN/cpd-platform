import { NextResponse } from 'next/server';
import { runDailyChecks } from '@/lib/dailyChecks.server';
import { deliverDigests } from '@/lib/emailDelivery.server';

/* The nightly run. No session: Vercel calls it with the project's
   CRON_SECRET (vercel.json), and anything else is refused. Locally the same
   job runs from the Admin page (api/admin/cron) or `npm run cron`. */
export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const out = await runDailyChecks();
  const digests = await deliverDigests();
  return NextResponse.json({ ok: true, ...out, digests, ranAt: new Date().toISOString() });
}
