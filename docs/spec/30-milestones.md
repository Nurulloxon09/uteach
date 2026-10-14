# 30 · Build milestones

> PROPOSED: every "done when" item, every E2E path and the global "done when" list in this file. The canvas only gives each milestone's name, scope line and order.


**Build strictly in this order.** A milestone is done only when **every "done when" item is true**, all tests pass in CI, and `progress.md` is updated. Don't start M(n+1) until M(n) is done. Don't build features of later milestones early.

Each milestone lists: **Scope** · **Tables** (see 02) · **Done when** · **E2E** (the Playwright happy path that must pass).

Global "done when" for every milestone:
- [ ] Migrations apply cleanly on an empty DB and on a copy of the previous state.
- [ ] RLS tests cover every new table: allowed **and** denied (other center, wrong role, wrong branch).
- [ ] All new UI strings exist in uz, ru and en.
- [ ] Typecheck, lint, unit, DB and e2e tests are green in CI.
- [ ] `progress.md` is updated (what was done, decisions made, known gaps).

---

# 🟩 MVP: first paying center

## M0 · Foundation

> PROPOSED: scope additions beyond the canvas card: `audit_log`, RLS helper functions, `packages/core` money/phone/time helpers, Docker Compose skeleton, OTP as console output in dev.

**Scope:** pnpm monorepo (`apps/web`, `apps/worker` skeleton, `packages/*`), Next.js + Tailwind + shadcn, Supabase local, next-intl (uz/ru/en), auth (phone + password, OTP via Eskiz hook; console in dev), `create_center` + owner, branches, rooms, staff invites with roles, permission flags and branch scope, the RLS helper functions, `audit_log` table + trigger, money/phone/time helpers in `packages/core`, CI, Docker Compose skeleton.
**Tables:** profiles, centers, branches, rooms, memberships, audit_log.
**Done when:**
- [ ] `pnpm i && supabase start && pnpm dev` works from a fresh clone following the README.
- [ ] A new user can sign up with a phone (OTP shown in the dev console), set a password, log in, log out and reset the password.
- [ ] Creating a center creates the center, owner membership and first branch atomically (an RPC test proves it's rolled back on failure).
- [ ] The owner can CRUD branches (with timezone) and rooms, and archive them.
- [ ] The owner can invite an admin (branches + flags) and a teacher by phone. The invite link works once, expires after 7 days, and the accepting user gets exactly that role.
- [ ] A disabled member loses access on the next request.
- [ ] RLS tests: a user in center A cannot read or write **any** row of center B; an admin cannot see a branch outside `branch_ids`; a teacher cannot read memberships' permissions or center settings writes.
- [ ] A CI check fails if any table in `public` has RLS disabled.
- [ ] The UI switches between uz/ru/en; there are no hardcoded strings (lint rule).
- [ ] `packages/core`: `Money` type, `prorate()` (half-up), `roundToUnit()`, E.164 normaliser, branch-tz date helpers, all unit tested.
- [ ] CI runs typecheck, lint, unit and DB tests on PRs.
**E2E:** sign up → create center → add branch and room → invite a teacher → teacher accepts → teacher sees the empty "Today" page.

## M0.5 · UI foundation

> ✅ CONFIRMED by owner (2026-10-11): build the UI foundation before M1, matching the reference app (see `05-ui.md`).

> PROPOSED: the scope and every "done when" item below.

**Scope:** tokens and fonts from `05-ui.md` in `globals.css` (light mode); `AppShell` (sidebar with groups, mobile drawer, top bar) replacing the tab row; shadcn `dialog`, `sheet`, `tabs`, `skeleton`, `popover`, `command` added and restyled; `components/patterns` (PageHeader, Section, ListPage + TableSearch + FilterButton + Pagination + RowActions + InitialsAvatar, DetailPage + ProfileCard + tabs, FormDialog, Combobox, StatTiles, StatusChip, MobileList, Empty/Loading/Error states); `/dev/ui` showcase (dev only); every existing M0 screen (auth, onboarding, home, today, staff, settings, invite) moved onto the new shell and patterns.
**Tables:** none.
**Done when:**
- [ ] `globals.css` tokens equal the values in `05-ui.md` §2; no raw color classes or hex values anywhere in `apps/web/src` (lint rule or grep check in CI).
- [ ] Plus Jakarta Sans loads for Latin and the Cyrillic fallback (Manrope) loads for Russian; the `ru` pages look consistent.
- [ ] `/dev/ui` shows every pattern in `05-ui.md` §5 with fake data, in uz/ru/en, and returns 404 in production builds.
- [ ] Side-by-side screenshots at 1440 px and 390 px are saved in `docs/design/screenshots/`: reference `/teachers` vs uteach `ListPage`, reference "Add Teacher" dialog vs `FormDialog`, reference dashboard stat tiles vs `StatTiles`, reference sidebar vs `AppShell`. The owner approves them.
- [ ] All M0 screens use `AppShell` and the patterns; the Staff page is a `ListPage`; the invite form is a `FormDialog`.
- [ ] The sidebar shows only the items the current role and permission flags allow (teacher: Today only for now).
- [ ] Keyboard check: the dialog traps focus and closes on Esc; the mobile drawer opens and closes with the keyboard.
- [ ] Typecheck, lint, unit, i18n check and the existing M0 e2e tests still pass.
**E2E:** log in as owner → sidebar visible → open Staff (list page) → open invite dialog → invite a teacher → log in as teacher on a 390 px viewport → drawer menu → Today.

## M1 · Academic core

> PROPOSED: scope additions: levels, group prices, holidays, conflicts inbox, timetable, cancel/makeup/substitute, guardians, notes, freeze/transfer/end, onboarding wizard, billing-hook stub, opening balances deferred to M3.

**Scope:** courses, levels, groups, group prices, schedule rules, lesson generation (8 weeks, idempotent, holidays skipped), conflict detection + inbox, timetable (week/day by room/teacher, drag to move), cancel/makeup/substitute (notifications enqueue comes in M2), students, guardians (shared by phone), notes, enrollments with enroll/freeze/transfer/end (the billing hook is a no-op stub until M3), onboarding wizard, Excel import (students, groups, enrollments; opening balances are parsed and validated but saved in M3).

> PROPOSED (M1 plan, 2026-10-11): delivered as four PRs (M1a data layer, M1b courses/groups/schedule screens,
> M1c students & enrollments, M1d onboarding wizard & import). **Opening-balance import moves wholly to M3**
> (parse, validate and save together; validating without saving gives the owner nothing). The plan's student
> limit check on enroll comes with plans in **M7**. "Notify students?" prompts on cancel/move come in **M2** with
> the outbox. Also in M1: an "Edit member" dialog (branches, flags, timetable color), because teachers' branches
> must be editable before groups use them.
**Tables:** courses, levels, groups, group_prices, group_schedule_rules, lessons, holidays, schedule_conflicts, students, guardians, student_guardians, student_notes, enrollments, enrollment_freezes, import_jobs.
**Done when:**
- [ ] Creating a group with rules Mon/Wed/Fri 18:00 generates exactly the right lessons for 8 weeks in the branch timezone; running generation again creates 0 new rows.
- [ ] Holidays are skipped. Adding a holiday cancels the already-generated lesson on that date (no attendance).
- [ ] Two groups in the same room or with the same teacher at overlapping times: the DB rejects the second lesson, and the conflict shows in the inbox.
- [ ] Editing a rule regenerates only future, untouched lessons with no attendance.
- [ ] The timetable shows week/day by room and by teacher. Dragging a lesson moves it, and a conflicting drop is refused with a message.
- [ ] Cancel, makeup and substitute work. The substitute sees the lesson in their "Today".
- [ ] Adding a guardian with an existing phone links the same guardian (siblings). The profile shows "also guardian of".
- [ ] Enroll, freeze, transfer and end work with the documented date rules and write `audit_log`.
- [ ] Teachers see only their groups and rosters (names, no phones, no prices). This is proven by RLS tests.
- [ ] Import: a 300-row students file and a groups + enrollments file import with column mapping; re-importing the same files creates no duplicates; invalid rows are reported with row/column and nothing is written.
- [ ] Onboarding wizard steps 1–6 are resumable.
- [ ] `expandRules()` unit tests cover: rule validity windows, group start/end, holidays, and a DST-observing tz fixture.
**E2E:** onboarding wizard → create course + group with schedule → enroll a student with a guardian → see the lessons in the timetable.

## M2 · Attendance

> PROPOSED: scope additions: trial guests on the sheet, outbox table + templates seed, quiet hours at enqueue, the empty `telegram_links` table.

**Scope:** teacher mobile sheet (P/L/A/E, all present, late minutes, topic), trial guests on the sheet (data model only; leads UI in M5), 48 h edit window, admin edits audited, matrix on the group page, `notification_outbox` + `enqueue_notification()` + templates seed, absence alert enqueue (10 min delay, dedupe, cancel on change), quiet hours applied at enqueue.

> PROPOSED (M2 plan, 2026-10-11): delivered as three PRs.
> - **M2a · data layer:** migration `m2_attendance` (centers settings columns, `attendance`, `notification_templates`
>   + seed, `notification_outbox`, `telegram_links`, the RPCs below, "notify students?" parameters on the M1 lesson
>   RPCs), pgTAP `m2_attendance.test.sql`, DB types, error codes, `packages/core/attendance` + tests.
> - **M2b · sheet:** `/attendance/[lessonId]` sheet (mobile first), Today links to it (and shows for owners/admins
>   who teach), the admin **Attendance** page, "notify students?" in cancel/move/drag/makeup/holiday dialogs,
>   center settings "Attendance & notifications", new patterns on `/dev/ui`, e2e for the sheet.
> - **M2c · matrix:** group page Attendance tab (matrix, cell edit, Excel export), attendance counts on the Lessons
>   tab, attendance summary on the student page, the M2 e2e happy path, screenshots.
>
> Decisions in the plan (details in 02, 13, 14, 17, 05-ui):
> - **Trial guests move wholly to M5.** `lead_trials` needs `leads`, so a guest row can't exist before M5. In M2
>   `attendance.student_id` is `not null`; M5 adds `lead_trial_id`, drops that `not null` and adds the
>   `num_nonnulls` check and the second unique index (a small additive migration).
> - `notification_templates` is created in M2 (02 said M4) with system rows (Telegram, uz/ru/en) for the keys M2
>   enqueues. Editing templates (settings → Notifications) and SMS rows with Eskiz template ids come in M4.
> - `centers.quiet_hours_start/end` move from M4 to M2 (enqueue needs them); new `centers.late_alert_enabled`.
> - Attendance has **no direct write grants**: one security-definer RPC, `save_attendance`, applies the window
>   rules (same pattern as M1 lessons). The "denied at the DB level" item is proven by pgTAP calling the RPC as the
>   teacher after the window and by a denied direct insert/update.
> - `outbox.broadcast_id` comes with `broadcasts` in M4.
**Tables:** attendance, notification_templates, notification_outbox (+ telegram_links table created empty, used in M4).
**Done when:**
- [ ] A teacher on a 375 px screen can mark a 15-student lesson in under 30 s ("all present" + 2 exceptions); a save is one request.
- [ ] Expected students = enrollments active on the lesson date, minus freezes. Proven by tests for start/end/freeze edges.
- [ ] Teacher edits are allowed until `ends_at + 48h` and denied after **at the DB level** (RLS test). Admin edits after the window write `audit_log`.
- [ ] The first save sets the lesson to `held`.
- [ ] The matrix shows the month with correct % (excused excluded), and exports to Excel.
- [ ] Marking absent creates one outbox row per notifiable guardian with `send_after = +10 min` and a dedupe key; re-saving doesn't duplicate; changing to present before sending cancels it; an absence marked at 22:00 gets `send_after` at the quiet-hours end.
- [ ] Attendance unique (lesson, student) is enforced.
**E2E:** teacher logs in on mobile viewport → Today → opens a lesson → all present → marks one absent → saves → admin sees it in the matrix.

## M3 · Billing

> ✅ CONFIRMED by owner (2026-10-10): billing per lesson cycle (option B), prepaid, cycle length per group, freezes pause cycles, center-chosen policy for unused lessons.

> PROPOSED: scope additions: accounts, adjustments, voids, 80 mm + A4 receipts, `payment_received` enqueue, the opening-balance import; every "done when" item below.

**Scope:** `computeCycleCharge` (price, discounts, rounding), `charge_cycles` view (lessons used/left, computed cycle end), first cycle charge on enroll, `generate_cycle_charges` (pg_cron, idempotent), freeze/cancel/holiday extend cycles, end/transfer unused-lesson credits per `leave_credit_policy`, void-and-reissue, accounts (default cash + terminal per branch), record payment (cash/card/transfer), receipt numbering + PDF (80 mm + A4), balances view, FIFO `charge_debts`, debtors list with aging, adjustments (waive cycle, opening balance from import, write-off, correction, unused lessons), voids, receipts enqueued to the outbox (`payment_received`).
**Tables:** charges, payments, balance_adjustments, accounts, receipt_sequences; views charge_cycles, student_balances, charge_debts, debtors.

> PROPOSED (M3 plan, 2026-10-12): delivered as three PRs.
> - **M3a · data layer:** migration `m3_billing`:
>   - center billing columns and `branches.code`;
>   - `accounts` with defaults per branch;
>   - `charges`, `payments`, `balance_adjustments`, `receipt_sequences`;
>   - views `charge_cycles`, `student_balances`, `charge_debts`, `debtors`;
>   - the M1 billing hook filled in (first charge, freeze, end/transfer credits, voiding later cycles);
>   - `generate_cycle_charges` (pg_cron), `record_payment`, `void_payment`, `void_charge` (+ reissue), `add_adjustment`, `import_opening_balances`;
>   - `payment_received` queued to the outbox.
>
>   Also: `packages/core/billing` (`computeCycleCharge`, cycle windows, FIFO, aging) with shared fixtures and a SQL parity test, pgTAP `m3_billing`, the 20-concurrent receipt-number test, and the `uteach/no-float-money` lint rule.
> - **M3b · payments & receipts:**
>   - student profile "Payments" tab and balance card;
>   - "Record payment" dialog (student, Payments page, debtors) showing the resulting balance;
>   - void / waive / write-off / correction dialogs;
>   - the End dialog's unused-lessons credit choice (policy `ask`);
>   - receipt PDFs (80 mm + A4) in a new `packages/receipts`;
>   - Payments page;
>   - Center settings → Billing and the branch code field.
> - **M3c · debtors & import:**
>   - Debtors page (aging buckets, filters, Excel export);
>   - the opening-balance import kind;
>   - the M3 e2e happy path;
>   - screenshots.
>
> Decisions in the plan (details in 01, 02, 05-ui, 15, 17):
> - **No billable lesson, no charge yet.** A group without generated lessons can't place cycle 1. `enroll` creates cycle 1 when the student has a billable lesson. Otherwise `generate_cycle_charges` creates it once one exists (same idempotency key `(enrollment_id, cycle_no)`).
> - **Receipts are rendered on demand**, not stored. A route returns the PDF from the payment row (a voided payment shows "VOID"), so `payments.receipt_path` stays null in M3. The renderer lives in `packages/receipts` (`@react-pdf/renderer`, fonts bundled), so the M4 worker can send the same PDF in Telegram.
> - **Receipt numbers** use a new `branches.code` (2–6 letters/digits, unique per center, suggested from the name, editable by the owner): `{CODE}-{YYYY}-{000123}`.
> - **Accounts:** M3 creates a cash and a terminal account per branch (also for new branches, by trigger) and one center bank account. There is no accounts screen until M11.
> - **Reminders move wholly to M4:** M3 queues only `payment_received`. `charge_created`, payment reminders and "due soon" are queued in M4 together with the sender.
> - **Group page "Finance" tab** (12) waits for M7 dashboards; M3's group view stays the Price tab.
> - **Unused-lessons credit:** `end_enrollment` gets `p_credit boolean` (required when the policy is `ask`). Transfer always credits.
> - **e2e:** jobs that run from pg_cron (`generate_cycle_charges`) are called through a test-only SQL helper in `apps/web/e2e`. Lessons in the past come from backdated extra lessons.
> - **Money:** amounts cross the app ↔ database edge as decimal strings or `bigint`, never `Number()`. Existing `Number(price)` calls are changed, and the new lint rule keeps it that way.
**Done when:**
- [ ] `computeCycleCharge` unit tests: no discount, % discount, fixed discount, % + fixed, price override, rounding to 1 000 UZS. Worked examples 1 and 2 in 15 give 540 000 and 468 000 UZS.
- [ ] `charge_cycles` tests: absences count as used; a center-cancelled lesson, a holiday and a freeze each push the cycle end one lesson later and never change the amount; a group with `cycle_lessons = 8` gives 8-lesson cycles.
- [ ] Enrolling creates cycle 1's charge starting at the first billable lesson; `due_date = start + 10 days`.
- [ ] `generate_cycle_charges` creates the next charge on the day of the current cycle's last lesson, and running it twice yields the same rows (idempotent). No charge is created while frozen.
- [ ] A price or discount change applies only from the next cycle.
- [ ] Ending mid-cycle follows `leave_credit_policy` (`credit`, `no_credit`, `ask`); worked example 3 gives a 315 000 UZS credit. Future cycles are voided. Transfer always credits.
- [ ] Receipt numbers are unique and gap-free per branch per year under 20 concurrent payment inserts (test).
- [ ] Receipt PDFs render in uz/ru/en with the center logo, and print correctly at 80 mm.
- [ ] Balance and FIFO: given payments and charges fixtures, `charge_debts` outstanding and days overdue match the expected values; the debtors list matches the balance view.
- [ ] Voiding a payment or charge requires `void` and a reason; the balance updates; nothing can be deleted (RLS + trigger tests).
- [ ] Opening balances import creates adjustments.
- [ ] **Teachers can't select any billing table or view** (RLS tests for each).
- [ ] Money is never handled as float anywhere (a lint rule bans `parseFloat`/`Number()` on money types; code review).
**E2E:** enroll student → see cycle 1 charge (12 lessons) → record a cash payment → print receipt → balance 0 → mark 12 lessons → next cycle charge appears → student is in the debtors list after the due date.

## M4 · Telegram & SMS

> PROPOSED: scope additions: multi-child/multi-center switching, staff alerts, heartbeats + temporary health page, switching the Supabase SMS hook to Eskiz.

**Scope:** worker: grammY bot (long polling), language + contact linking, bot menu (schedule, attendance, payments + receipts, scores placeholder until M6), multi-child and multi-center switching; outbox sender (SKIP LOCKED, retries/backoff, stale lock recovery, Telegram rate limits); Eskiz SMS adapter + fallback for critical templates; Supabase SMS hook switched to Eskiz in staging/prod; broadcasts (branch/group/course/debtors); payment reminders job (overdue every N days + due-soon); staff alerts (substitute, conflicts); heartbeats.
**Tables:** telegram_links, bot_sessions, broadcasts, system_heartbeats (+ outbox in use).

> PROPOSED (M4 plan, 2026-10-13): delivered as three PRs.
> - **M4a · data layer:** migration `m4_telegram`:
>   - `bot_sessions`, `broadcasts`, `system_heartbeats`, `notification_outbox.broadcast_id`;
>   - center settings `reminder_every_days` (default 3), `due_soon_reminder_enabled` (default on),
>     `sms_enabled` (default off), `sms_monthly_cap`;
>   - a `worker` schema whose functions are the worker's only way into the database: `claim_outbox` (the SKIP
>     LOCKED claim from 17), `mark_sent`, `mark_retry`, `mark_failed` (+ SMS fallback row), `recover_stale`,
>     `beat`, `link_contact`, `unlink_chat`, and the bot's read functions (schedule, attendance, payments),
>     each scoped by the caller's `telegram_links` rows;
>   - `enqueue_payment_reminders` (pg_cron, daily) for overdue and "due soon"; `generate_cycle_charges` also
>     queues `charge_created`;
>   - staff alerts: `substitute_assigned` (to the substitute) and `schedule_conflict` (to admins);
>   - Telegram templates for the new keys and SMS rows for `absence_alert`, `payment_reminder`,
>     `lesson_cancelled` (Eskiz template id empty until approved).
>
>   Also: `packages/core/notifications` (`renderTemplate`, `pickChannel`, `backoff`) with an SQL parity test for
>   the backoff, and pgTAP `m4_telegram` (two sessions never claim the same row, stale recovery, reminder
>   cadence, cross-center contact matching, RLS of the new tables).
> - **M4b · worker & SMS:**
>   - `apps/worker`: grammY bot (linking, menu, child picker, center switcher, settings, blocked → unlinked),
>     outbox sender (rate limits, retries, SMS fallback), heartbeat, graceful shutdown;
>   - `EskizSmsProvider` in `packages/adapters` (token refresh, approved texts only), used by the worker and,
>     with `SMS_PROVIDER=eskiz`, by the auth SMS hook, which also gets the per-phone OTP limit (5/hour);
>   - the worker integration test with a fake Bot API and a fake Eskiz server.
> - **M4c · staff screens:**
>   - Settings → Notifications (templates per key and locale, on/off, quiet hours, reminders, SMS cap and
>     this month's count) and Settings → Telegram (deep link, QR code, linked count);
>   - Broadcasts page (compose, preview count, history);
>   - Debtors: send reminder, broadcast to selection, last reminder column; Students: "Telegram not linked"
>     filter, bulk broadcast, Telegram status on the profile; onboarding "Connect Telegram" item;
>   - the temporary health page; the M4 e2e; screenshots; the real-phone checklist.
>
> Decisions in the plan (details in 01, 02, 05-ui, 10, 15, 17):
> - **The worker never holds the service-role key.** It connects with postgres.js as a `uteach_worker` role
>   that can only execute `worker.*` functions. The migration creates the role without login; each environment
>   gives it a password (local: in `seed.sql`; hosted: set by the owner).
> - **Bot token and Eskiz credentials are environment variables** of the server processes (worker; web for
>   the hook). Vault keeps per-center secrets (payment providers, M8).
> - **Two bots:** a dev bot for local and staging, `@uteach_bot` for production.
> - **No hosted worker until M7.** Vercel can't run long polling. In M4 the worker runs on a laptop (`pnpm
>   --filter @uteach/worker dev`) against local or hosted Supabase; the VPS comes with launch.
> - **Bot texts live in the i18n catalogs** (`bot.*`), so `check:i18n` covers them. Outbox texts stay in
>   `notification_templates`.
> - **SMS stays off until Eskiz approves the templates.** SMS rows are seeded with an empty Eskiz id, and
>   `pickChannel` never chooses SMS for a row without one. Tests use a fake Eskiz server.
> - **"Send reminder" from Debtors** uses the `payment_reminder` template with the dedupe key
>   `reminder:{student}:{date}:manual`, so it never blocks or repeats the daily job's reminder.
> - **Health page:** owners see it at Settings → Health until super-admin exists. It reads
>   `public.worker_health()` (security definer, returns only service name and last beat).
> - **The notifications bell waits.** Staff alerts go through the bot in M4.
**Done when:**
- [ ] A parent sharing their contact gets linked to all their children across centers; a forwarded contact is rejected.
- [ ] Bot menu answers schedule, attendance, payments (with receipt PDF) for each linked child, in the user's language.
- [ ] The absence alert from M2 arrives in Telegram ~10 min after marking; if the parent blocked the bot, an SMS is sent instead (Eskiz sandbox) and the link is marked unlinked.
- [ ] Killing the worker mid-send and restarting sends every pending message exactly once (dedupe + stale lock test).
- [ ] Two worker instances running together never double-send (test with SKIP LOCKED).
- [ ] A broadcast to "debtors of branch X" reaches exactly that set; the preview count matches.
- [ ] Payment reminders: an overdue student gets one reminder every `reminder_every_days`, none in quiet hours, and none after paying.
- [ ] A heartbeat older than 2 min shows red in the (temporary) health page.
- [ ] OTP for sign-up arrives by real SMS in staging.
**E2E:** (worker integration test with a mocked Telegram API) link → mark absent → message delivered; plus a manual checklist on a real phone.

## M5 · Leads CRM

> PROPOSED: scope additions: list view, duplicate check, lost reasons, optional first payment on convert.

**Scope:** pipeline board + list, lead detail and timeline, notes/calls/tasks, follow-ups ("my follow-ups today"), duplicate check against leads and students, trials on real lessons (guest on the sheet), lost reasons (required), convert to student (student + guardian + enrollment + prorated charge + optional first payment).
**Tables:** leads, lead_activities, lead_trials, lost_reasons.

> PROPOSED (M5 plan, 2026-10-13): started by the owner while M4's real-SMS item is still open (skipped until
> Eskiz and the hosted Phone provider are set up; see progress.md). Delivered as three PRs.
> - **M5a · data layer:** migration `m5_leads`:
>   - enums `lead_status`, `lead_source`, `lead_activity_kind`, `trial_status`;
>   - tables `leads`, `lead_activities`, `lead_trials`, `lost_reasons` with RLS (PERM(leads) + ADM(branch);
>     `lost_reasons` select MBR, write PERM(settings)); six reasons seeded per center by `create_center` and
>     backfilled for existing centers;
>   - `attendance.lead_trial_id` (the M2 note: drop the two `not null`s, add `num_nonnulls` and
>     `unique (lesson_id, lead_trial_id)`);
>   - RPCs: `create_lead`, `move_lead` (the only way to change status; writes the `status_change` activity),
>     `add_lead_activity` (note / call with outcome / task), `complete_lead_task`, `lead_duplicates(phone)`,
>     `merge_leads`, `schedule_trial`, `cancel_trial`, `save_trial_feedback`, `convert_lead`;
>     `my_follow_ups()` for the home widget;
>   - `attendance_sheet` returns trial guests; `save_attendance` accepts guest rows and moves the trial and
>     the lead; cancelling a lesson cancels its trials.
>
>   Also: `packages/core/leads` (`canMove(from, to)`, the transition table shared by the board and the SQL
>   parity test) and pgTAP `m5_leads` (every transition, lost without a reason rejected, won only through
>   convert, duplicates across leads/students/guardians, trial → sheet → `trial_done`, convert re-uses a
>   guardian and rolls back as one transaction, teachers see guest names only, other center sees nothing).
> - **M5b · pipeline screens:** Leads page (board with drag + list view with phone search, filters), "New lead"
>   dialog with the duplicate warning, lead detail (profile, timeline, add note / call / task, edit, merge),
>   lost dialog, Settings → Lost reasons, the nav item, the "My follow-ups" widget on Home.
> - **M5c · trials & convert:** trial picker (upcoming lessons filtered by course/level), guest rows with a
>   "Trial" badge on the attendance sheet and teacher feedback, the Convert dialog (student, guardian,
>   group, start date, discount, then an optional first payment), the M5 e2e, screenshots.
>
> Decisions in the plan (details in 02, 03, 05-ui, 11, 14):
> - **Status changes only through `move_lead`.** `status`, `lost_reason_id`, `converted_student_id` and
>   `next_follow_up_at` get no update grant. `move_lead` checks the transition table: any open status can move
>   to any other open status or to `lost`; `won` only through `convert_lead`; `lost` can reopen to `new` or
>   `contacted`; `won` is final.
> - **`trial_scheduled` needs a trial.** Dragging onto that column opens the trial picker, and
>   `schedule_trial` moves the lead. Dragging onto Won opens Convert, onto Lost opens the reason dialog.
> - **Follow-ups are task activities.** A trigger keeps `leads.next_follow_up_at` = the earliest open task.
>   "My follow-ups" on Home lists my open tasks due today or overdue (center timezone), overdue in red.
> - **Duplicates:** `lead_duplicates(phone)` matches the center's leads, students and guardians (a guardian
>   match lists their students). It warns, never blocks. Merge moves activities and trials into the kept
>   lead, fills its empty fields, archives the other with a `system` activity.
> - **Trial guests:** teachers never get a grant on `leads` or `lead_trials`; they see the guest's name only
>   through `attendance_sheet` and write the result through `save_attendance` / `save_trial_feedback`.
>   Present or late → trial `attended` + lead `trial_done`; absent → `no_show`, lead stays. Guests are never
>   billed and don't count in attendance %, matrix, stats or absence alerts. A lead can have one open trial.
> - **Convert:** `convert_lead` creates or re-uses the student, upserts the guardian by phone
>   (`upsert_guardian`), calls `enroll` (which creates the first cycle charge), sets `won` and writes the
>   activity, all in one transaction. The form asks whether the lead's phone is the student's or a parent's.
>   The optional first payment is a second step: the existing payment dialog opens prefilled after convert,
>   so `record_payment` stays the only way to take money.
> - **Lost reasons** are rows with a `system_key` (price, schedule, location, competitor, no_response, other)
>   shown through i18n; renamed or new reasons keep their typed label.
**Done when:**
- [ ] A lead moves through all statuses; every move writes an activity; `lost` without a reason is rejected by the DB.
- [ ] Creating a lead with a phone that matches an existing lead or student shows the duplicate warning with links.
- [ ] Scheduling a trial puts the guest on the lesson sheet; the teacher marking them present sets `trial_done`.
- [ ] Convert creates student, guardian (re-using an existing one by phone), enrollment and the first cycle charge in one transaction and sets `won`.
- [ ] Teachers can't read leads except trial guests on their lessons (name only).
- [ ] Overdue follow-ups appear on the admin dashboard widget.
**E2E:** create lead → contacted → schedule trial → teacher marks present → convert → student appears in the group with a charge.

## M6 · Exam scores

> PROPOSED: including CEFR and Milliy sertifikat presets in M6 (the M6 card says "IELTS/SAT presets"; the Exam types card lists all four), official results, `score_posted`, bot Scores menu.

**Scope:** exam type presets (IELTS, SAT, CEFR, Milliy sertifikat) + custom, group score entry grid, IELTS band rounding, official results with certificate, targets with exam date, student progress chart, group scores table, score uplift, `score_posted` notification, bot "Scores" menu.
**Tables:** exam_types, exam_results, student_targets.

> PROPOSED (M6 plan, 2026-10-13): started by the owner while M4's real-SMS item is still open. Delivered as
> three PRs.
> - **M6a · data layer:** migration `m6_exams`:
>   - tables `exam_types` (four global presets seeded: `ielts`, `sat`, `cefr`, `milliy`), `exam_results`,
>     `student_targets` with RLS; `courses.exam_type_id`; the `attachments` storage bucket (01) for
>     certificates under `{center_id}/certificates/…`;
>   - trigger `exam_results_check` validates `section_scores` against the type (known keys, range, step) and
>     computes `total_score` by the total rule; parity with `packages/core/exams` on shared fixtures
>     (`exams.fixtures.json`, like billing);
>   - RPCs: `save_group_scores(group, exam_type, kind, taken_on, rows)` (upsert per student, an all-empty row
>     deletes that student's result, enqueues `score_posted`), `save_official_result`, `delete_exam_result`,
>     `set_student_target`, `group_scores(group, exam_type)` (latest, target, gap, mocks, trend, uplift),
>     `student_scores(student)` (history + targets for the chart), `score_entries(filters)` (the Exams list);
>     `convert_lead` also writes a target when the course has an exam type and the lead has a target score;
>   - `score_posted` Telegram templates (uz/ru/en), on by default;
>   - `packages/core/exams` (`ieltsBand`, `examTotal`, `validateScores`, `cefrLevel`, `milliyGrade`) and
>     pgTAP `m6_exams`.
> - **M6b · score screens:** "Enter scores" grid on the group page (keyboard only, inline errors, live total),
>   group Scores tab (gap table), student profile Scores panel with the chart, official result dialog with
>   certificate upload, target dialog, the Exams page (owners/admins) and Scores (teachers), Settings → Exam
>   types (custom types), the exam type on the course form and on Convert. New pattern `ScoreChart` on `/dev/ui`.
> - **M6c · parents & e2e:** the worker renders `score_posted`; the bot's Scores item (latest result per exam
>   type with sections, target, gap, exam date, last five results with arrows); the M6 e2e; screenshots.
>
> Decisions in the plan (details in 02, 03, 05-ui, 16, 17):
> - **Preset rules** are the verified ones in 16 (CEFR total = average, Milliy sertifikat 0–75).
> - **One rounding rule, two places.** `ielts_band`: mean of the four bands, `.25` → up to `.5`, `.75` → up to
>   the next whole, else nearest half. `sum` and `average` keep one decimal (`average` rounds half up). The SQL
>   trigger and `packages/core` read the same fixtures in their tests.
> - **Partial entry is allowed:** a mock can have only some sections. `total_score` is null until every
>   section has a value. Values off the range or step (IELTS 7.3, 10) are rejected inline and by the trigger
>   (`exam_score_invalid`).
> - **Re-entry edits, never duplicates:** unique (student, exam type, group, taken_on, kind) with
>   `nulls not distinct` (official results have no group).
> - **Who writes:** owners; admins with `academics` in their branches; teachers for their own groups
>   (mock/diagnostic) and targets of students in their groups. Official results: owners/admins and the
>   student's teachers. Teachers read results of students in their groups only. Presets: no write grant for
>   anyone (the "presets read-only" check).
> - **Custom types:** sections and total rule are fixed once a result exists (name and archive stay
>   editable), so old totals never change meaning.
> - **`score_posted`** goes to the student's and guardians' Telegram (no SMS template). It is enqueued
>   10 minutes after a save and a re-save inside that window updates the waiting row, so fixing a typo
>   doesn't send twice. It lists the sections, total and the gap to the target.
> - **Baseline and uplift:** baseline = `student_targets.baseline_total`, else the first diagnostic, else the
>   first result of that type. Uplift = latest total − baseline. Trend = last vs previous total.
> - **Chart:** `ScoreChart` is plain SVG with chart tokens (no chart library). Points = totals by date (mock,
>   diagnostic and official, official with a badge), a dashed target line, an exam-date marker, and section
>   lines behind a toggle.
> - **Bot:** text only in M6. The chart image moves to M9 (Mini App); it needs an SVG-to-PNG renderer the worker
>   doesn't have.

> PROPOSED (M6a, as built, 2026-10-13):
> - No `student_scores` RPC: the profile reads `exam_results` and `student_targets` directly (RLS lets branch
>   staff and the student's teachers read them). `score_entries` runs as the caller for the same reason.
> - `group_scores` counts only results with a total (a partial mock isn't a point on the chart); the baseline is
>   the target's, else the first diagnostic, else the first result.
> - Errors reuse `student_not_expected` (student not in the group) and `invalid_dates` (a future day); new codes
>   `invalid_exam_type`, `exam_type_in_use`, `exam_score_invalid`, `invalid_exam_result`, `invalid_target`.
> - Custom type codes are generated (`c_…`), never typed; display totals drop `.0` except for IELTS (7.0).
> - `score_posted` payloads carry `sections` as `{uz, ru, en}` text; the renderer picks the recipient's language
>   (like broadcasts' `bodies`). A correction after the message was sent doesn't send again.
> - Certificates: `attachments` bucket (private, 10 MB, PDF/JPEG/PNG/WebP); members of the center read and upload
>   under `{center_id}/certificates/`.

> PROPOSED (M6b, as built, 2026-10-13):
> - "Enter scores" is its own page (`/groups/{id}/scores?exam=&kind=&date=`), not a dialog: 15+ rows × 4 sections
>   need the room. It opens with what's saved for that choice ("you're editing them"); one Save sends the grid.
> - Group page: a Scores tab (exam switcher, gap table: latest with day and kind, the result before it with an
>   arrow, target, gap or "Reached", exam day, number of results, a target button). Uplift is on the student
>   page only; it shows "—" until there are two results.
> - Student profile: a Scores tab (exam switcher over the types the student has, tiles latest / target and gap /
>   exam day with days left / uplift, `ScoreChart`, the results list with certificate links and delete).
>   Student profiles stay admin-only (M1), so teachers set targets from the group's table; that dialog leaves
>   the saved baseline as it is.
> - Exams (owners/admins) and Scores (teachers) are one page `/exams`: recent entries with an exam filter.
> - Settings → Exam types: presets listed read-only; a custom type's section names are typed once and used in
>   every language. Courses get an exam type field ("No exam" by default).
> - Convert needs no new field: the M6a trigger turns the lead's target score into the student's target.
> - Certificates upload from the browser straight to storage (like logos and imports), then the path is saved.
> - `ScoreChart` redraws at its container's width so its 12 px text stays readable on a phone.

> PROPOSED (M6c, as built, 2026-10-13):
> - The worker sends `score_posted` through the existing outbox path; nothing score-specific in the sender.
> - New `worker.bot_scores(telegram_user, student)` returns raw numbers per exam type (sections, latest result,
>   target, last five totals); the bot formats them with `packages/core/exams` (`formatScore`, `examGradeLabel`,
>   `scoreUplift`), so the web and the bot show the same numbers. Exam types are listed newest result first; a
>   type with only a target still shows.
> - Bot Scores text: the latest result's kind and day, its sections (left out when the only section is the total,
>   e.g. Milliy sertifikat), the total with the CEFR level or Milliy grade ("No certificate" below 46), target with
>   "x to go" or "reached", exam day with days left, and the last five totals with ↑/↓ against the one before.
> - Uplift on the student page shows "—" until there are two results, unless a baseline was saved (fixes M6b,
>   which showed 0.0 for a single result).
> - The M6 E2E seeds the 15 students and the target straight into the database (M2's E2E already covers the Excel
>   import), so it only tests score entry.
**Done when:**
- [x] IELTS rounding unit tests pass for all .x25 / .x75 boundary cases, and the DB trigger agrees with `packages/core` on the same fixtures. (M6a: `exams.fixtures.json`, 61 IELTS cases incl. every .x25/.x75 mean 0.25–8.75; `exams.test.ts` + `exams.parity.test.ts`.)
- [x] A teacher can enter a 15-student IELTS mock with keyboard only; invalid values (7.3, 10) are rejected inline and by the DB. (M6c: e2e `m6-exams`, logged in as the group's teacher: 60 cells typed with Tab only, every row total checked, 7.3 and 10 red inline, Save refuses while a cell is red, then "15 results saved"; DB rejection in pgTAP `m6_exams`, `exam_score_invalid`.)
- [x] The student chart shows scores over time, the target line and the exam date; the group table shows gap to target. (M6b: checked in the browser, local data: 15-student mock + a diagnostic + an official result, target 7.5 with an exam day; group Scores tab shows target, gap and exam day.)
- [x] Parents get a score notification and see scores in the bot. (M6c: worker integration test against a real database and a fake Telegram API: a saved mock's `score_posted` reaches the parent in Russian with sections, total and target; the Scores item shows total, "Цель: 7.0 · осталось 0.5" and days to the exam; someone not linked is refused. Text cases in `scores.test.ts`.)
- [x] Preset exam types can't be edited by centers (RLS). (M6a: pgTAP `m6_exams`: an owner's update leaves the preset unchanged, a preset insert is 42501.)
- [x] SAT, CEFR and Milliy sertifikat ranges and mappings have been checked against official sources and recorded in 16. (M6 plan: sources in 16 § Exam types.)
**E2E:** teacher enters a mock for a group → student profile chart shows the new point vs target.

## M7 · Launch 🚀

> PROPOSED: scope additions: 7-day grace, manual uteach invoices, audit log viewer, error monitoring, uptime alerts, restore test, legal pages, landing page, dry run with a friendly center.


> PROPOSED (M7 plan, 2026-10-13): started by the owner after M6. Delivered as five PRs; M7d waits for the owner's
> accounts (see "Needs the owner").
> - **M7a · subscriptions & limits:** migration `m7_plans`:
>   - tables `plans` (global, read by everyone signed in, written by the service role) and `platform_invoices`
>     (owners read their own; service role writes); `centers.plan_id`, `past_due_since`, `paid_until`;
>     enum `invoice_status` (`draft`, `issued`, `paid`, `void`); invoice numbers `UT-YYYY-NNNNNN` from a sequence;
>   - seeded plans `starter` (50 students, 1 branch), `growth` (200, 3), `pro` (unlimited). Prices are
>     placeholders (300 000 / 700 000 / 1 500 000 UZS a month) until the owner sets them in `/admin`;
>   - **status machine** in `private.center_status_next()` + hourly pg_cron `expire_centers` (01): `trial` past
>     `trial_ends_at` → `past_due` (`past_due_since` = the trial end); `active` past `paid_until` → `past_due`;
>     `past_due` for 7 days → `read_only`. Marking an invoice paid sets `paid_until` = max(`paid_until`, period end),
>     the invoice's plan, and `active`. Every change writes `audit_log` (`actor_kind = 'system'` or `super_admin`);
>   - **read-only** = the guard trigger `private.guard_center_writes` on every table with `center_id` (02):
>     `center_read_only` for `read_only` / `cancelled` centers, except platform writers (service role, pg_cron,
>     the worker). Reads and exports keep working. Background jobs keep running (lessons, charges, reminders),
>     so nothing is missing when the center pays;
>   - **student limit:** active students = students with an `active` enrollment. `enroll`, `convert_lead` and
>     `import_enrollments` refuse a student who would be one over the limit (`student_limit_reached`); a student
>     who is already active can join more groups. Trial = 50 (✅ confirmed), plan = its `student_limit`.
>     `branch_limit` blocks new branches (`branch_limit_reached`). Nothing existing is ever removed;
>   - owner screens: **Settings → Subscription** (plan, status, trial end or paid until, students used / limit
>     bar, invoices list, how to pay: bank details text from platform settings); an **app banner** for the last
>     3 trial days, `past_due` (days of grace left) and `read_only` (writes are blocked; link to Subscription).
>     A write in read-only shows the `center_read_only` message; buttons are not hidden one by one;
>   - pgTAP `m7_plans` (machine, the 7-day edge, guard on every tenant table, limits, paid → active, RLS);
>     `packages/core/subscription` (`centerStatusNext`, `trialDaysLeft`) with a parity test.
> - **M7b · super-admin & audit log:** `/admin` (own layout, not under a center), allowed only when
>   `profiles.is_super_admin`; server code uses the service role there only (01, 03). The first super-admin is set
>   by SQL in the dashboard (documented). Pages: **Centers** (status, plan, active students, last activity, trial
>   end; actions extend trial by N days, change plan, set status), **Plans** (CRUD; a plan in use can't be deleted,
>   only hidden), **Invoices** (issue, mark paid with a note, void), **Support view** (a read-only summary of one
>   center: branches, staff, groups, student counts, last payments, failed messages, imports; each open writes
>   `audit_log(action = 'support_view')`; no "log in as"), **Health** (worker heartbeats, outbox backlog and 24 h
>   failure rate, pg_cron last runs from `cron.job_run_details`, SMS failures). Every super-admin action is
>   audited. Owners get **Settings → Audit log**: filters (table, person, dates), before/after per change.
> - **M7c · role dashboards** (20): one RPC per role, run as the caller, all numbers in the center/branch
>   timezone:
>   - owner (all branches, a branch filter): today (lessons, attendance % of marks so far, payments today),
>     month to date (charged = charges dated this month; collected = payments this month not voided; collection
>     rate = collected ÷ charged; debt total with aging 0–30 / 31–60 / 60+ days by due date), active students
>     with Δ vs the last day of the previous month, new leads and won leads this month, a card per branch;
>   - admin (their branches): today's lessons marked ✓ / not yet, top 10 debtors, follow-ups due today, trials
>     today, students without a linked Telegram, schedule conflicts;
>   - teacher (on Today): today's lessons with "Mark attendance", unmarked lessons still in the edit window,
>     their groups, groups with no score in 30 days ("scores to enter"); no money.
>   Home becomes the owner/admin dashboard; pgTAP checks every number against a fixture center.
> - **M7d · production** (after the owner's accounts exist): compose on the VPS (`web`, `worker`, `caddy`;
>   `restart: unless-stopped`), a deploy workflow on `main` (build → GHCR → SSH `docker compose pull && up -d`,
>   then `supabase db push`), `/api/health`, Sentry in web and worker, UptimeRobot → Telegram, a weekly off-site
>   `pg_dump` from the VPS and a written restore test (restore into a scratch database, count rows). The Vercel
>   project stays a team preview.
> - **M7e · public pages & the full loop:** a landing page at `/` for visitors (what uteach does, plans from
>   `plans.is_public`, sign-up, a Telegram contact) in uz/ru/en; `/terms` and `/privacy` drafted in three
>   languages and marked "draft" until a lawyer reads them; the full-loop E2E (lead → trial → convert →
>   attendance → charge → payment → `payment_received` with the receipt queued for the parent; the worker test
>   already proves the Telegram delivery); a dry-run checklist for the friendly center.
>
> Order: M7a → M7b → M7c → M7e; M7d whenever the accounts are ready.
>
> Needs the owner (nothing here is bought or opened without a yes):
> - a VPS (about €5 a month) and a domain; Supabase **Pro** ($25 a month) before the first paying center;
> - accounts for Sentry, UptimeRobot and backup storage (free tiers), and a Telegram chat for alerts;
> - the real plan prices, the bank details for invoices, a lawyer's read of the legal pages;
> - **open question:** Uzbekistan's personal-data law asks for citizens' data to be stored on servers in
>   Uzbekistan. Supabase has no region there. The owner should ask a lawyer whether that applies and, if it does,
>   choose between a local host for Postgres or another arrangement before real centers go live;
> - a friendly center for the dry run.

**Scope:** plans + 14-day trial + past_due (7-day grace) → read_only, student limit enforcement; uteach invoices (manual); super-admin (centers, plans, invoices, support view audited, system health); role dashboards (owner, admin, teacher); audit log viewer (owner); production infra (VPS, Docker Compose, Caddy TLS, Supabase Pro, backups, error monitoring, uptime check), legal pages (terms, privacy), landing page.
**Tables:** plans, platform_invoices.
**Done when:**
> PROPOSED (M7a, as built, 2026-10-14):
> - Read-only = the guard trigger `a_center_writable` (named to run before other triggers) on every table with
>   `center_id` and on `centers` (a new center's insert passes). "End user" = the request's JWT role is
>   `authenticated` / `anon`; pg_cron, the worker and the service role carry none or `service_role`, so they pass.
>   Direct table updates in read-only change nothing (RLS hides the rows); RPCs and inserts raise
>   `center_read_only`.
> - Trial limits live in a hidden `trial` plan row (50 students, no branch limit), so super-admin can change them
>   like any plan. `plans` also has `sort_order` and `archived_at`.
> - New table `platform_settings` (key → jsonb; `payment_instructions` = `{uz, ru, en}` text on the Subscription
>   page). Read by signed-in people, written by the service role.
> - Invoices are created `issued` (no drafts yet); `issue_platform_invoice`, `mark_platform_invoice_paid`,
>   `void_platform_invoice` are callable by the service role only (the /admin screens in M7b).
> - The student limit is a trigger on `enrollments` inserts (so `enroll`, `convert_lead`, imports and transfers
>   all get it), with a per-center lock so two people can't take the last place. The branch limit is a trigger
>   on `branches` inserts.
> - Banner days are calendar days in the center's timezone ("ends today", "in 2 days"), matching the dates shown.
- [x] A trial center flips to `past_due` at trial end and to `read_only` 7 days later (job test); in read_only every write is rejected by RLS and every read still works; marking an invoice paid restores `active`. (M7a: pgTAP `m7_plans`: the machine's edges, `expire_centers`, read-only inserts/RPCs/updates rejected and reads working, platform writes passing, the guard on every tenant table, paid → active with `paid_until`; SQL and `centerStatusNext` agree on `subscription.fixtures.json`; banners and a refused write checked in the browser.)
- [x] Enrolling beyond the plan's student limit is blocked with an upgrade message. (M7a: pgTAP `m7_plans`: the student over the limit is refused with `student_limit_reached`, an active student can join another group; the message points to Settings → Subscription in uz/ru/en. Not yet clicked through in the browser: the full-loop E2E in M7e covers it.)
> PROPOSED (M7b, as built, 2026-10-14):
> - /admin calls only `admin_*` functions with the service role (plans and platform settings, readable by everyone
>   signed in, are read with the person's session). Each function takes `p_actor`, refuses anyone who isn't a
>   super-admin (`forbidden`), and sets the transaction-local `uteach.super_admin`; `private.audit_row` then writes
>   `actor_kind = 'super_admin'` and that person. Signed-in users can't call them at all.
> - Extend trial: 1–90 days, added to the trial end (or to now, if it has ended); only for centers that never paid
>   (`paid_until` empty); the center goes back to `trial`. Set status refuses `trial` with an ended trial and
>   `active` with an ended paid period (`invalid_status`), since the hourly job would undo them.
> - Plans: the code is fixed once created; the trial plan can't be hidden, deleted or made public; a plan any center
>   or invoice uses can only be hidden (`plan_in_use`); nobody can be moved onto a hidden plan.
> - "How to pay" (`platform_settings.payment_instructions`) is edited on /admin/plans and audited by hand.
> - Support view: center, branches, staff (name, role, status, last sign-in), student counts, groups with active
>   students, the last 10 payments (amount, method; no names), the last 10 failed messages and imports.
> - Health: worker heartbeats (red after 2 min), the outbox (due now, waiting, oldest due, sent / failed in 24 h,
>   SMS failures), each pg_cron job's last run.
> - Settings → Audit log (owners): newest first, 30 days by default, filters for what (table or support view), who
>   (staff, uteach support, automatic) and dates; ids and timestamps are left out of the changes.
- [x] Super-admin can list centers, extend a trial, issue and mark invoices, and open the read-only support view; each open is in `audit_log`. (M7b: pgTAP `m7b_admin`, 75 checks: service role only, non-super-admins refused, every action audited as `super_admin`, the support view writes `support_view`, which the owner reads; checked in the browser on local data; /admin is a 404 for everyone else.)
> PROPOSED (M7c plan, 2026-10-14): the exact numbers, building on the M7 plan above.
> - **Three RPCs, security invoker** (RLS decides what the caller sees; an admin sees only their branches):
>   `dashboard_owner(p_center_id, p_branch_id default null)`, `dashboard_admin(p_center_id)`,
>   `dashboard_teacher(p_center_id)`, each returning one jsonb. "Today" and "this month" are taken in each
>   branch's timezone (lessons, payments) or the center's (leads). `dashboard_owner` refuses non-owners (`forbidden`).
> - **Owner** (all branches, or one with the branch filter):
>   - today: lessons not cancelled; how many are fully marked; **attendance %** = (present + late) ÷ (present + late +
>     absent) of today's marks (excused left out; "—" before the first mark); payments today = sum and count of
>     payments not voided, `paid_at` today;
>   - month to date: **charged** = charges not voided with `due_date` in this month; **collected** = payments not
>     voided with `paid_at` in this month; **collection rate** = collected ÷ charged ("—" when nothing is charged);
>     **debt** = total of the `debtors` view, by its existing buckets 0–30 / 31–60 / 61–90 / 90+ days (changed
>     from the plan's 0–30 / 31–60 / 60+ so the dashboard matches the Debtors page);
>   - **active students** = distinct students with an enrollment covering the day (`start_date ≤ day`, `end_date`
>     empty or ≥ day), today and on the last day of last month, and the difference;
>   - leads: **new** = leads created this month; **won** = moves to Won this month (`lead_activities`
>     status_change → won);
>   - a card per branch: lessons today, active students, collected this month, debt.
> - **Admin** (their branches): today's lessons with "marked ✓ / not yet" (every expected student has a mark);
>   the **top 10 debtors** by debt with days overdue (only with the `billing` permission); **follow-ups** = open lead
>   tasks due by the end of today, overdue ones first; **trials today** (scheduled trials on today's lessons);
>   **no Telegram** = active students for whom neither the student nor any guardian has a live link (count, link
>   to the Students list); **schedule conflicts** = open `schedule_conflicts` (count, link to Schedule).
> - **Teacher** (on Today, above the week): lessons still to mark = their lessons that have ended, are inside the
>   48 h edit window and miss marks; their groups with active students; **scores to enter** = their groups with no
>   exam result in the last 30 days. No money anywhere.
> - **Home:** owners get the owner dashboard, admins the admin one; the setup steps card stays while setup is
>   incomplete. Owners who teach still get Today in the menu.
> - **Tests:** pgTAP `m7c_dashboards` builds a fixture center (2 branches, lessons today and yesterday, marks,
>   charges and payments this month and last, debts in several buckets, leads and a won move, a trial, an
>   unlinked student, a conflict) and checks every number for the owner (both filters), an admin of one branch,
>   and a teacher; a member of another center gets nothing. Browser check and screenshots at 1440 / 390.
- [ ] Owner/admin/teacher dashboards show the numbers defined in 20, verified against fixture data.
- [ ] Prod: `docker compose up` on the VPS serves HTTPS; deploy from CI; worker and web restart automatically; daily DB backup verified by a restore test; error tracking receives a test error; an uptime alert reaches Telegram.
- [ ] A full dry run with real data from a friendly center (import → a week of attendance → month-start charges → payments → reminders) is completed with no blocking bugs.
- [ ] Supabase project is on **Pro** before the first paying center.
**E2E:** the full loop: lead → trial → convert → attendance → charge → payment → receipt in Telegram.

---

# 🟨 v2: after launch

## M8 · Online payments

> PROPOSED: scope details: secrets in Vault, payment from the bot.

**Scope:** provider configs per center (secrets in Vault), Payme Merchant API, Click Prepare/Complete, Uzum adapter, pay links and pay codes (`payment_intents`), payment from bot ("Pay" button), refunds, promo codes.
**Tables:** payment_provider_configs, payment_intents, provider_transactions, refunds, promo_codes.
**Done when:**
- [ ] Each provider passes its official sandbox/test-suite scenarios (Payme sandbox test cases, Click test, Uzum test), including cancel after perform.
- [ ] Callbacks are idempotent: replaying any callback 5× produces one payment.
- [ ] Wrong signature/auth → rejected with the provider's error code; nothing written.
- [ ] A successful payment creates the payment + receipt + notification in one transaction.
- [ ] A refund reduces the balance and (Payme) cancels the transaction.
- [ ] A promo code applies the discount for N months and respects `max_uses` under concurrency.
- [ ] Provider secrets are never returned to the browser (test).
**E2E:** parent taps Pay in the bot → sandbox payment → receipt arrives → debt cleared.

## M9 · Mini App

> PROPOSED: the screen list and the 2 s load target.

**Scope:** `/tg` Mini App: initData verification, child switcher, home, schedule, attendance, payments + pay in app, scores, settings.
**Done when:**
- [ ] Forged or expired initData is rejected; a user can't access a student not linked to them by changing `student_id` (test).
- [ ] All screens render in Telegram light and dark themes, in uz/ru/en.
- [ ] Pay in app completes a sandbox payment.
- [ ] First load is under 2 s on a mid-range Android over 4G.

## M10 · Payroll
**Scope:** pay rules (5 kinds, scoped), monthly runs draft → approved → paid, adjustments, teacher "My earnings".
**Done when:**
- [ ] `computePayroll` unit tests for each rule kind, scopes, substitutes, cancelled lessons and mid-month validity.
- [ ] Draft runs recompute; approved runs are frozen; teachers see only their own approved/paid items (RLS).
- [ ] Marking paid records it (and creates expenses once M11 exists); paid ✓/✗ per teacher is visible.

## M11 · Finance
**Scope:** accounts (full), expense categories, expenses with attachments, transfers, kassa closing with lock, P&L (accrual + cash), payroll → expenses.
**Done when:**
- [ ] Account balances equal Σ movements on fixtures.
- [ ] A kassa closing with a difference requires a note and locks the day; voids in a locked day are blocked except for the owner.
- [ ] P&L per branch matches the fixtures for both accrual and cash.

## M12 · Analytics
**Scope:** money, students/churn, funnel, teachers, attendance heatmap, at-risk detection + list; materialised views and nightly refresh.
**Done when:**
- [ ] Every metric in 20 has a fixture-based test with a hand-computed expected value.
- [ ] At-risk flags are created and auto-resolved per the rules in 14.
- [ ] Analytics pages load in under 2 s for a center with 2 000 students and 2 years of data (seeded perf fixture).

## M13 · Leads v2 & packages

> PROPOSED: scope additions: bot enquiry, round-robin and UTM placed in M13 (they are on the Leads auto-capture card, which the canvas doesn't assign to a milestone).

**Scope:** lead capture endpoint, bot enquiry, Meta lead ads webhook, round-robin assignment, UTM; package billing (to reconsider: with cycle billing a package may just be a non-renewing cycle, see 15).
**Done when:**
- [ ] The capture endpoint creates leads, rejects bad tokens, honours rate limits and the honeypot.
- [ ] A Meta test lead arrives once even if delivered twice.
- [ ] Round-robin spreads leads evenly among eligible admins.
- [ ] (If packages are kept) a non-renewing cycle gets no next charge, and a reminder goes out at 2 lessons left.

---

# ⬜ Later: growth

## M14 · Learning
Homework (incl. audio submissions), materials, monthly PDF reports with teacher comments.
**Done when:** a teacher assigns homework → a student submits audio in the bot → the teacher grades → the parent is notified; monthly reports generate for all active students and send on schedule.

## M15 · Growth

> PROPOSED: deciding the "upcoming events page" here (from your Brainstorming note).

Referrals (codes, auto rewards, anti-abuse), saved audiences, campaigns, public center page with trial sign-up form; decide on the "upcoming events page".
**Done when:** a referral from code → lead → convert → first payment credits the referrer exactly once; abuse cases are rejected; the public page form creates a lead.

## M16 · API & webhooks
Public REST API with scoped keys, OpenAPI docs, signed webhooks with retries.
**Done when:** the OpenAPI spec is generated and published; scope enforcement is tested; webhook signatures verify with the documented algorithm; retries back off and stop after 24 h.

## M17 · Mock engine + AI
Online auto-graded L/R mocks; AI writing/speaking feedback with teacher review first.
**Done when:** a timed online mock auto-scores into `exam_results`; AI feedback is never visible to students before teacher approval (test).

## M18 · Expansion

> PROPOSED: `kk` locale and email in M18.

KZ (kk locale, KZT, Kaspi), WhatsApp, email, Stripe, white-label bot.
**Done when:** a KZ test center runs the full loop using only new adapters, locales and settings; no core business logic changed.
