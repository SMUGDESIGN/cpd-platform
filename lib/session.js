import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';

/* Every API route starts here. Returns the session, or null - and the route
   answers 401 through `unauthorised()`. middleware.js keeps the shell behind
   the login; this keeps the data behind it, which is the lock that matters. */
export async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.active === false) return null;
  return session;
}

export function unauthorised() {
  return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: 'Not allowed for your role' }, { status: 403 });
}
