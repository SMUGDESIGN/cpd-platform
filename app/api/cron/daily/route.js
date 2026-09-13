import { NextResponse } from 'next/server';
import { runDailyChecks } from '@/lib/dailyChecks.server';

/* The nightly run. No session: Vercel calls it with the project's
   CRON_SECRET (vercel.json), and anything else is refused. Locally the same
   job runs from the Admin page (api/admin/cron) or `npm run cron`. */
export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== 'Bearer ' + secret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const out = await runDailyChecks();
  return NextResponse.json({ ok: true, ...out, ranAt: new Date().toISOString() });
}
