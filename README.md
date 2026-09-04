# Multipurpose Cooperative Automation System — MVP Prototype

A web-based prototype for a Philippine multipurpose cooperative, covering
membership, share capital, basic lending, cash/accounting, and an
audit-trail foundation. Built per the MVP spec: Member → Transaction →
Approval → Accounting → Audit Trail.

Runs locally for development (see Setup below), and is also deployable to
Vercel + Supabase (see Deployment below) for a hosted demo. Backups and
data migration tooling from existing Excel/paper records are still out of
scope for the MVP (see "Non-goals" below).

## Stack

- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL, via **Prisma** (schema/migrations + typed client)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Auth:** Email/password (bcrypt) + JWT, role-based access control

## Repository layout

```
server/   Express API, Prisma schema + migrations, seed script
client/   React + Vite + Tailwind frontend
docker-compose.yml   Optional Postgres container for local dev
```

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL 14+ instance reachable from your machine — either:
  - `docker compose up -d db` (uses `docker-compose.yml`, exposes `localhost:5432`), or
  - a local PostgreSQL install (create a role/db matching your `DATABASE_URL`)

## Setup

### 1. Database

```bash
docker compose up -d db
# or point DATABASE_URL at your own local Postgres instance
```

### 2. Backend

```bash
cd server
cp .env.example .env      # adjust DATABASE_URL / JWT_SECRET if needed
npm install
npm run prisma:migrate    # applies schema, creates tables
npm run seed               # creates demo users + one sample member
npm run dev                 # http://localhost:4000
```

Seeded demo logins (password for all: `Password123!`):

| Email | Role |
|---|---|
| admin@coop.test | admin |
| cashier@coop.test | cashier |
| credit@coop.test | credit_officer |
| manager@coop.test | manager |
| accountant@coop.test | accountant |

### 3. Frontend

```bash
cd client
npm install
npm run dev   # http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173 and sign in with any seeded account above.

## Deployment (Vercel + Supabase)

The frontend and backend deploy as **two separate Vercel projects** from
this same repo (one repo, two "Root Directory" settings), backed by a
Supabase Postgres database. Vercel doesn't run long-lived servers, so the
backend runs as a serverless function (`server/api/index.ts` wraps the
same Express `app` with `serverless-http` — local dev still uses
`src/index.ts` with `app.listen`, unchanged).

### 1. Supabase database

1. Create a project at supabase.com (or use an existing one).
2. Project Settings → Database → Connection string, and grab **two**
   connection strings:
   - **Transaction pooler** (port `6543`) → this is `DATABASE_URL`. Append
     `&pgbouncer=true&connection_limit=1` — required because serverless
     functions each open their own short-lived connection, and pgbouncer's
     transaction mode doesn't support Prisma's default prepared
     statements/connection reuse otherwise.
   - **Direct connection** (port `5432`) → this is `DIRECT_URL`, used only
     for running migrations (pgbouncer's pooler can't run them).

### 2. Backend → Vercel project #1

1. New Vercel project, **Root Directory: `server`**.
2. Environment variables: `DATABASE_URL`, `DIRECT_URL` (from Supabase
   above), `JWT_SECRET` (any long random string), `CLIENT_ORIGIN` (the
   frontend's Vercel URL, comma-separated if you need to allow more than
   one — e.g. production + a preview URL).
3. Deploy. The build (`npm run vercel-build`, see `server/package.json`)
   runs `prisma generate && prisma migrate deploy` automatically, so
   migrations apply on every deploy — no separate migration step needed.
4. Note the deployed URL (e.g. `https://coop-mvp-server.vercel.app`) —
   the frontend needs it next.
5. Seed demo users once, from your machine, pointed at Supabase:
   ```bash
   cd server
   DATABASE_URL="<supabase pooler url>" DIRECT_URL="<supabase direct url>" npm run seed
   ```

### 3. Frontend → Vercel project #2

1. New Vercel project, **Root Directory: `client`** (Vercel auto-detects
   the Vite framework preset).
2. Environment variable: `VITE_API_URL` = the backend URL from step 2.4
   above (no trailing slash).
3. Deploy.
4. Go back to the backend project and set `CLIENT_ORIGIN` to this
   frontend's URL if you hadn't already (step 2.2), then redeploy the
   backend so CORS allows it.

### Notes

- `server/vercel.json` routes every request to the one serverless
  function; `client/vercel.json` adds the SPA rewrite so React Router
  routes survive a hard refresh.
