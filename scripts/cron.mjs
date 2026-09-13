// Run the daily checks against the local server: `npm run cron`.
import 'dotenv/config';
const base = process.env.NEXTAUTH_URL || 'http://localhost:3006';
const r = await fetch(base + '/api/cron/daily', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
console.log(r.status, await r.text());
