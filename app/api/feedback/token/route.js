import { NextResponse } from 'next/server';
import { gate, issueToken, withCors } from '@/lib/signup.server';

/* Public. The feedback form fetches a one-time token when it loads; the
   POST spends it. Same mechanics as the sign-up token, purpose 'feedback'. */
export async function OPTIONS(req) { return withCors(new NextResponse(null, { status: 204 }), req.headers.get('origin')); }
export async function GET(req) {
  const refused = await gate(req, { purpose: 'feedback', allowNoOrigin: true });
  if (refused) return refused;
  const t = await issueToken(req, 'feedback');
  if (t.error) return withCors(NextResponse.json({ error: t.error }, { status: t.status }), req.headers.get('origin'));
  return withCors(NextResponse.json(t), req.headers.get('origin'));
}
