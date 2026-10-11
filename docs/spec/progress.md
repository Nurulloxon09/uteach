# Progress

> PROPOSED: the status table format and symbols. The file itself comes from your file tree, not the canvas.


Claude updates this file at the end of every work session and when a milestone's "done when" list is complete.
Format: newest first. Keep it short and factual.

## Current milestone
**M2 · Attendance**: ◐ planned 2026-10-11, not started. Three PRs: M2a data layer → M2b sheet, Today and
notify prompts → M2c matrix and export. The plan and its decisions are in `30-milestones.md` (M2) and the
`PROPOSED (M2 plan)` notes in 02, 13, 14, 17 and 05-ui.

## Milestones
| # | Milestone | Status | Finished |
|---|---|---|---|
| M0 | Foundation | ☑ done | 2026-10-11 |
| M0.5 | UI foundation | ☑ done | 2026-10-11 |
| M1 | Academic core | ☑ done | 2026-10-11 |
| M2 | Attendance | ◐ planned (M2a, M2b, M2c) | |
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
| CI on PRs | ☑ | GitHub Actions on PR #1: checks, Supabase DB tests, e2e and Docker build all green |
| E2E happy path | ☑ | `pnpm e2e`: 3 tests pass against local Supabase (2026-10-11) |

## M2 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| 375 px: 15 students in < 30 s ("all present" + 2 exceptions); a save is one request | ☐ | |
| Expected students = active on the date minus freezes (start/end/freeze edge tests) | ☐ | |
| Teacher edits until `ends_at + 48h`, denied after at the DB level; admin late edits audited | ☐ | |
| First save sets the lesson `held` | ☐ | |
| Matrix: month with correct % (excused excluded); Excel export | ☐ | |
| Absent → one outbox row per notifiable guardian, +10 min, dedupe; re-save no duplicate; change cancels; 22:00 → quiet-hours end | ☐ | |
| Attendance unique (lesson, student) enforced | ☐ | |

