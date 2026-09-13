import { NextResponse } from 'next/server';
import { lookup } from '@/lib/register.server';

/* Public. A certificate or badge number checked by anyone - the register's
   published fields only. No session, nothing personal, nothing from inside
   the assessment. */
export async function GET(_req, { params }) {
  const rec = await lookup(params.ref);
  if (!rec) return NextResponse.json({ found: false }, { status: 404 });
  const { entryId, orgId, ...pub } = rec;
  return NextResponse.json({ found: true, record: pub });
}
