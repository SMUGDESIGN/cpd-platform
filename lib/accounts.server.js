import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db';

export function initialsOf(name) {
  return String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}
export function oneTimePassword() {
  return randomBytes(9).toString('base64url');
}

/* Create a person and return the one-time password ONCE. Never stored in
   clear; the person changes it under Account. Email is unique and lowercase. */
export async function createUser({ name, email, role, orgId }) {
  const em = String(email || '').trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error('A name and a valid email are required');
  const password = oneTimePassword();
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, initials, org_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, name, email, role`, [name.trim(), em, hash, role, initialsOf(name), orgId || null]
  );
  if (!rows[0]) throw new Error('An account with that email already exists');
  return { user: rows[0], password };
}

export async function resetPassword(userId) {
  const password = oneTimePassword();
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, hash]);
  if (!rowCount) throw new Error('No such account');
  return password;
}
