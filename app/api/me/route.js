import { NextResponse } from 'next/server';
import { getSession, unauthorised } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorised();
  const { id, name, email, role, initials } = session.user;
  return NextResponse.json({ id, name, email, role, initials });
}
