import { NextResponse } from 'next/server';
import { lookup } from '@/lib/register.server';
import { gate, withCors, overLimit, clean } from '@/lib/signup.server';

/* Public. The form's first step: which course is this? Only accredited
   activities come back; a suspended one is still accepted (the completion
   predates the suspension and feeds the review). Read-only, so no token -
   but the same origin rule and a per-connection throttle against scraping
   the register by trial. */
export async function OPTIONS(req) { return withCors(new NextResponse(null, { status: 204 }), req.headers.get('origin')); }
export async function GET(req) {
  const origin = req.headers.get('origin');
  const refused = await gate(req, { purpose: 'feedback', allowNoOrigin: true });
  if (refused) return refused;
  if (await overLimit(req, 'feedback-check', 60)) return withCors(NextResponse.json({ error: 'Too many checks from this connection - try again in an hour' }, { status: 429 }), origin);
  const ref = clean(new URL(req.url).searchParams.get('ref'), 20);
  const rec = await lookup(ref);
  if (!rec) return withCors(NextResponse.json({ found: false }, { status: 404 }), origin);
  return withCors(NextResponse.json({ found: true, ref: rec.ref, activity: rec.activity, provider: rec.provider, hours: rec.hours, status: rec.status }), origin);
}
