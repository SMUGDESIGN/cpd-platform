// A real Postgres, run from node_modules - no system install, no accounts.
// Data lives in .pgdata (gitignored). Local development only; production
// gets a managed database (Neon / Vercel Postgres) and nothing in the code
// changes. Port 5545: the DBF Hub holds 5544 and the two must never share.
import EmbeddedPostgres from 'embedded-postgres';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 5545;
const pg = new EmbeddedPostgres({
  /* fileURLToPath, not .pathname: a space in the folder name came out as %20 and the
     data went to a sibling folder literally named 'CPD%20platform' (found 18 Sep 2026). */
  databaseDir: fileURLToPath(new URL('../.pgdata', import.meta.url)),
  user: 'cpd',
  password: 'cpd',           // local-only credentials for a localhost-only socket
  port: PORT,
  persistent: true,
});

// Is one already up? Postgres outlives the dev server, so `npm run dev` is
// often run while an instance from a previous run is still listening.
// Starting a second against the same data directory fails; reuse instead,
// and never stop a database this process did not start.
const alreadyRunning = await new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port: PORT });
  socket.setTimeout(1000);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.once('timeout', () => { socket.destroy(); resolve(false); });
});

if (alreadyRunning) {
  console.log(`postgres already running on 127.0.0.1:${PORT} - reusing it`);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  setInterval(() => {}, 1 << 30);
} else {
  const fresh = !(await import('node:fs')).existsSync(fileURLToPath(new URL('../.pgdata/PG_VERSION', import.meta.url)));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('cpd_platform');
  console.log(`postgres ready on 127.0.0.1:${PORT} (db: cpd_platform)`);

  const stop = async () => { try { await pg.stop(); } finally { process.exit(0); } };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
