import CredentialsProvider from 'next-auth/providers/credentials';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { query } from './db';

// ── Login throttling ────────────────────────────────────────────────────────
// Failures counted per account and per source IP over a rolling window. Every
// helper is wrapped in try/catch: a fault in the throttle must never lock the
// whole team out. Same design as the DBF Hub.
const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

function clientIp(req) {
  const h = req?.headers || {};
  const get = (k) => (typeof h.get === 'function' ? h.get(k) : h[k]);
  const real = get('x-real-ip');
  if (real) return String(real).trim();
  const fwd = get('x-forwarded-for') || '';
  return String(fwd).split(',')[0].trim() || null;
}

async function isThrottled(email, ip) {
  try {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE email = $1) AS by_email,
              COUNT(*) FILTER (WHERE ip = $2 AND $2 IS NOT NULL) AS by_ip
         FROM login_attempts
        WHERE ok = false AND at > now() - ($3 || ' minutes')::interval`,
      [email, ip, String(WINDOW_MINUTES)]
    );
    const r = rows[0] || {};
    return Number(r.by_email) >= MAX_PER_EMAIL || Number(r.by_ip) >= MAX_PER_IP;
  } catch {
    return false;
  }
}

async function recordAttempt(email, ip, ok) {
  try {
    await query('INSERT INTO login_attempts (email, ip, ok) VALUES ($1,$2,$3)', [email, ip, ok]);
    if (Math.random() < 0.02) {
      await query("DELETE FROM login_attempts WHERE at < now() - interval '7 days'");
    }
  } catch { /* logging a login attempt must not break logging in */ }
}

export const authOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        const ip = clientIp(req);
        if (await isThrottled(email, ip)) return null;

        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];
        /* Unknown and deactivated accounts still pay for a bcrypt compare, so
           response timing does not list which emails have accounts. */
        if (!user || !user.active) {
          await bcrypt.compare(credentials.password,
            '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
          await recordAttempt(email, ip, false);
          return null;
        }
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) { await recordAttempt(email, ip, false); return null; }
        await recordAttempt(email, ip, true);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        /* Live role, name and active flag on every session resolution, so a
           change takes effect immediately and a deleted account resolves as
           inactive rather than as a ghost with a valid token. */
        const { rows } = await query(
          `SELECT u.name, u.role, u.initials, u.active, u.org_id, o.name AS org_name, o.status AS org_status
             FROM users u LEFT JOIN organisations o ON o.id = u.org_id WHERE u.id = $1`, [token.id]);
        const u = rows[0];
        /* a provider whose organisation is closed is out, whatever their own flag says */
        session.user.active = u ? (u.active && u.org_status !== 'closed') : false;
        session.user.role = u?.role || null;
        session.user.name = u?.name || session.user.name;
        session.user.initials = u?.initials || '';
        session.user.orgId = u?.org_id || null;
        session.user.orgName = u?.org_name || null;

        /* View-as: a superadmin looking through another role's eyes while
           testing. Applied HERE, where the role is resolved, so it is not a
           costume - every route's guard sees the assumed role and answers with
           real 403s and real portal scoping. Three properties keep it safe:
           only when the DATABASE says superadmin (the cookie is a request, and
           anyone else's is ignored); only DOWNWARD (superadmin is not an
           assumable value); per request (clearing the cookie is the whole
           undo). Viewing as a provider needs an organisation to stand in;
           the cookie names it and it must exist. `realRole` is kept so the
           shell can show the strip and offer the way back. */
        session.user.realRole = session.user.role;
        if (u?.role === 'superadmin') {
          try {
            const raw = cookies().get('cpd-view-as')?.value || '';
            const [wanted, orgStr] = raw.split(':');
            const ASSUMABLE = ['support', 'assessor', 'moderator', 'coordinator', 'provider'];
            if (wanted && ASSUMABLE.includes(wanted)) {
              if (wanted === 'provider') {
                const orgId = Number(orgStr);
                const { rows: org } = orgId > 0 ? await query('SELECT id, name FROM organisations WHERE id = $1', [orgId]) : { rows: [] };
                if (org[0]) { session.user.role = 'provider'; session.user.orgId = org[0].id; session.user.orgName = org[0].name; session.user.viewingAs = 'provider'; }
              } else {
                session.user.role = wanted; session.user.viewingAs = wanted;
              }
            }
          } catch { /* outside a request scope - no override */ }
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
