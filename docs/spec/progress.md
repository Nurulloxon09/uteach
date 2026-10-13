# Progress

> PROPOSED: the status table format and symbols. The file itself comes from your file tree, not the canvas.


Claude updates this file at the end of every work session and when a milestone's "done when" list is complete.
Format: newest first. Keep it short and factual.

## Current milestone
**M5 · Leads CRM**: ◐ plan. Started by the owner on 2026-10-13 while M4's last item (real SMS) waits for Eskiz
and the hosted Phone provider. The plan and its decisions are in `30-milestones.md` (M5) and the
`PROPOSED (M5 plan)` notes in 02, 03, 05-ui, 11 and 14. Next: M5a (data layer).

## Milestones
| # | Milestone | Status | Finished |
|---|---|---|---|
| M0 | Foundation | ☑ done | 2026-10-11 |
| M0.5 | UI foundation | ☑ done | 2026-10-11 |
| M1 | Academic core | ☑ done | 2026-10-11 |
| M2 | Attendance | ☑ done | 2026-10-12 |
| M3 | Billing | ☑ done 2026-10-12 (#12, #13, #14) | |
| M4 | Telegram & SMS | ◐ all built and merged (#17–#21); real SMS skipped for now | |
| M5 | Leads CRM | ◐ plan | |
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

## M5 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| A lead moves through all statuses; every move writes an activity; `lost` without a reason rejected by the DB | ☐ | |
| Phone matching a lead or student shows the duplicate warning with links | ☐ | |
| Scheduling a trial puts the guest on the sheet; teacher marking present sets `trial_done` | ☐ | |
| Convert: student, guardian (re-used by phone), enrollment, first cycle charge in one transaction; `won` | ☐ | |
| Teachers can't read leads except trial guests on their lessons (name only) | ☐ | |
| Overdue follow-ups appear on the admin dashboard widget | ☐ | |
| E2E: lead → contacted → trial → teacher marks present → convert → student in the group with a charge | ☐ | |

## M4 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| Shared contact links a parent to all children across centers; forwarded contact rejected | ☑ | pgTAP `m4_telegram` (guardian phone in two centers → both links, idempotent); worker integration test (someone else's contact rejected, own contact links) |
| Bot menu: schedule, attendance, payments (+ receipt PDF) per child, in the user's language | ☑ | Worker integration test (schedule and payments in Russian, receipt PDF from the menu and with `payment_received`); real phone 2026-10-13 (dev bot, local worker): deep link → contact → linked, menu in Uzbek, payment notice with receipt PDF |
| Absence alert in Telegram ~10 min after marking; blocked bot → SMS (Eskiz sandbox) + unlinked | ◐ | Worker integration test (alert delivered; 403 → unlinked, SMS fallback sent through a fake provider); real phone 2026-10-13: alert arrived 10 min after marking, in the linked chat's language (Uzbek); Eskiz sandbox pending (account) |
| Worker killed mid-send, restarted → every pending message sent exactly once | ☑ | Worker integration test (claimed and abandoned → stale recovery → one delivery); at-least-once after Telegram accepted (17, M4b note) |
| Two workers never double-send (SKIP LOCKED) | ☑ | `outbox-claim.concurrency.test.ts` (60 rows, two logins); worker integration test (two senders drain 30 rows, each delivered once) |
| Broadcast to "debtors of branch X" reaches exactly that set; preview count matches | ☑ | e2e `m4-notifications` (branch + only debtors → preview 1 recipient → queued 1, the guardian of the one debtor; a failed send keeps the audience); pgTAP `m4_telegram` |
| Reminders every `reminder_every_days`, none in quiet hours, none after paying | ☑ | pgTAP `m4_telegram` (first reminder once overdue, none 2 days later, next after 3, cadence follows the setting, quiet hours push `send_after`, paid → skipped as settled and no new reminder) |
| Heartbeat older than 2 min shows red on the health page | ☑ | Settings → Health checked in the browser (the worker's beat from the smoke run, 37 min old → "Not responding") |
| Sign-up OTP arrives by real SMS in staging | ☐ | |

## M3 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| `computeCycleCharge` tests; worked examples 1 and 2 = 540 000 and 468 000 UZS | ☑ | Vitest `billing.test.ts` (11 fixtures incl. % + fixed, own price, half up, rounding unit); SQL parity test on the same fixtures; pgTAP |
| `charge_cycles`: absences used; cancel/holiday/freeze push the end, never the amount; 8-lesson cycles | ☑ | pgTAP `m3_billing` |
| Enroll creates cycle 1 from the first billable lesson; `due_date = start + 10` | ☑ | pgTAP (incl. a backdated enrollment catching up) |
| `generate_cycle_charges` on the last lesson's day, idempotent, none while frozen | ☑ | pgTAP; mutation-checked |
| Price/discount change applies from the next cycle | ☑ | pgTAP (600 000 → 700 000 from the next cycle; issued charges unchanged) |
| Mid-cycle end follows `leave_credit_policy`; example 3 = 315 000 UZS credit; future cycles voided; transfer credits | ☑ | pgTAP (ask / credit / no_credit, preview, void of unstarted cycles, transfer); Vitest `unusedLessonsCredit`; mutation-checked |
| Receipt numbers unique and gap-free under 20 concurrent inserts | ☑ | `receipt-numbers.concurrency.test.ts` (postgres.js, 20 connections, 5 rolled back → 000001–000015) in CI's database job; fails with a naive max + 1 numbering |
| Receipt PDFs in uz/ru/en with the logo; 80 mm prints | ☑ | Vitest `receipt.test.ts` (uz/ru/en, PNG/JPEG logo, VOID); e2e `m3b-payments` and `m3-billing` fetch both PDFs; 80 mm checked by hand in the browser (M3b) |
| Balance and FIFO: `charge_debts` and debtors match fixtures | ☑ | pgTAP (FIFO with an opening-debt item, aging buckets, a not-yet-due debtor) |
| Voids need `void` + reason; balance updates; nothing deletable | ☑ | pgTAP (void payment, charge + reissue, adjustment; guard trigger on delete, update, truncate) |
| Opening balances import creates adjustments | ☑ | pgTAP `import_opening_balances`; Vitest (amount sign, matching, skip); e2e `m3-billing` (import → on the Debtors list → re-import adds nothing) |
| Teachers can't select any billing table or view | ☑ | pgTAP (8 tables/views + `student_balance()`); other branch, other center, admin without `billing` |
| No float money (lint rule) | ☑ | `uteach/no-float-money` (unit tested; flagged the 6 existing `Number(price)` calls, now `toDbAmount()`) |

## M2 "done when" status

| Item (30-milestones) | Status | Evidence |
|---|---|---|
| 375 px: 15 students in < 30 s ("all present" + 2 exceptions); a save is one request | ☑ | e2e `m2-attendance` (375 × 812: Today → sheet → All present → absent + late → Save: one POST, < 30 s, marks survive a reload) |
| Expected students = active on the date minus freezes (start/end/freeze edge tests) | ☑ | pgTAP `m2_attendance` (start day, end day, freeze day, day before/after, ended status ignored); matrix day states |
| Teacher edits until `ends_at + 48h`, denied after at the DB level; admin late edits audited | ☑ | pgTAP: 47 h ok, after 48 h `attendance_window_closed`, no direct insert/update grants, admin edits after the window write `audit_log` (changed columns); mutation-checked |
| First save sets the lesson `held` | ☑ | pgTAP (held + topic in the same call); e2e ("Held" after the first save) |
| Matrix: month with correct % (excused excluded); Excel export | ☑ | Vitest `attendanceRateBp` (excused excluded, half-up, null); e2e `m2-attendance` (matrix cells and %, admin edits a cell absent → excused, rate becomes "—", the downloaded .xlsx has the same letters, counts and rate) |
| Absent → one outbox row per notifiable guardian, +10 min, dedupe; re-save no duplicate; change cancels; 22:00 → quiet-hours end | ☑ | pgTAP: opted-out guardian skipped, no guardians → student, `send_after = +10 min`, key `absence:{lesson}:{student}:{guardian}`, re-save no duplicate, present cancels, absent again revives, sent never re-sent, quiet hours (22:00 → 08:00, wrap, DST) |
| Attendance unique (lesson, student) enforced | ☑ | pgTAP: duplicate insert → 23505; re-saves update the same row |

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

### 2026-10-13 · M5 plan
- The owner asked to start M5 while M4's real-SMS item is skipped (Eskiz account, approved texts and the hosted
  Phone provider are still to do; the 12 Eskiz texts are written up for the owner outside the repo).
- Plan: three PRs (M5a data layer, M5b pipeline screens, M5c trials & convert), in `30-milestones.md`.
- Decisions (`PROPOSED (M5 plan)`): status only through `move_lead` with a shared transition table (lost
  reopens, won final and only through Convert); follow-ups = task activities with a trigger for
  `next_follow_up_at`; duplicates across leads, students and guardians with merge; teachers reach trial guests
  only through the attendance sheet; guests never billed or counted in rates; one open trial per lead;
  `convert_lead` in one transaction re-using `upsert_guardian` and `enroll`, first payment as a separate step;
  lost reasons with a translated `system_key`; `KanbanBoard` pattern on `@dnd-kit/core`.

### 2026-10-13 · M4 real-phone check
- Dev bot `@uteachnrgBot` (token rotated after it was pasted in chat), worker running locally against local
  Supabase. A local student's phone set to the tester's; deep link `c_{slug}` → language → shared contact → linked.
- Arrived on the phone, in Uzbek: payment notice, absence alert (10 min after marking), receipt PDF.
- Fixed: in `pnpm --filter @uteach/worker dev` the receipt PDF crashed ("React is not defined") and the payment
  notice went out as text only. tsx applies `apps/worker/tsconfig.json` only to the worker's own files, so
  `packages/receipts` got the classic JSX transform; `receipt.tsx` now pins the automatic runtime with pragmas.
  The tsup build and Vitest were never affected.
- Note: this machine's clock ran ~3 min slow, which delays every scheduled send by the same amount.

### 2026-10-13 · M4c staff screens
- Settings → **Notifications** (reminder cadence, "due soon", SMS on/off and monthly cap with this month's
  count; every message with on/off, texts per language with a live preview, Eskiz ids, reset), **Telegram**
  (bot link + QR, who the bot reaches), **Health** (owners; worker heartbeat).
- **Broadcasts** page (history with delivered / waiting / not delivered, cancel) and the composer
  (`AudiencePicker` pattern on `/dev/ui`, preview count, translations, Telegram/SMS, now/later, confirmation).
- **Debtors**: "Send reminder" (once a day), "Last reminder" column, "Message this list". **Students**:
  Telegram filter and mark, "Message this list", profile chip. **Home**: "Connect Telegram" step.
- Migration `m4c_screens`: `student_overview.telegram_linked`, `notification_overview()`. `qrcode` in web.
- Tests: pgTAP `m4c_screens`; e2e `m4-notifications` (4 tests: setup, broadcast to debtors of one branch = preview,
  reminders + Telegram filter, template edit/preview/reset + Telegram page). Found and fixed on the way: a Radix
  checkbox inside the composer unticked itself when React reset the form after a failed send, so the retry lost
  the "only debtors" filter.
- Screenshots (1440/390): `broadcasts`, `broadcast-composer`, `settings-notifications`, `template-editor`,
  `settings-telegram` (bot not set up), `settings-health`, `debtors-m4`.
- Decisions: `PROPOSED (M4c, as built)` in 05-ui and 12.
- Known gaps: Uzbek dates in browsers without Uzbek locale data (Electron, headless Chromium) show "M10 14" in
  the template preview; Node (the worker) and desktop Chrome format them properly. The e2e spec was run
  against a database with dev data, not after `pnpm e2e`'s reset.

### 2026-10-13 · M4b worker & SMS
- `apps/worker`: grammY bot (language, contact linking, menu with child picker and center switcher, schedule,
  attendance, payments with receipt PDFs, scores placeholder, settings: language/unlink, blocked → unlinked), the
  outbox sender (`pickChannel`, `renderTemplate`, rate limiter, Telegram error handling, receipts as documents,
  SMS), heartbeat + stale recovery, graceful shutdown; config from env; postgres.js as `uteach_worker`.
- `EskizSmsProvider` (`packages/adapters`): token login, renewal on 401, permanent vs temporary errors.
- SMS hook: Eskiz when `SMS_PROVIDER=eskiz`; per-phone limit (5/hour) via `record_otp_send` with the secret key.
- Migration `m4b_worker`: `private.otp_sends` + `record_otp_send` (service role) + daily prune;
  `worker.receipt_data`, `worker.center_by_slug`; `bot_subjects` gains timezone and currency.
- Bot texts `bot.*` in uz/ru/en.
- Tests: worker unit tests (errors, rate limiter, texts in every language, dates, receipt view); worker integration
  test against a real database and a fake Bot API (link, menu, absence alert, blocked → SMS, crash recovery, two
  senders, receipts), in CI's database job; Eskiz tests with a fake API; pgTAP `m4b_worker`. The built bundle was
  smoke-run against a fake Bot API and local Supabase (polling + heartbeat).
- Decisions: `PROPOSED (M4b, as built)` in 01 and 17.
- Needed from the owner: the bots from @BotFather (token in `apps/worker/.env.local`), an Eskiz account with the
  OTP and three fallback templates approved, then `SMS_PROVIDER=eskiz` + `SUPABASE_SECRET_KEY` on the web host.

### 2026-10-13 · M4a data layer
- Migration `m4_telegram`: center reminder/SMS settings; `broadcasts`, `bot_sessions`, `system_heartbeats`,
  `notification_outbox.broadcast_id`; the `uteach_worker` role and `worker` schema (claim with SKIP LOCKED,
  mark sent/retry/failed/skipped, stale recovery, heartbeat, contact linking across centers, unlink, sessions,
  the bot's schedule/attendance/payments reads scoped to the user's links); `enqueue_payment_reminders` (hourly
  pg_cron, centers at local 10:xx) with overdue cadence and "due soon"; `charge_created` from
  `create_next_charge`; staff alerts by trigger; `create_broadcast` / `preview_broadcast` / `cancel_broadcast` /
  `broadcast_stats`; `send_payment_reminder`; `worker_health`; `last_payment_reminders`; template overrides
  for owners/`settings`; outbox reads widened to branch admins; new Telegram and SMS system templates.
- `packages/core/notifications` (`outboxBackoffSeconds`, `pickChannel`), `@uteach/i18n/notifications`
  (`renderTemplate`), new DB error codes with messages.
- Tests: pgTAP `m4_telegram` (117 checks, PGlite and real Supabase); M2 test updated for the widened outbox
  reads and template writes; parity test (backoff SQL = TS, every system template renders in uz/ru/en); the
  two-worker claim test (real Postgres, CI database job).
- Decisions: `PROPOSED (M4a, as built)` in 01 and 17.
- Known gaps: locally `supabase test db` fails `m1_academic` test 14 on a database with dev data (the daily
  lesson job also fills the dev groups); clean databases (PGlite, CI) pass.

### 2026-10-13 · M4 planned; hosted preview
- M4 plan: three PRs (M4a data layer → M4b worker & SMS → M4c staff screens); see `30-milestones.md`.
- Decisions recorded as `PROPOSED (M4 plan)` in 01, 02, 03, 05-ui, 10, 15, 17 and 30, including: the worker
  uses a `uteach_worker` role limited to a `worker` schema instead of the service role; bot token and Eskiz
  credentials are environment variables; a dev bot and `@uteach_bot`; no hosted worker until M7; bot texts in the
  i18n catalogs; SMS stays off until Eskiz approves the templates (SMS broadcasts too); reminders at 10:00 center
  time, re-checked against the balance before sending; `create_broadcast()` / `preview_broadcast()` share one
  query; outbox select widens to branch admins; per-phone OTP limit in the hook; Broadcasts in the nav; the
  notifications bell waits.
- Hosted preview (team only, Vercel Hobby): Supabase project `uteach` (Singapore) has all six migrations; the
  web app deploys to Vercel with root `apps/web`. Known gaps: login fails there because the Phone provider is off
  and the SMS hook isn't connected (both come with M4b); hosted sign-up through the dashboard fails because
  `on_auth_user_created` needs a phone.
- Needed from the owner before M4b: create the bots in @BotFather, open an Eskiz account and submit the three SMS
  templates.

### 2026-10-12 · M3c debtors & import
- **Debtors** page (nav after Payments, `billing`): aging tiles that filter, search, filters for bucket, branch,
  group and course, call + record payment per row, most overdue first. `lib/debtors.ts` loads it from the
  `debtors` view plus guardians, groups and the last payment; the **Excel export** route uses the same loader.
- **Opening balances** import kind: template, header guessing (balance / qoldiq / остаток…), validation (signed
  amount, not 0, student by ID / phone / unique name, must have an ID or phone, skip if already imported) and
  `import_opening_balances` (M3a). Shared student matching with the enrollments import.
- Student profile opens a tab from `?tab=` (Debtors links to Payments). `SegmentedControl` wraps on narrow
  screens (the import kinds overflowed at 390 px). `toSheetAmount()` in `lib/money.ts` writes amounts to Excel
  without floats. `fetchAll` / `chunks` moved to `lib/fetch-all.ts`.
- e2e `m3-billing` (5 tests): the M3 happy path from the milestone (12 backdated lessons → cycle 1 → cash payment
  → receipt → settled → mark 12 → 13th lesson → the job charges cycle 2, twice = once → Debtors 0–30 → Excel
  export), then an opening-balance import. `e2e/db.ts` (postgres.js, devDependency) runs the hourly job and
  pauses its cron during the test.
- Screenshots at 1440 and 390 px: `debtors`, `payments`, `student-payments`, `payment-dialog`,
  `import-opening-balances`, `settings-billing`.
- Decisions: `PROPOSED (M3c, as built)` in 15 (Debtors behaviour; reminders, broadcast and "last reminder" wait
  for M4).
- Known gaps: the Radix select no-JS path posting an empty value before hydration is still open (app-wide).

### 2026-10-12 · M3b payments & receipts
- Student profile: balance chip (debt / credit / settled) and a **Payments** tab: balance with "Record payment"
  and "Adjust balance", lesson cycles (lessons used, expected end, due date, calc line, FIFO status: paid / owed /
  overdue / void) with waive and void (+ reissue) row actions, payments with 80 mm / A4 print links and void,
  adjustments with void. `payments`-only staff see the balance and payments; charges and adjustments need
  `billing`.
- **Record payment** dialog (student page; Payments page with a student picker): amount prefilled with the debt,
  method → default account (or a chosen one), date (7 days back without `void`), payer (primary guardian), note,
  and the resulting balance before saving (`BalancePreview`); success shows the receipt number and print links.
- **Payments** page (nav, `billing` or `payments`): period, search by student or receipt, method and branch
  filters, period total. **Receipts** route `/[locale]/receipts/[id]?size=80mm|a4` renders the PDF on demand with
  `packages/receipts` (center logo when PNG/JPEG; "VOID · reason" on voided payments).
- End dialog: "N lessons not taken = X" from `unused_lessons_preview`; the credit choice only for policy `ask`.
- Center settings → **Billing** (rounding unit, due days, leave policy; owners edit). Branch **code** field
  (2–6 letters/digits, upper-cased; empty on create = suggested).
- New patterns `MoneyAmount` and `BalancePreview` (on /dev/ui); `lib/billing.ts` loaders; 7 Server Actions.
- Receipt fonts moved into `packages/receipts/fonts` (static `new URL(…, import.meta.url)`), because Next can't
  bundle a runtime `require.resolve`; checked in dev, `next build` (fonts in standalone) and `next start`.
- e2e `m3b-payments` (3 tests): priced group → enroll → cycle 1 → cash payment → both PDFs → settled → Payments
  page → void → debt back. ~30 new strings in uz/ru/en.
- Known gaps: the no-JS form path of Radix selects posts an empty value before hydration (seen on settings
  forms; app-wide, not new). Debtors (nav + page) wait for M3c.

### 2026-10-12 · Dev tool: one owner login for every local center
- `pnpm dev:access` (`scripts/dev-owner-access.mjs`): local only (refuses non-localhost), creates
  `+998990000099` / `uteach-owner` if missing and gives it an active owner membership in every center, so one
  login sees all demo data (switch centers in the top bar). Idempotent; re-run after `pnpm e2e` / `db:reset`.
  Uses the normal membership model (03: one membership per center), no bypass in the app.

### 2026-10-12 · M3a billing data layer
- Migration `20261016090000_m3_billing.sql`: center billing settings, `branches.code`, `accounts` (defaults by
  trigger), `charges`, `payments`, `balance_adjustments`, `receipt_sequences`; views `charge_cycles`,
  `student_balances`, `charge_debts`, `debtors`; the M1 billing hook filled in (charges on enroll and transfer,
  credits and voids on end and transfer); `generate_cycle_charges` (pg_cron, hourly); RPCs `record_payment`,
  `student_balance`, `void_payment`, `void_charge` (+ reissue), `add_adjustment`, `void_adjustment`,
  `unused_lessons_preview`, `end_enrollment(p_credit)`, `import_opening_balances`; `payment_received` queued.
- A guard trigger keeps financial rows permanent (no delete, truncate, or edit except voiding).
- pgTAP `m3_billing.test.sql` (110 checks; 434 in total); 3 mutations caught. `packages/core/billing`
  (`computeCycleCharge`, `unusedLessonsCredit`, `agingBucket`) with fixtures and a SQL parity test. Receipt-number
  concurrency test with postgres.js, run in CI's database job.
- Lint rule `uteach/no-float-money` and `toDbAmount()`. The End dialog sends a credit choice (checkbox) so ending
  a billed enrollment works before M3b. The M1 test passes `p_credit`; the M2 template count is scoped to M2
  keys. 14 SQL error codes with uz/ru/en messages.

### 2026-10-12 · M2 done, M3 planned
- M2 merged with green CI: M2a (#8), M2b (#9), M2c (#10); every M2 "done when" item is checked.
- M3 plan: three PRs (M3a data layer → M3b payments & receipts → M3c debtors & import); see `30-milestones.md`.
- Decisions recorded as `PROPOSED (M3 plan)` in 01, 02, 05-ui, 15, 17 and 30, including: cycle 1 waits for a
  billable lesson; receipts rendered on demand by `packages/receipts` (`@react-pdf/renderer`); `branches.code`
  for receipt numbers; default accounts per branch by trigger; reminders and `charge_created` move to M4;
  `end_enrollment(p_credit)` for the `ask` policy; the group Finance tab waits for M7; amounts never pass
  through `Number()` (lint rule `uteach/no-float-money`); postgres.js for the concurrency test.

### 2026-10-12 · M2c attendance matrix and export
- Group page → **Attendance** tab: the month as a students × lessons matrix (pattern `AttendanceMatrix`: sticky
  names, letter cells by meaning, cancelled columns muted, days outside the enrollment or frozen hatched with a new
  `bg-hatch` utility, rate per student), month navigation, legend; a per-student summary below `md`. Clicking a
  cell opens a P/L/A/E picker that saves one row through `save_attendance` (admins any time, teachers within the
  window; the database decides).
- **Export to Excel** (`/groups/[id]/attendance/export?month=`): same cells, counts and rate, labels in the
  user's language. `lib/attendance-matrix.ts` loads the month for both.
- Lessons tab: an Attendance column (marking state, links to the sheet). Student profile: **Attendance** tab
  (per group this month and last 30 days, recent marks).
- `ctx.can.attendance`; 35 new strings in uz/ru/en; `AttendanceMatrix` on /dev/ui.
- e2e `m2-attendance` gains the admin path through the matrix, a cell edit and the export (4 tests).
- Screenshots of the M2 screens at 1440 and 390 px in `docs/design/screenshots/uteach/` (`attendance-*`,
  `group-attendance-matrix-*`, `today-attendance-*`, …), taken from the e2e demo data.
- Docker Desktop had stopped during the session (local Supabase down → login failed); restarted it and
  `pnpm db:start`, data intact.

### 2026-10-12 · M2b attendance sheet, Today and notify prompts
- `/attendance/[lessonId]`: the sheet (mobile first): P/L/A/E in one row at 375 px, "All present" / "Mark the
  rest present", late minutes, note, topic, sticky save bar with a counter; one Server Action → one
  `save_attendance` call; draft kept in the browser; network failures retried 3 times; banners for too early,
  closed ("ask an admin"), view only, cancelled, and admin edits after the window.
- Today: cards open the sheet and show "To mark / 12/15 marked / 2 absent / Not marked". Owners and admins who
  teach get Today in the nav; every owner/admin gets **Attendance** (one day's lessons with their state, or
  "Not marked" over the last 7 days, branch filter).
- "Notify students and parents" in the Move, Cancel and Makeup dialogs (on) and Add holiday (off); a timetable
  drop to a new day or time opens a confirm with it ticked.
- Center settings → "Attendance & notifications" (edit window, alert delay, late alerts, quiet hours; owner).
- New pattern `AttendanceRow` (on /dev/ui); `StatusToggleGroup` row layout + screen-reader labels; `LessonList`
  chips moved under the title (names were squeezed out at 375 px). 81 new strings in uz/ru/en.
- e2e `m2-attendance.spec.ts` (3 tests: setup with a 15-student Excel import, teacher at 375 px, admin view);
  `m1-schedule` updated for the drop confirm and for Today opening the sheet. Checked in the browser at 375 px
  (en, ru) and desktop.

### 2026-10-12 · M2a attendance data layer
- Migration `20261015090000_m2_attendance.sql`: centers settings (`attendance_edit_hours`, `absence_alert_delay_min`,
  `late_alert_enabled`, quiet hours), `attendance`, `telegram_links` (empty), `notification_templates` (+ Telegram
  seed in uz/ru/en for `absence_alert`, `late_alert`, `lesson_cancelled`, `lesson_moved`, `lesson_added`),
  `notification_outbox`; helpers `expected_students`, `day_state`, `attendance_mode`, `apply_quiet_hours`,
  `enqueue_notification`, `cancel_pending_notifications`, `notify_lesson`; RPCs `save_attendance`,
  `attendance_lesson`, `attendance_sheet`, `attendance_matrix`, `lesson_attendance_stats`.
- M1 RPCs re-created with "notify students?": `cancel_lesson`, `move_lesson`, `create_makeup_lesson` (default on),
  `add_holiday` (opt-in); regeneration and holidays skip lessons with attendance.
- pgTAP `m2_attendance.test.sql` (140 checks; 324 in total, real Supabase and PGlite); three mutations of the
  window, revive and quiet-hours rules each make tests fail. `packages/core/attendance` (`countMarks`,
  `attendanceRateBp`) + tests. 5 new SQL error codes with uz/ru/en messages. DB types regenerated.
- Spec synced: `enrollment_id` is `not null` until M5; the late payload key is `minutes`.
- Locally the M1 schedule e2e passes against the new RPCs; the long M1 students test times out on the slow dev
  server here (≈2 s per page), so CI's production-build run is the check for it.

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
- `pnpm screenshots` doesn't seed attendance yet; the M2 screenshots came from the e2e demo data. Add an
  attendance step to its seed when the screenshots are next refreshed.
- Phone numbers show unformatted in staff lists (`+998931234567`); formatting with `packages/core` phone helpers can come with M1 lists.
- Dark mode tokens exist in `globals.css` but are unused (light mode only, per 05-ui).
- CI's e2e job uses only `test_otp` numbers, which skip the Send-SMS hook, so `host.docker.internal` on Linux runners doesn't matter.
- Verify the SAT / CEFR / Milliy sertifikat score ranges and grade mappings against official sources before M6.
- "Upcoming events page" (from brainstorm) has no milestone yet; decide in M15 planning.
