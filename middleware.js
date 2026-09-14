import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/* Everything is behind the login except the paths that must not be.
 * Deny-by-default: a new page is protected the moment it exists.
 *
 *   login, api/auth        the door and NextAuth's own endpoints
 *   verify, api/verify     the public register lookup - published fields only
 *   feedback, api/feedback the learner feedback form, gated by a real
 *                          accreditation number, never by a session
 *   api/signup, signup     the website's organisation sign-up (creates a
 *                          pending organisation, nothing else), its one-time
 *                          token, and the email-confirmation page
 *   _next/static, _next/image, favicon, icon, images/   build output and marks
 *
 * Each public name is bounded with (?:/|$) so that, say, /learner-feedback
 * (internal) is not opened by the /feedback rule. A signed-out API call gets
 * 401 JSON; a signed-out page visit goes to /login with a return address.
 * Every API route also checks the session itself (lib/session.js).
 */
export async function middleware(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const url = new URL('/login', req.url);
  url.searchParams.set('callbackUrl', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!login(?:/|$)|verify(?:/|$)|feedback(?:/|$)|api/auth(?:/|$)|api/verify(?:/|$)|api/feedback(?:/|$)|api/signup(?:/|$)|signup(?:/|$)|api/cron(?:/|$)|_next/static|_next/image|favicon.ico|icon.svg|images/).*)',
  ],
};
