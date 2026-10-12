# 01 · Tech stack & architecture

The stack is **fixed**. Don't add frameworks, ORMs or services without changing this note first.

## Stack

> PROPOSED: TypeScript **strict** mode; DB tests against local Supabase. (Everything else in this table is on the canvas.)


| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Repo | pnpm workspaces monorepo |
| Web | **Next.js** (App Router, Server Components, Server Actions) |
| UI | Tailwind CSS + shadcn/ui |
| DB / Auth / Storage | **Supabase**: Postgres + RLS, Auth, Storage, Vault, pg_cron |
| Worker | Node process: **grammY** Telegram bot + outbox sender |
| i18n | next-intl; locales `uz`, `ru`, `en` |
| Validation | zod (shared schemas for forms, actions and API) |
| Tests | Vitest (unit, plus DB tests against local Supabase); Playwright (e2e) |
| Hosting | ~€5 VPS with Docker Compose (`web`, `worker`, `caddy`) + Supabase (free → Pro) |

No Vercel Hobby: its terms are non-commercial.

> PROPOSED (M1d): storage buckets `center-assets` (public read; owners write `{center_id}/…`) and `imports`
> (private; staff with `import` read/write `{center_id}/…`) are created by the M1d migration. `receipts` and
> `attachments` arrive with M3 and M11. `exceljs` is a server external package in `next.config.ts`.

> PROPOSED (M1): two libraries join the web app: **exceljs** (reads `.xlsx`/`.csv` for Excel import and writes the
> localized template files) and **@dnd-kit/core** (accessible drag and drop with keyboard support for the timetable).

> PROPOSED (M3 plan): **`@react-pdf/renderer`** renders receipts (80 mm and A4) in a new `packages/receipts`
> (Node, no browser), with Plus Jakarta Sans and Manrope TTF files bundled for Latin and Cyrillic. The
> receipt-number concurrency test uses **`postgres`** (postgres.js, dev dependency of `packages/db`) to open 20
> real connections to the local/CI Supabase; it runs in CI's database job.

> PROPOSED (M0): the GitHub repo is linked to a Vercel project (team "student-union"), which deploys every push by default. `vercel.json` sets `git.deploymentEnabled: false` so only our own CI runs on PRs. Remove it if Vercel previews are wanted later.


> PROPOSED (M0): build tooling not in the table above: **tsup** bundles the worker (workspace packages inlined), **tsx** runs it in dev, **Prettier** formats. `cacheComponents` in Next 16 stays **off** because every staff page reads the user's cookies. Next 16 renamed middleware to `src/proxy.ts`.

> PROPOSED (M0): **`pnpm db:test:lite`** runs the migrations and pgTAP tests in PGlite (Postgres in WebAssembly) with a small stand-in for Supabase's `auth` schema. It needs no Docker, so it runs on any laptop and as a fast CI step. It is lower-fidelity than `supabase test db`, which stays the real check in CI (`database` job).

## Repo layout

> PROPOSED: the whole layout except `apps/web` and `apps/worker` (the `packages/*`, `supabase/`, `docker/` folders), and the rule that pure business logic lives in `packages/core` with SQL mirrors tested against the same fixtures.


```
uteach/
├── apps/
│   ├── web/            Next.js app (staff UI, /tg Mini App, /api routes)
│   └── worker/         grammY bot + outbox sender + heartbeat
├── packages/
│   ├── db/             generated Supabase types, typed query helpers
│   ├── core/           pure domain logic: proration, FIFO, IELTS rounding, pay rules, schedule expansion
│   ├── i18n/           message catalogs (uz/ru/en), formatters (money, dates)
│   ├── adapters/       payments (payme, click, uzum), sms (eskiz), messaging interfaces
│   └── config/         eslint, tsconfig, tailwind presets
├── supabase/
│   ├── migrations/     SQL migrations (the only way the schema changes)
│   ├── seed.sql        dev seed data
│   └── tests/          pgTAP / SQL tests for RLS and constraints
├── docs/               this spec + canvas
└── docker/             Dockerfiles, compose, Caddyfile
```

Pure business logic (money maths, proration, schedule expansion, rounding, payroll formulas) lives in `packages/core`. It has no I/O and is unit tested. The web app, worker and SQL call it or mirror it. If logic must run in SQL (e.g. pg_cron jobs), the SQL version is tested against the same fixtures.

## Runtime architecture

> PROPOSED: the Mini App API uses the service role scoped by the Telegram link; the `detect_at_risk` and `expire_centers` jobs shown in the diagram notes are not on the canvas.


```
 Staff browser ──► apps/web (Next.js) ──user JWT──► Supabase Postgres (RLS)
 Telegram Mini App ─► apps/web /tg/api ──service role, scoped by telegram link──┘
 Payme/Click/Uzum ──► apps/web /api/pay/* (callbacks, signature-verified)

 Telegram users ◄──► apps/worker (grammY, long polling) ──service role──► Postgres
                       │  outbox sender every 5 s (FOR UPDATE SKIP LOCKED)
                       ├──► Telegram Bot API
                       └──► Eskiz.uz SMS (fallback + auth OTP)

 Postgres pg_cron: generate_lessons, generate_cycle_charges,
                   enqueue_payment_reminders, refresh_analytics
```

### apps/web

