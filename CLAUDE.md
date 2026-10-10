# uteach

Multi-tenant SaaS that runs learning centers (language schools & exam prep): students, groups,
schedule, attendance, payments & debts, exam scores, teacher payroll. Parents get updates via Telegram.
First market: Uzbekistan (uz/ru, UZS, Click/Payme/Uzum, Eskiz SMS). Code must stay country-agnostic.

## Source of truth

- The spec lives in `docs/spec/`. It is the source of truth. `docs/uteach.canvas` is only the map, for humans.
- Do not read the canvas during normal work. Read it only when asked to sync the spec with it.
- If the spec and the code disagree, the spec wins. If the spec is wrong, change the spec first, then the code.

## Before every task

1. Read `docs/spec/progress.md` to see where we are.
2. Read `docs/spec/04-rules.md`.
3. Read the section of `docs/spec/30-milestones.md` for the current milestone, and the module specs it names.
4. Before touching the database, read the relevant tables in `docs/spec/02-data-model.md` and `03-roles-permissions.md`.

## Non-negotiable rules (from the canvas; details in 04-rules.md)

- RLS on every table; tenant = `center_id` (`03-roles-permissions.md`)
- Money = `bigint` minor units, never floats
- Schedule logic in branch timezone
- All UI text via i18n (uz/ru/en)
- Payments & SMS behind adapters
- Schema changes start in `02-data-model.md`

## Build discipline

- Work only on the milestone named in the task. Never build anything from a later milestone,
  even if it looks easy. Ideas for later go into `30-milestones.md` or an open-questions list, not into code.
- Start every milestone in plan mode: list files, tables, RLS policies, screens and tests,
  plus any question the spec leaves open. Wait for approval before writing code.
- A milestone is done only when every "done when" item in `30-milestones.md` is checked:
  migration + RLS + logic + UI + tests all pass. Pretty screens without working logic are not done.
- At the end of every session, update `docs/spec/progress.md` (what was done, decisions made, known gaps).

## PROPOSED decisions

- Lines marked `> PROPOSED:` in the spec were drafted by Claude and are not yet confirmed by the owner.
- You may follow them, but list every PROPOSED decision your plan depends on, so the owner can confirm it.
- If a task depends on an item in "Open questions" in `02-data-model.md`, stop and ask before building it.
- Never add a new decision silently. Add it to the spec marked `> PROPOSED:` and mention it in `progress.md`.

## Stack (fixed, details in 01-tech-stack.md)

- TypeScript (strict), pnpm workspaces monorepo: `apps/web`, `apps/worker`, `packages/*`
- Next.js App Router + Server Actions, Tailwind + shadcn/ui
- Supabase: Postgres + RLS, Auth, Storage, Vault, pg_cron
- Worker: grammY Telegram bot + outbox sender
- next-intl (uz, ru, en), zod, Vitest, Playwright
- Do not add frameworks, ORMs or services without changing `01-tech-stack.md` first.

## Code conventions

- Pure business logic (money, proration, rounding, schedule expansion, FIFO) lives in `packages/core`,
  has no I/O and is unit tested.
- Staff code uses the user's session so RLS applies. The service role is allowed only where
  `01-tech-stack.md` lists it.
- Every new table ships with RLS tests, including "a member of another center sees nothing".
- No hard-coded colors, fonts or spacing in components. Use theme tokens (CSS variables / Tailwind theme)
  only. Visual design comes later and must be changeable from one place.
- No hard-coded UI strings. Every string goes through next-intl.

## Commands

Fill this in during M0, once the monorepo exists (install, dev, test, lint, typecheck, db reset, gen types).
