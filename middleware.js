import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/* Everything is behind the login except the paths that must not be.
 * Deny-by-default: a new page is protected the moment it exists.
 *
 *   login, api/auth   the door and NextAuth's own endpoints
 *   verify, api/verify   a certificate or accreditation number checked by the
 *                        public (register lookup) - reads published fields only
 *   feedback, api/feedback   the learner feedback form, gated by a valid
 *                            accreditation number, never by a session
 *   _next/static, _next/image, favicon, icon, images/   build output and marks
 *
 * A signed-out API call gets a 401 in JSON - a fetch() that is redirected to
 * the login page receives HTML where it expected data, and the page it came
 * from cannot tell "not signed in" from "broken". A signed-out page visit is
 * sent to /login with the address to come back to. Every API route also
 * checks the session itself (lib/session.js); this is the shell's lock, not
 * the only lock.
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
    '/((?!login|verify|feedback|api/auth|api/verify|api/feedback|_next/static|_next/image|favicon.ico|icon.svg|images/).*)',
  ],
};