> PROPOSED: the service-role allow-list (`/tg/api`, `/api/pay/*`, `/admin`, auth hooks) and the routes `/[locale]/(app)`, `/[locale]/tg`, `/admin`, `/api/leads/capture`, `/api/v1`. Canvas only names `/tg`, `/tg/api` and `/api/pay/*`.

- Staff app: owner and admin on desktop, teacher pages optimised for mobile.
- Server Components read with the **user's session**, so RLS applies. Server Actions mutate with the user's session too.
- The **service role** is used only in: `/tg/api` (Mini App, after `initData` verification), `/api/pay/*` (provider callbacks), `/admin` (super-admin; every tenant read is audited) and auth hooks. Each such use is scoped explicitly in code, and these paths are covered by tests.
- Routes: `/[locale]/(app)/…` staff app, `/[locale]/tg/…` Mini App (🟨 M9), `/admin/…` super-admin, `/api/pay/{payme|click|uzum}` (🟨 M8), `/api/leads/capture` (🟨 M13), `/api/v1/…` public API (⬜ M16).

### apps/worker

> PROPOSED: claim limit, backoff, 30 s heartbeat interval into `system_heartbeats`, super-admin showing stale workers, single instance at first.

- grammY bot using **long polling** (no public webhook needed on the VPS).
- Outbox sender: every 5 s, claims due rows with `FOR UPDATE SKIP LOCKED`, sends, records result, and retries with backoff.
- Heartbeat: upserts `system_heartbeats` every 30 s. Super-admin health shows stale workers.
- Runs as a single instance at first. SKIP LOCKED makes running two safe.

### Supabase

> PROPOSED (M0): OTP texts go through Supabase Auth's **Send SMS hook (HTTP)** → `apps/web` `/api/auth/sms-hook` (Standard Webhooks signature) → `SmsProvider` adapter. The text comes from the i18n catalogs in the user's locale. The console adapter prints codes in dev; Eskiz plugs in at M4. Locally, `supabase/config.toml` lists fixed test codes for `+99899000000x` numbers (e2e tests); they never trigger an SMS.

> PROPOSED: Auth = phone + password with OTP only for sign-up/reset; the four storage buckets and the `{center_id}/…` path rule; what is kept in Vault.

- Postgres with **RLS on every table** (see `03` and `04`).
- Auth: phone + password; OTP for sign-up and reset is delivered through the **Send SMS hook → Eskiz**.
- Storage buckets: `center-assets` (logos), `receipts` (PDF), `attachments` (expenses, homework), `imports` (uploaded Excel). Each bucket has RLS by `center_id` path prefix: `{center_id}/…`.
- Vault: payment provider secrets, Eskiz credentials, bot token.
- pg_cron: scheduled jobs (below).

### Scheduled jobs (all idempotent)

> PROPOSED: all run times (02:00 UTC, 00:30 local hourly per center, 10:00 local); the `detect_at_risk` and `expire_centers` jobs; idempotency enforced by unique constraints + `on conflict`. Canvas gives only the four job names, their frequency and "all idempotent".


| Job | When | Does |
|---|---|---|
| `generate_lessons` | daily 02:00 UTC | Expands active schedule rules to lessons up to 8 weeks ahead; skips holidays; records conflicts |
| `generate_cycle_charges` | daily, 00:30 in each center's timezone (run hourly, acts per center) | Creates the next cycle's charge for enrollments whose current cycle ends today or earlier (see 15) |
| `enqueue_payment_reminders` | daily 10:00 local | Enqueues reminders for debts per center reminder policy |
| `refresh_analytics` | nightly | Refreshes materialised views (🟨 M12) |
| `detect_at_risk` | nightly | Creates and resolves `risk_flags` (🟨, see 14) |
| `expire_centers` | hourly | trial → past_due → read_only transitions |

"Idempotent" means running a job twice gives the same result as running it once, enforced by unique constraints plus `on conflict` clauses rather than by "check then insert".

## Environments

> PROPOSED: the whole section except "Supabase Pro $25 before first paying center" (local `supabase start`, staging on the same VPS, `.env` / `.env.example`).


| Env | DB | Hosting |
|---|---|---|
| local | `supabase start` (Docker) | `pnpm dev` |
| staging | Supabase free project | same VPS, separate compose project |
| prod | **Supabase Pro ($25/mo) before the first paying center** | VPS ~€5/mo |

Secrets come from `.env` files that are never committed. `.env.example` lists every variable.

## CI (GitHub Actions)

> PROPOSED: the whole section. Canvas only says "CI" in M0.

On every PR: typecheck, lint, unit tests, DB tests (local Supabase in CI), build. Playwright runs on main and nightly.
Migrations are applied with `supabase db push` from CI on deploy, never by hand in prod.

## Hosting

> PROPOSED: deploy via GHCR + SSH `docker compose pull`; backups (daily Pro + weekly off-site `pg_dump`). Compose services `web` + `worker` + `caddy` are on the canvas.

- Docker Compose services: `web` (Next.js standalone), `worker`, `caddy` (TLS, reverse proxy).
- Deploys: CI builds images, pushes them to GHCR, then SSH runs `docker compose pull && up -d`.
- Backups: Supabase Pro daily backups, plus a weekly `pg_dump` to off-site storage.
