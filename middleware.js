export { default } from 'next-auth/middleware';

/* Everything is behind the login except the paths that must not be.
 * Deny-by-default: a new page is protected the moment it exists.
 *
 *   login, api/auth   the door and NextAuth's own endpoints
 *   verify, api/verify   a certificate or accreditation number checked by the
 *                        public (register lookup) - reads published fields only
 *   feedback, api/feedback   the learner feedback form, gated by a valid
 *                            accreditation number, never by a session
 *   _next/static, _next/image, favicon, logo assets   build output and the mark
 *
 * Every API route also checks the session itself (lib/session.js); this file
 * is the shell's lock, not the only lock.
 */
export const config = {
  matcher: [
    '/((?!login|verify|feedback|api/auth|api/verify|api/feedback|_next/static|_next/image|favicon.ico|icon.svg|images/).*)',
  ],
};
