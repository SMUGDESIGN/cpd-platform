// Apply schema.sql. Additive-only by convention: the file is a history of
// CREATE IF NOT EXISTS / ALTER ADD IF NOT EXISTS, so re-running is safe.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log('schema applied');
} finally {
  await pool.end();
}
