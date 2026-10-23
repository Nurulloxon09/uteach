# uteach

Multi-tenant SaaS that runs learning centers: students, groups, schedule, attendance, payments, exam scores, payroll, with parents kept up to date over Telegram.

The spec lives in [`docs/spec/`](docs/spec/00-readme.md) and is the source of truth. Progress: [`docs/spec/progress.md`](docs/spec/progress.md).

## Requirements

- Node.js 22+ (24 recommended) with Corepack (`corepack enable pnpm`)
- Docker Desktop, for the local Supabase stack (`pnpm db:start`)

## First run

```bash
pnpm install
pnpm db:start                # local Supabase in Docker; prints the API URL and keys
cp apps/web/.env.example apps/web/.env.local
# put the anon / publishable key from `supabase status` into NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
pnpm dev                     # http://localhost:3000
```

Sign up at `/uz/signup`. SMS codes are printed in the `pnpm dev` terminal (`[sms:console] …`).
The numbers `+998 99 000 00 01` … `09` always use the code `123456` and never send an SMS (handy for demos and e2e tests).

## Commands

| Command                             | What it does                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Web app in dev mode                                                                     |
| `pnpm --filter @uteach/worker dev`  | Worker in watch mode (skeleton until M4)                                                |
| `pnpm build`                        | Build every app                                                                         |
| `pnpm typecheck`                    | TypeScript in every package (web runs `next typegen` first)                             |
| `pnpm lint`                         | ESLint (bans hard-coded UI strings in JSX)                                              |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                |
| `pnpm test`                         | Unit tests (Vitest)                                                                     |
| `pnpm check:i18n`                   | uz/ru catalogs have exactly the keys of en                                              |
| `pnpm db:start` / `pnpm db:stop`    | Local Supabase                                                                          |
| `pnpm db:reset`                     | Recreate the local DB from `supabase/migrations`                                        |
| `pnpm db:test`                      | pgTAP tests against local Supabase (needs Docker)                                       |
| `pnpm db:test:lite`                 | Same tests in PGlite, no Docker needed (lower fidelity)                                 |
| `pnpm db:types`                     | Regenerate `packages/db/src/database.types.ts` from the local DB                        |
| `pnpm dev:access`                   | Local only: one login (`+998990000099` / `uteach-owner`) as owner of every local center |
| `pnpm demo:seed --url <db url>`     | Builds or resets the public teacher demo (`/demo`); see `scripts/demo-seed.mjs`         |
| `pnpm e2e`                          | Resets the local DB, then runs Playwright e2e (needs `.env.local`)                      |

## Layout

```
apps/web        Next.js app: staff UI, /api/auth/sms-hook, later /tg and /api/pay
apps/worker     Telegram bot + outbox sender (M4)
packages/core   Pure business logic: money, phone numbers, time zones
packages/db     Database types, permission flags, DB error codes
packages/i18n   Locales, message catalogs (en is the source), money formatting
packages/adapters  SMS (and later payment) adapters
packages/config Shared TypeScript / ESLint config
supabase/       Migrations, pgTAP tests, local config
docker/         Dockerfiles, compose, Caddyfile
docs/           Spec + canvas
```

## Troubleshooting

- **`ERR_SWC_NATIVE_CACHE` when running Next commands** (seen in sandboxed shells on Windows): point SWC at a cache folder inside the repo, e.g. `SWC_NATIVE_BINDING_CACHE=<repo>/node_modules/.cache/swc`. You can put that line in `apps/web/.env.local`.
- **Sign-up says the SMS couldn't be sent**: the web app must be running, because Supabase Auth calls `http://host.docker.internal:3000/api/auth/sms-hook`, and `SEND_SMS_HOOK_SECRET` in `.env.local` must equal `[auth.hook.send_sms].secrets` in `supabase/config.toml`.
