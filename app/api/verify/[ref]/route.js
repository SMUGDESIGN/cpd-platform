import { NextResponse } from 'next/server';
import { lookup } from '@/lib/register.server';
import { gate, withCors, overLimit, clean } from '@/lib/signup.server';

/* Public. A certificate or badge number checked by anyone - the register's
   published fields only. No session, nothing personal, nothing from inside
   the assessment. Read-only, so no token; the origin rule (a person typing
   the address, the platform's own /verify page and the website's register
   page are all allowed) and a per-connection throttle so the register
   cannot be enumerated by trial. */
export async function OPTIONS(req) { return withCors(new NextResponse(null, { status: 204 }), req.headers.get('origin')); }
export async function GET(req, { params }) {
  const origin = req.headers.get('origin');
  const refused = await gate(req, { purpose: 'verify', allowNoOrigin: true });
  if (refused) return refused;
  if (await overLimit(req, 'verify', 120)) return withCors(NextResponse.json({ error: 'Too many checks from this connection - try again in an hour' }, { status: 429 }), origin);
  const rec = await lookup(clean(params.ref, 20));
  if (!rec) return withCors(NextResponse.json({ found: false }, { status: 404 }), origin);
  const { entryId, orgId, ...pub } = rec;
  return withCors(NextResponse.json({ found: true, record: pub }), origin);
}