## M1 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| Mon/Wed/Fri 18:00 → exactly the right lessons for 8 weeks (branch tz); 2nd run = 0 rows | ☑ | pgTAP + Vitest; e2e `m1-schedule` (group dialog → 24 lessons) |
| Holidays skipped; adding one cancels that day's generated lesson | ☑ | pgTAP; Settings → Holidays screen |
| Room/teacher clash: DB rejects the 2nd lesson; conflict in the inbox | ☑ | pgTAP; e2e (8 Monday clashes in the inbox, skip one) |
| Rule edits regenerate only future, untouched lessons | ☑ | pgTAP (held, moved, cancelled, substituted lessons survive); rules editor with conflict pre-check |
| Timetable week/day by room/teacher; drag; conflicting drop refused | ☑ | e2e: clashing drop refused with the DB message, free drop moves the lesson |
| Cancel, makeup, substitute; substitute sees it in Today | ☑ | pgTAP; e2e (cancel, extra lesson, substitute → teacher's Today at 390 px) |
| Guardian with existing phone is linked; "also guardian of" | ☑ | pgTAP; e2e `m1-students` (siblings share a guardian; profile shows "also guardian of") |
| Enroll / freeze / transfer / end with date rules + `audit_log` | ☑ | pgTAP (dates, audit rows); e2e (enroll, freeze, transfer, end) |
| Teachers see only their groups and rosters (names; no phones, no prices) | ☑ | pgTAP negatives (incl. `student_overview`); e2e (teacher roster shows names, no phone, no students pages) |
| Import: 300 rows, mapping, re-import without duplicates, row/column errors | ☑ | e2e `m1-onboarding` (300-row file, again → 0 new, broken file → errors, nothing written); Vitest (validation, 300 rows); pgTAP `m1d_import.test.sql` (all-or-nothing, permissions) |
| Onboarding wizard steps 1–6 resumable | ☑ | e2e `m1-onboarding` (leave after step 4, "Continue setup" on Home resumes at step 5) |
| `expandRules()` tests: validity windows, group start/end, holidays, DST | ☑ | Vitest (`schedule.test.ts`) + SQL parity test on the same fixtures |

## M0.5 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| Tokens equal 05-ui §2; no raw colors in `apps/web/src` | ☑ | `globals.css`; `uteach/no-raw-colors` lint rule (unit tested, verified it fires; runs in CI via `pnpm lint`) |
| Plus Jakarta Sans + Manrope for Cyrillic; `ru` pages consistent | ☑ | `staff-ru-*.png`, `/dev/ui` typography block (uz/ru/en specimens) |
| `/dev/ui` shows every pattern, uz/ru/en, 404 in production | ☑ | `dev-ui-*.png`; e2e "/dev/ui is available in development and 404 in production" (404 branch runs in CI on `pnpm start`); `next build` prerenders it as the 404 page |
| Side-by-side screenshots 1440/390 saved; owner approves | ☑ | `docs/design/screenshots/compare/` (9 pairs); approved by the owner 2026-10-11 |
| All M0 screens on `AppShell` + patterns; Staff is a `ListPage`; invite is a `FormDialog` | ☑ | Auth, onboarding, invite, home, today, staff, center, branches, branch detail + rooms |
| Sidebar shows only allowed items (teacher: Today only) | ☑ | e2e: owner sees Home/Staff/Settings; teacher drawer has exactly one link (Today) |
| Keyboard: dialog traps focus, Esc closes; drawer opens/closes with keyboard | ☑ | e2e: 12 Tabs stay in the invite dialog, Esc closes and focus returns; drawer Esc closes, focus returns to the menu button |
| Typecheck, lint, unit, i18n, existing M0 e2e pass | ☑ | `pnpm typecheck && pnpm lint && pnpm test && pnpm check:i18n && pnpm db:test:lite && pnpm e2e` all green (2026-10-11); `next build` passes |

## Log

### 2026-10-11 · M2 planned
- Plan: three PRs (M2a data layer → M2b sheet, Today and notify prompts → M2c matrix and export); see
  `30-milestones.md` (M2).
- Decisions recorded as `PROPOSED (M2 plan)` in 02, 05-ui, 13, 14, 17 and 30, including: trial guests move wholly
  to M5; `notification_templates` created in M2 (Telegram seed only); quiet-hours columns move from M4 to M2 and
  `late_alert_enabled` is new; attendance is written only through `save_attendance` (no direct grants); alerts only
  inside the edit window; the 30-minute rule applies to admins too; a new `lesson_added` key; "notify students?" on
  cancel/move/makeup (default on) and holidays (opt-in); an admin Attendance page; outbox readable by owners only
  until M4.
- No code yet.

### 2026-10-11 · M1 done
- All four M1 PRs merged into `main` with green CI: M1a (#3), M1b (#4), M1c (#5), M1d (#6). PR #6 and the
  `main` run after its merge passed all 4 checks (typecheck/lint/unit/build, Supabase migrations + RLS,
  Playwright, Docker images).
- Every M1 "done when" item is checked (table above).

### 2026-10-11 · M1d onboarding wizard and Excel import
- Wizard: steps 1–2 (center + logo, first branch) → rooms → course presets (IELTS, General English, … with levels)
  → import → staff; skip or "Finish later" anywhere; progress in `centers.settings.onboarding`; Home shows
  "Continue setup" until done and new checklist items (first group, students) plus Students/Groups tiles.
- Excel import page (students, groups, enrollments): template download per kind and language, FileDrop upload
  straight to Storage, auto-guessed column mapping (uz/ru/en headers + aliases), check with row/column problems
  (nothing written), one all-or-nothing import; matched rows are skipped.
- Migration `20261014090000_m1d_import.sql` (storage buckets + policies, import RPCs); pgTAP `m1d_import.test.sql`
  (17 checks; 184 in total). Core: `import.ts` (header matching, cell parsing) + tests; web: `lib/import/*`.
- New patterns `Stepper` and `FileDrop` (on /dev/ui). Fixed a timetable hydration warning (stable dnd-kit id).
- e2e `m1-onboarding.spec.ts` (M1 happy path: wizard → course → group → student with guardian → timetable; and
  import); helpers now pass the wizard with "Finish later". 12 e2e tests pass.

### 2026-10-11 · M1c students and enrollments
- Students list (`student_overview` view: search by name, phone or guardian phone; branch, group, course and
  active/inactive filters) with an Add dialog (first guardian optional; duplicate warning, save again to add).
- Student page: Groups (enroll, freeze, transfer, end; "moved to the next level" offers the next level's groups),
  Guardians (shared by phone, "also guardian of", main contact and message settings, edit/unlink), Notes (pin,
  visible to teachers, own notes editable).
- Group page Roster tab: staff add students and freeze/transfer/end; teachers see names only (`group_roster()`).
- Migration `20261013090000_m1c_student_overview.sql` (view only); 5 more pgTAP checks; e2e `m1-students` (2 tests).

### 2026-10-11 · M1b courses, groups and schedule screens
- Settings → Courses (list, course page with ordered levels and next level) and Holidays (add cancels that day's
  lessons; removing brings them back). Groups list ("My groups" for teachers) and group page: Lessons (move,
  cancel, makeup, substitute, extra lesson), Weekly times (rules editor with the conflict pre-check), Price
  (history, "from which month?", `billing` only).
- Schedule: new `Timetable` pattern (week/day, by room or teacher, lanes for overlaps, `@dnd-kit` drag with
  keyboard support and translated announcements), conflicts inbox (skip or place elsewhere); a day list below `md`.
- Teacher's Today lists today's and this week's lessons (incl. substitute lessons); tapping opens the group.
- Staff: "Edit member" dialog (name, branches, admin flags for owners, timetable color); color when inviting teachers.
- New patterns on /dev/ui: Timetable, LessonList, WeeklySlotsField, PaletteField, SegmentedControl; palette tokens.
- e2e `m1-schedule.spec.ts` (2 tests); M0.5 drawer test now expects Today + My groups. Test OTP phones 09–20 added.

### 2026-10-11 · M1a data layer
- Migration `20261012090000_m1_academic.sql`: courses, levels, groups, group_prices, group_schedule_rules, lessons
  (room/teacher exclusion constraints), holidays, schedule_conflicts, students, guardians, student_guardians,
  student_notes, enrollments, enrollment_freezes, import_jobs; RLS helpers; RPCs for groups, rules, lessons,
  holidays, guardians, rosters and enroll/freeze/transfer/end; pg_cron jobs `generate_lessons` (daily) and
  `refresh_enrollment_statuses` (hourly). Billing hook is a no-op until M3.
- `packages/core/schedule`: `expandRules`, `generationRange`, `parseWeekdays`, `suggestGroupName`, shared fixtures.
- Tests: pgTAP `m1_academic.test.sql` (99 checks; 162 in total, real Supabase and PGlite), SQL/TS parity test in
  `packages/db` (PGlite), Vitest. `scripts/pglite.mjs` shares the PGlite setup (now with `btree_gist`).
- DB types regenerated; 25 new SQL error codes with uz/ru/en messages.
- Decisions recorded as PROPOSED (M1) in 01, 02, 05-ui, 10, 12, 13 and 30, including: teachers read rosters only
  through `group_roster()`; `lessons.rule_date` as the idempotency key (moves don't regenerate the old day);
  palette keys for teacher colors; course default price readable only with `billing`; opening-balance import in M3.

### 2026-10-11 · M0.5 done
- Owner approved the side-by-side screenshots; PR #2 set to merge when CI is green.

### 2026-10-11 · M0.5 built
- Tokens, radius scale, shadows and fonts from the reference in `globals.css`; shadcn primitives (button, input,
  checkbox, dialog, sheet, tabs, popover, command, select, dropdown, table, tooltip, sonner, …) restyled to match.
- `components/patterns`: AppShell (sidebar, drawer, Go-to palette, center/language/user menus), PageHeader, Section,
  StatTiles, ActivityList, DataTable (+ mobile cards), TableSearch, FilterButton, Pagination, RowActions,
  FormDialog, ConfirmDialog, fields + Combobox/TimezoneField, StatusChip, InitialsAvatar, ProfileCard, DetailPage,
  MobileList, StatusToggleGroup, Empty/Error/Loading states, AuthLayout.
- Every M0 screen moved onto them. Staff and Branches are list pages with search, filters and pagination in the URL;
  invite, add branch, add/edit room are dialogs; branch detail has Details/Rooms tabs.
- `/dev/ui` kit with fake data (dev only). New e2e `m0.5-ui.spec.ts` (3 tests); M0 e2e updated for the new UI;
  shared helpers in `e2e/helpers.ts`; `pnpm typecheck` now also checks the e2e folder.
- Fixed while testing: server pages passed icon components to the client `FilterButton` (now an element);
  focus didn't return to the menu button after closing the drawer; the detail-page grid overflowed at 390 px.
- New decisions recorded as PROPOSED in `05-ui.md` §6b (restore without confirm, lint rule, mobile row actions,
  icon elements, `pnpm screenshots`).
- No database changes.


### 2026-10-11 · M0 done, M0.5 started
- GitHub repo `Nurulloxon09/uteach` (private). PR #1 (M0) green on all 4 CI jobs and merged into `main`.
- The repo is linked to a Vercel project; `vercel.json` turns off Git deployments (hosting is the VPS).
- M0.5 plan approved with changes (see `05-ui.md` §6b, §7): /dev/ui login bypass only outside production,
  charts first needed in M7, no phone-preview iframe, Today for anyone with lessons from M2.
- Reference screenshots saved in `docs/design/screenshots/reference/` (1440 px and 390 px).


### 2026-10-11 · UI direction decided
- Owner wants uteach to look like the reference app (`C:\Users\user\Desktop\visual-fidelity-toolkit`, the "Spik" dashboard look).
- Added `docs/spec/05-ui.md` (tokens, fonts, layout, patterns, what not to copy), `docs/design/reference/` (copies of the reference UI files), milestone **M0.5 · UI foundation** in 30 (before M1), and a UI section in CLAUDE.md.
- Plus Jakarta Sans has no basic Cyrillic; Manrope is the proposed fallback for Russian (check visually in M0.5).
- Next: finish M0 (CI), then plan M0.5, then M1.

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
- Phone numbers show unformatted in staff lists (`+998931234567`); formatting with `packages/core` phone helpers can come with M1 lists.
- Dark mode tokens exist in `globals.css` but are unused (light mode only, per 05-ui).
- CI's e2e job uses only `test_otp` numbers, which skip the Send-SMS hook, so `host.docker.internal` on Linux runners doesn't matter.
- Verify the SAT / CEFR / Milliy sertifikat score ranges and grade mappings against official sources before M6.
- "Upcoming events page" (from brainstorm) has no milestone yet; decide in M15 planning.
