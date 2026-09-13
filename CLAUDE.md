# Working rules for the CPD platform repo

This is the CPD Accreditation Scheme's platform (Next.js 14 + Postgres), the
third sibling beside `../CPD` (framework, decisions, working rules) and
`../CPD website` (the public site). **Read `../CPD/CLAUDE.md` first** - the
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
   cd ~/Documents/"CPD platform" && npm run dev
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
6. **The case document is the contract.** `entries.doc` is exactly the
   assessor tool's per-entry JSON (the shape every backup file on disk has).
   Change the shape in the tool and the schema note together; never in one.
7. Ports 3006 / 5545. The DBF Hub is 3005 / 5544 and is never touched from here.
