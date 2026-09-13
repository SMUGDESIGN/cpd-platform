import { Pool, types } from 'pg';

/* DATE comes back as the text Postgres holds ('2026-11-08'), not a JS Date at
   local midnight that turns into the evening before once serialised. A due
   date is a day, not an instant. 1082 is DATE; timestamps are left alone.
   Lifted from the DBF Hub, where the lesson was learned. */
types.setTypeParser(1082, (v) => v);

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      /* No TLS to the loopback (the embedded Postgres speaks plain); full
         certificate verification to anything remote. */
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')
        ? false
        : { rejectUnauthorized: true },
      /* Sized for a serverless function that serves one request at a time. */
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

/* Several statements, all or nothing, on ONE client for the whole life of
   the transaction - query() alone may hand BEGIN and INSERT to different
   connections. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  const tx = (text, params) => client.query(text, params);
  try {
    await client.query('BEGIN');
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the error below is the one that matters */ }
    throw e;
  } finally {
    client.release();
  }
}
