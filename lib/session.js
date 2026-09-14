import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';
import { isInternal, isProvider, isAdmin, isSuperAdmin, canEditCases, canEditStage1, caseScope } from './permissions';

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
export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isSuperAdmin(session)) return { res: forbidden() };
  return { session };
}
/* Internal AND allowed to change a case (support reads, never writes). */
export async function requireCaseEditor() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isInternal(session)) return { res: forbidden() };
  if (!canEditCases(session)) return { res: NextResponse.json({ error: 'Support accounts can read cases but not change them' }, { status: 403 }) };
  return { session };
}
/* Internal and allowed to save at least Stage 1. Returns scope 'all' or
   'stage1'; a 'stage1' caller's save is checked against the Stage 1 keys by
   the route (lib/stage1.outsideStage1). */
export async function requireStage1Editor() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isInternal(session)) return { res: forbidden() };
  if (!canEditStage1(session)) return { res: NextResponse.json({ error: 'Your role can read cases but not change them' }, { status: 403 }) };
  return { session, scope: caseScope(session) };
}
export async function requireProvider() {
  const session = await getSession();
  if (!session) return { res: unauthorised() };
  if (!isProvider(session)) return { res: forbidden() };
  return { session, orgId: Number(session.user.orgId) };
}
