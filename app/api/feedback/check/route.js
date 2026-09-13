import { NextResponse } from 'next/server';
import { lookup } from '@/lib/register.server';

/* Public. The form's first step: which course is this? Only accredited
   activities come back; a suspended one is still accepted (the completion
   predates the suspension and feeds the review). */
export async function GET(req) {
  const ref = new URL(req.url).searchParams.get('ref') || '';
  const rec = await lookup(ref);
  if (!rec) return NextResponse.json({ found: false }, { status: 404 });
  return NextResponse.json({ found: true, ref: rec.ref, activity: rec.activity, provider: rec.provider, hours: rec.hours, status: rec.status });
}
