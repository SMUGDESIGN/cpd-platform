import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';
import { isInternal, isProvider, isAdmin } from './permissions';

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

/* Three guards, so a route says which side of the house it belongs to in one
   line. Each returns {session} or {res} - the caller returns res as-is. */
export async function requireInternal() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isInternal(session)) return { res: forbidden() };
  return { session };
}
export async function requireAdmin() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isAdmin(session)) return { res: forbidden() };
  return { session };
}
export async function requireProvider() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isProvider(session)) return { res: forbidden() };
  return { session, orgId: Number(session.user.orgId) };
}
