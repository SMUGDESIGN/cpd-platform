// Create (or reset) one account and print a one-time password.
//   npm run seed "Paul Grantham" you@example.org [role]
// Roles: superadmin | support | assessor | moderator | coordinator (lib/permissions.js).
// The first account you seed should be a superadmin.
// The password is printed once and never stored in clear; change it under
// Account after the first sign-in.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [name, emailRaw, role = 'superadmin'] = process.argv.slice(2);
if (!name || !emailRaw) {
  console.error('usage: npm run seed "Full Name" email@example.org [role]');
  process.exit(1);
}
const email = emailRaw.trim().toLowerCase();
const password = randomBytes(9).toString('base64url');
const hash = await bcrypt.hash(password, 10);
const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 4).toUpperCase();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, initials)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role, initials = EXCLUDED.initials, active = true`,
    [name, email, hash, role, initials]
  );
  console.log(`account ready: ${email} (${role})`);
  console.log(`one-time password: ${password}`);
} finally {
  await pool.end();
}
