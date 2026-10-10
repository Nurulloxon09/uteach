# Progress

> PROPOSED: the status table format and symbols. The file itself comes from your file tree, not the canvas.


Claude updates this file at the end of every work session and when a milestone's "done when" list is complete.
Format: newest first. Keep it short and factual.

## Current milestone
**M0 · Foundation**: ◐ in progress. All code is written and the checks that run without Docker pass. The items that need a real Supabase (Docker or CI) are still open; see the checklist below.

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
| Fresh clone: `pnpm i && supabase start && pnpm dev` | ◐ | install + dev verified; `supabase start` not run (no Docker on the dev machine) |
| Sign up with phone + OTP, set password, log in, log out, reset | ◐ | built; validation, translations and the SMS hook (signed 200 / bad signature 401, code printed via console adapter) checked in the browser; full flow needs Supabase (e2e covers sign-up + OTP) |
| `create_center` atomic, rollback proven | ☑* | pgTAP tests 4–10 |
| Owner CRUD branches (timezone) and rooms, archive | ◐ | built; RLS tests pass; UI flow covered by e2e, not yet run |
| Invites: once, 7 days, exact role | ☑* | pgTAP tests 11–20 |
| Disabled member loses access next request | ☑* | pgTAP tests 51–54 |
| RLS: other center sees nothing; admin branch scope; teacher limits | ☑* | pgTAP tests 21–48 (63 checks total, mutation-checked) |
| CI fails if a public table has RLS off | ☑* | pgTAP test 1 |
| UI in uz/ru/en; no hard-coded strings | ☑ | `react/jsx-no-literals` lint rule (verified it fires); `pnpm check:i18n`; uz/ru pages checked in the browser |
| `packages/core` money/phone/tz helpers tested | ☑ | 26 unit tests incl. the 15-payments worked example and DST |
| CI on PRs | ◐ | `.github/workflows/ci.yml` written; never run (no GitHub remote yet) |
| E2E happy path | ◐ | `apps/web/e2e/m0-foundation.spec.ts` written; needs Supabase |

\* verified in PGlite (`pnpm db:test:lite`). Still to confirm with `supabase test db` against real Supabase (CI `database` job, or locally once Docker is installed).

## Log

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
- Run `supabase test db` and the e2e test against real Supabase (Docker locally, or CI after the GitHub repo exists).
- `packages/db/src/database.types.ts` is hand-written; regenerate with `pnpm db:types` once Docker runs and diff.
- Check that Supabase's `test_otp` numbers skip the Send-SMS hook in CI (Linux runners may not resolve `host.docker.internal`).
- Verify the SAT / CEFR / Milliy sertifikat score ranges and grade mappings against official sources before M6.
- "Upcoming events page" (from brainstorm) has no milestone yet; decide in M15 planning.
