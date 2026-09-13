import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { runDailyChecks } from '@/lib/dailyChecks.server';

/* The daily checks, on demand, for an admin - the local stand-in for the
   nightly cron and a way to catch up after a quiet spell. */
export async function POST() {
  const { res } = await requireAdmin();
  if (res) return res;
  const out = await runDailyChecks();
  return NextResponse.json({ ok: true, ...out });
}
