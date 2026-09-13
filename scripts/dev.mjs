// One command for local work: start the embedded database, then Next.
// Ctrl-C stops both. `npm run dev` is all anyone needs to know.
// Same shape as the DBF Hub's scripts/dev.mjs, on this project's own ports.
import { spawn } from 'node:child_process';

const db = spawn('node', ['scripts/db.mjs'], { stdio: 'inherit' });
let app;
// Give the database a moment to come up before Next starts answering.
setTimeout(() => {
  app = spawn('npx', ['next', 'dev', '-p', '3006'], { stdio: 'inherit' });
  app.on('exit', (code) => { db.kill('SIGTERM'); process.exit(code ?? 0); });
}, 2500);
process.on('SIGINT', () => { app?.kill('SIGINT'); db.kill('SIGTERM'); });