- The Prisma schema's `generator` block sets
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]` so the query engine
  matches Vercel's Amazon-Linux runtime, not just your local machine.
- `src/lib/prisma.ts` caches the `PrismaClient` on `globalThis` so a warm
  serverless container reuses its connection instead of opening a new one
  per invocation.

## What's implemented (MVP scope, spec section 6)

- **Membership** — register, edit (audit-logged with before/after), status
  lifecycle (`active → resigned` etc., manager/admin only).
- **Share Capital** — subscription/withdrawal/transfer/dividend entry
  (`pending`), manager approval auto-posts a balanced ledger entry and
  flips status to `posted`. Balance is always a recomputed sum of posted
  transactions — never directly editable.
- **Lending** — `applied → under_review → approved → released(active) →
  repayment(s) → closed`, plus `past_due` auto-detected from the
  amortization schedule vs. actual repayments. Flat/simple-interest,
  equal-installment schedule per spec 4.3 (see note below on the rate
  assumption). Release and each repayment auto-post balanced ledger
  entries (repayments are split into principal/interest portions).
- **Cash Management** — general cash journal (petty cash, cash advances,
  bank deposits, misc. collections/disbursements), every entry requires a
  unique official receipt number and posts to the ledger.
- **Accounting** — General Ledger (filterable by date range / account
  code) and Trial Balance, both read-only and 100% system-generated —
  there is no UI or endpoint for posting a manual ledger entry.
- **Audit Trail** — every create/update/approve/reject across all
  modules writes an append-only `AuditLog` row; each entity detail page
  has an "Activity Log" tab that renders it in plain language.
- **RBAC / segregation of duties** — enforced **server-side** via
  Express middleware (`requireRole`), not just hidden in the UI. In
  particular: a cashier can create transactions but cannot approve
  loans or share capital transactions (verified against the running API,
  see below).
- **Dashboard** — live counts (active members, active/past-due loans,
  total share capital, cash position) computed from the database, not
  hardcoded.

### Verified against the definition of done (spec section 6)

All of the following were exercised end-to-end against the running API
and UI while building this:

- Registered a member → visible in Members list and system of record.
- Subscribed share capital as cashier (`pending`) → approved as manager
  → posted with a balanced debit/credit ledger entry.
- Applied for a loan → reviewed → approved → released → repayment
  recorded → outstanding balance updates correctly; a cashier attempting
  to approve a loan is rejected with `403` server-side.
- Recorded a cash transaction with a required OR number.
- General Ledger and Trial Balance reflect posted transactions with
  debits = credits (verified `balanced: true` in the Trial Balance
  response).
- Activity Log tab shows every create/update/approve action in plain
  language for the entities exercised above.
- Dashboard counts came from real seeded/created data, not hardcoded
  values.

## Design decisions & open questions (spec section 8)

The spec flagged these as unconfirmed; here's what the MVP assumes so it
could be built, and what should be revisited with the actual cooperative:

1. **Savings/deposits vs. share capital** — *unconfirmed.* The MVP
   implements share capital only, per spec. No savings/deposit account
   entity exists yet — add as a new module if the cooperative treats it
   as a distinct product.
2. **Chart of accounts** — *no existing chart was supplied,* so a minimal
   one was proposed for this prototype (`server/src/lib/accounts.ts`):
   Cash on Hand, Cash in Bank, Loans Receivable, Members' Share Capital,
   Interest Income, Penalty Income, Petty Cash Fund, Cash Advances, and
   two sundry/other accounts for the general cash journal. This should be
   reconciled with the cooperative's real books before this goes beyond
   prototype stage.
3. **UI/branding** — no existing branding was supplied; a clean, plain
   Tailwind UI was used per spec's "fine for prototype" guidance.
4. **Loan interest rate convention** — the spec's formula is
   `total interest = principal × rate × term`. This MVP treats `rate` as
   a **flat monthly rate** (e.g. `0.02` = 2%/month), which is how many
   Philippine cooperative loan products are quoted. **If this
   cooperative's real loan products quote an annual rate instead**, the
   formula in `server/src/lib/loanSchedule.ts` needs to change to
   `principal × annualRate × (termMonths / 12)` — flagged here as
   instructed by the spec, pending confirmation against real loan
   products.
5. **Penalties** — modeled as an immediate cash collection posted to a
   Penalty Income account (not added to the amortization schedule's
   outstanding balance). Simplification for MVP; revisit if the
   cooperative's penalty policy adds penalties to principal instead.

## Non-goals for this MVP (spec section 7)

Not built, by design: governance module, full CDA/CAIS compliance
dashboard, Social/Performance/Government audit modules, multi-branch
support, savings/deposits as a distinct product, store/trading/
insurance/transport lines, data migration tooling, and production
deployment/backups/DR.

## API surface (for reference)

All endpoints are under `/api` and (except `/api/auth/login` and
`/api/health`) require `Authorization: Bearer <token>`.

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST/PATCH /api/members`, `POST /api/members/:id/status`
- `GET/POST /api/share-capital/transactions`,
  `POST /api/share-capital/transactions/:id/approve|reject`
- `GET/POST /api/loans`, `POST /api/loans/:id/review|approve|reject|release`,
  `POST /api/loans/:id/repayments`, `POST /api/loans/:id/penalties`
- `GET/POST /api/cash/transactions`
- `GET /api/accounting/ledger`, `GET /api/accounting/trial-balance`
- `GET /api/audit/:entityType/:entityId`
- `GET /api/dashboard`

## Role permission matrix (server-enforced)

| Action | cashier | credit_officer | manager | accountant | admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Register/edit member | | | ✓ | ✓ | ✓ |
| Change member status | | | ✓ | | ✓ |
| Record share capital txn | ✓ | | ✓ | ✓ | ✓ |
| Approve/reject share capital txn | | | ✓ | | ✓ |
| Apply for loan / move to review | | ✓ | | | ✓ |
| Approve/reject loan | | | ✓ | | ✓ |
| Release loan / record repayment | ✓ | | | | ✓ |
| Record cash transaction | ✓ | | | ✓ | ✓ |
| View ledger / trial balance / dashboard / audit log | ✓ | ✓ | ✓ | ✓ | ✓ |
