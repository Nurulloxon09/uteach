# Progress

> PROPOSED: the status table format and symbols. The file itself comes from your file tree, not the canvas.


Claude updates this file at the end of every work session and when a milestone's "done when" list is complete.
Format: newest first. Keep it short and factual.

## Current milestone
**M0 · Foundation**: ◐ in progress. Every "done when" item is verified locally against real Supabase except **CI on PRs**, which needs the GitHub repo (`gh auth login` is still pending).

## Milestones
| # | Milestone | Status | Finished |
|---|---|---|---|
| M0 | Foundation | ◐ in progress | |
| M1 | Academic core | ☐ | |
| M2 | Attendance | ☐ | |
| M3 | Billing | ☐ | |
| M4 | Telegram & SMS | ☐ | |
| M5 | Leads CRM | ☐ | |
| M6 | Exam scores | ☐ | |
| M7 | Launch 🚀 | ☐ | |
| M8 | Online payments | ☐ | |
| M9 | Mini App | ☐ | |
| M10 | Payroll | ☐ | |
| M11 | Finance | ☐ | |
| M12 | Analytics | ☐ | |
| M13 | Leads v2 & packages | ☐ | |
| M14 | Learning | ☐ | |
| M15 | Growth | ☐ | |
| M16 | API & webhooks | ☐ | |
| M17 | Mock engine + AI | ☐ | |
| M18 | Expansion | ☐ | |

Status values: ☐ not started · ◐ in progress · ☑ done (all "done when" items checked).

## M0 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| Fresh clone: `pnpm i && supabase start && pnpm dev` | ☑ | Clean `pnpm install` on D:, `supabase start`, `pnpm dev` (2026-10-11) |
| Sign up with phone + OTP, set password, log in, log out, reset | ☑ | e2e tests 1–2 (sign-up + OTP; log out; log in; forgot → code → new password; old password rejected). Real SMS path checked: Auth → `/api/auth/sms-hook` → console adapter, text in the user's locale |
| `create_center` atomic, rollback proven | ☑ | pgTAP tests 4–10 on real Supabase |
| Owner CRUD branches (timezone) and rooms, archive | ☑ | e2e tests 1 and 3 (add branch, add room, archive room) + RLS tests |
| Invites: once, 7 days, exact role | ☑ | pgTAP tests 11–20; e2e test 1 (teacher accepts via link) |
| Disabled member loses access next request | ☑ | pgTAP tests 51–54; e2e test 3 (disabled teacher lands on onboarding) |
| RLS: other center sees nothing; admin branch scope; teacher limits | ☑ | pgTAP tests 21–48 (63 checks; all pass on real Supabase and in PGlite; mutation-checked) |
| CI fails if a public table has RLS off | ☑ | pgTAP test 1 |
| UI in uz/ru/en; no hard-coded strings | ☑ | `react/jsx-no-literals` lint rule (verified it fires); `pnpm check:i18n`; uz/ru pages checked in the browser |
| `packages/core` money/phone/tz helpers tested | ☑ | 26 unit tests incl. the 15-payments worked example and DST |
| CI on PRs | ◐ | `.github/workflows/ci.yml` written; not run yet: no GitHub repo (`gh auth login` pending) |
| E2E happy path | ☑ | `pnpm e2e`: 3 tests pass against local Supabase (2026-10-11) |

## Log

### 2026-10-11 · M0 verified on real Supabase
- Docker Desktop installed; its disk moved to `D:\Docker` after C: filled up and the old disk went read-only. Project moved to `D:\uteach\uteach`; pnpm store at `D:\.pnpm-store`; Playwright browsers at `D:\ms-playwright`.
- `supabase test db`: 63/63 pass. Types regenerated from the live schema (`pnpm db:types`); one fix (the `create_center` address argument is optional, not nullable).
- e2e extended to 3 tests (sign-up/invite; log in/out/reset; archive + disable); all pass. `pnpm e2e` now resets the local DB first.
- Local `supabase/config.toml`: placeholder Twilio provider enabled, because the CLI turns phone login off unless a provider is on (the Send-SMS hook still does all sending); SMS resend limit 5 s locally (hosted: 60 s).
- `next dev` adds `apps/web/AGENTS.md` (pointer to the bundled Next docs); committed.

### 2026-10-10 · M0 build
- Monorepo: `apps/web` (Next.js 16.4, next-intl, shadcn/ui), `apps/worker` (skeleton), `packages/{core,db,i18n,adapters,config}`; pnpm 12, TypeScript 5.9.
- DB: migration `20261010120000_m0_foundation.sql` (profiles, centers, branches, rooms, memberships, audit_log; RLS helpers; `create_center`, `create_invite`, `regenerate_invite`, `get_invite`, `accept_invite`). 63 pgTAP checks.
- Web: sign up / verify / log in / forgot / reset, onboarding (create center), invite page, home, today, staff (invite, link, disable), center settings, branches + rooms. Supabase Send-SMS hook → console SMS adapter.
- Docker (web, worker, compose, Caddy) and CI workflow (checks, database, e2e, docker) written.
- Spec fix: the worked example in 15 now follows its own formula (49 846 153 tiyin before rounding; the result is still 498 000 UZS).
- New decisions, recorded as `> PROPOSED (M0)` in 01, 02 and 10 (covered by the standing approval):
  - PGlite test runner (`pnpm db:test:lite`); tsup/tsx/Prettier; `cacheComponents` off.
  - OTP via HTTP Send-SMS hook → `/api/auth/sms-hook`; fixed test codes for `+99899000000x`.
  - Teachers see only their own membership row (02 said all members).
  - `profiles` own-row only; no `staff_directory` view yet.
  - `centers` gets only M0 columns now; the rest come with their milestones.
  - Composite FKs keep child rows in the parent's center; SQL error codes map to `errors.db.*`.
  - Phone kept in an httpOnly cookie during OTP; current center in `uteach_center` cookie.
  - Per-phone OTP limit and the teacher colour picker moved to M4 / M1.
- Blocked here: no Docker (local Supabase), and the GitHub CLI token is invalid (can't create the repo, so CI hasn't run).

### 2026-10-10
- **All `> PROPOSED:` items in the spec are confirmed by the user**, as is every later proposal (the M0 plan included). The markers stay as a record of which decisions didn't come from the canvas.
- Spec written from the canvas (`docs/uteach.canvas`) into `docs/spec/`. No code yet.
- Decisions made while drafting, to confirm (see "Open questions" in 02):
  - Auth = phone + password, with SMS OTP for sign-up verification and reset (the canvas mentions both "phone+OTP" and "phone + password").
  - `group_prices` table added (keeps prices away from teachers; price history).
  - `audit_log` moved to M0 (needed by M2 and M7).
  - Charges are per enrollment per month; unexcused absences are still billed.

## Known gaps / follow-ups
- Create the GitHub repo and get CI green (needs `gh auth login`). That is the last open M0 item.
- CI's e2e job uses only `test_otp` numbers, which skip the Send-SMS hook, so `host.docker.internal` on Linux runners doesn't matter.
- Verify the SAT / CEFR / Milliy sertifikat score ranges and grade mappings against official sources before M6.
- "Upcoming events page" (from brainstorm) has no milestone yet; decide in M15 planning.
