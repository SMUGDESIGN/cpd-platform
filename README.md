# CPD Accreditation Scheme - assessor platform

The scheme's own platform: the eight-stage assessment workflow as pages behind
a login, every case file in a real database with a full save history and
version-locked saves, the provider portal (apply, progress, billing, feedback),
the admin area (organisations, people, invoices), in-app and email
notifications, the proposal queue to the Standards Panel, the public register
lookup and the learner feedback form. Built on the same chassis as the Derby Book
Festival Hub (`~/Documents/Claude/dbf-hub`) so it runs locally exactly as it
will run on Vercel with a managed Postgres, and moves there with no code change.

Sibling folders: `../CPD` (the framework, decisions, working rules - read its
`CLAUDE.md` first) and `../CPD website` (the public site, deployed separately).

## Run it locally

```
npm install
npm run dev       # starts the local database AND the app on http://localhost:3006
```

First-time setup, in order:

```
npm install
npm run db        # leave running; first run initialises .pgdata
npm run migrate   # apply schema.sql
npm run seed "Your Name" you@example.org   # prints a one-time password
```

Then `Ctrl-C` the db and use `npm run dev` for everything afterwards. Sign in
at http://localhost:3006 and change the password under Account.

Ports: app 3006, Postgres 5545 (the DBF Hub holds 3005 and 5544 - never share).

Daily checks (fix windows, conditions, reviews, invoices -> notifications): on
Vercel the cron in `vercel.json` calls `/api/cron/daily` with `CRON_SECRET`;
locally use the Admin page's "Run daily checks" or `npm run cron`. The cron
also sends the daily email digests.

Email: `EMAIL_PROVIDER=log` (default) writes every email to the `email_outbox`
table instead of sending - read them on the Admin page. For real delivery set
`EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender
on your Resend domain). Each person chooses immediate / daily / off under
Account; urgent kinds go at once, the rest in the digest.

The database is a real Postgres running from `node_modules` into `.pgdata/`.
Deploying later means: a GitHub repo, a Vercel project, a managed Postgres
(Neon), and `DATABASE_URL` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL` set in Vercel.

Organisation sign-up: the website's Apply page posts to `/api/signup` (public,
CORS). It creates a `pending` organisation and notifies support; approval on
the organisation's admin page creates the contact's portal login and emails
the one-time password. Set `PUBLIC_SITE_ORIGINS` to the website's origin at
deploy (comma list); unset, any origin may post. The website's
`js/platform.js` holds the platform URL and must point at the live platform.
