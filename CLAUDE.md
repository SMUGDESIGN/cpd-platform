# Working rules for the CPD platform repo

This is the CPD Accreditation Scheme's platform (Next.js 14 + Postgres), the
third sibling beside `../cpd` (framework, decisions, working rules) and
`../cpd-website` (the public site). **Read `../cpd/CLAUDE.md` first** - the
user is the Standards Panel, propose don't decide, `DECISIONS.md`, plain
hyphens. The rules below are about working in THIS repo, and every one is
lifted from `~/Documents/Claude/dbf-hub/CLAUDE.md`, where each cost real time.

1. **Never run `next build` against the running dev server.** Use
   `npm run build:check` (writes `.next-verify`). A bare build replaces the
   chunks the dev server is serving and the whole app 404s until restarted.
   If the app 404s everywhere: stop the server, `rm -rf .next`, start again.
   If the port answers nothing at all, the server has simply stopped - start
   it again, with the `cd`:
   ```bash
   cd ~/Code/cpd-platform && npm run dev
   ```
2. **Never an unscoped DELETE on a shared table.** The user's own case files
   are in this database. Scope every cleanup to rows this session created,
   by id or by a `verify-` marker. Prefer proving things without writing.
3. **Throwaway accounts only.** Seed test users as `verify-*@cpd.local` and
   delete only those. Never reset, deactivate or delete the user's account.
4. **Do not invent case files.** Cases carry real client material. A test case
   is created with a `TEST-` ref by this session and archived by its own id
   afterwards; never pick a target positionally.
5. **Fix causes, not symptoms** - and say plainly when a stopgap is chosen.
6. **The case document is the contract.** `entries.doc` is the shape
   `lib/framework.js` `blankDoc()` makes; every page reads and writes it
   through `lib/stageN.js` pure functions and saves with the version it read.
   Change the shape in `blankDoc`, the stage module and the schema note
   together; never in one.
7. Ports 3006 / 5545. The DBF Hub is 3005 / 5544 and is never touched from here.
8. **Two houses, one database.** Internal roles (superadmin, support,
   assessor, moderator, coordinator) and `provider` (org-scoped). Paul's
   account is the superadmin. Support reads cases but never writes them
   (`requireCaseEditor`) and never touches a superadmin account. Every API route names its side
   with `requireInternal` / `requireAdmin` / `requireProvider`; a provider
   query is ALWAYS scoped by `org_id` from the session, never from the
   request. What a provider may see is decided in ONE place,
   `lib/providerView.js`: only what has been communicated, in plain English,
   no indicator ids, no scores, nothing un-notified. Add to that file, never
   around it.

9. **Lives in `~/Code/`, never in iCloud.** On 18 Sep 2026 iCloud's Desktop &
   Documents sync was switched off and `~/Documents` emptied; the repos and
   the database were recovered from iCloud Drive into `~/Code/cpd-platform`,
   `~/Code/cpd-website`, `~/Code/cpd`. The database is `.pgdata` in this
   folder (`scripts/db.mjs` now uses `fileURLToPath`, so a space in a path can
   no longer send it to a `%20` sibling folder). The originals in iCloud Drive
   are stale copies from that day - do not work in them.
