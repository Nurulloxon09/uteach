# 10 · Platform & onboarding 🟩

Milestones: **M0** (auth, centers, branches, rooms, staff, RLS, i18n, CI), **M1** (Excel import), **M7** (plans & trial, super-admin).
Tables: `profiles`, `centers`, `branches`, `rooms`, `memberships`, `plans`, `platform_invoices`, `import_jobs`, `audit_log`, `system_heartbeats`.

## Auth (M0)

> ✅ CONFIRMED by owner (2026-10-10): login is **phone + password**; SMS OTP only for sign-up verification and password reset.

> PROPOSED: console OTP in dev; cookie sessions; +998 mask; rate limits 5/phone/h and 10/IP/h.

- **Phone + password** via Supabase Auth.
- **OTP** (SMS) for sign-up phone verification and password reset. It's sent through the Supabase **Send SMS hook → Eskiz** adapter. In local dev, the hook logs the OTP to the console.
- Login screen: phone (with +998 default mask from locale), password, "Forgot password".
- Sessions use Supabase cookies (`@supabase/ssr`), refreshed in middleware.
- Rate limits: 5 OTP sends per phone per hour, and 10 per IP per hour.

## Create center (M0)

> PROPOSED (M0): until the full wizard (M1), a first-run **Create center** form asks for the center name, language, time zone and first branch. During the SMS-code step the phone number is kept in a 15-minute httpOnly cookie, never in the URL. The center shown in the app is remembered in the `uteach_center` cookie; switching it never grants access (RLS decides). The per-phone OTP limit (5/hour) moves to M4 with Eskiz; M0 relies on Supabase's limits (one SMS per 60 s per user, 30 per hour per project locally).

> PROPOSED: the whole section (`create_center()` RPC, what it seeds, one cash account per branch).

Signing up as a new owner leads to the onboarding wizard. `create_center()` RPC creates, in one transaction: the center (status `trial`, `trial_ends_at = now()+14d`), the owner membership (`active`), the first branch (timezone = center timezone), and seed data (lost reasons, system templates are global, one cash account per branch).

## Onboarding wizard (M1, the import step uses M1 import)

> PROPOSED: placing the wizard in M1; steps skippable/resumable; the course preset list; the post-wizard checklist. The six steps in order are from the canvas.

Steps, each skippable and resumable (progress stored in `centers.settings.onboarding`):
1. **Center**: name, logo, language, currency (fixed UZS at launch), timezone.
2. **Branch**: name, address, timezone. Add more later.
3. **Rooms**: quick list (name, capacity).
4. **Course presets**: pick from presets (General English, Kids English, IELTS, SAT, CEFR, Milliy sertifikat, Russian, Math) or add custom. Exam presets link `exam_type_id`.
5. **Import**: upload Excel, or "add manually later".
6. **Staff**: invite admins and teachers by phone.
Done → dashboard with a checklist (create first group, connect the Telegram bot, record the first payment).

> PROPOSED (M1d, as built): steps 1–2 are two sections of one form (center with optional logo, language,
> currency shown as UZS, time zone; then the first branch), saved together. Step 3 adds rooms to the first
> branch, step 4 creates preset courses (each level linked to the next) and/or one custom course, step 5 links to
> the import page, step 6 invites staff with the Staff page's dialog. Every step page has "Skip this step" and
> "Finish later". An enrollments row without a start date starts today (past months go into opening balances in
> M3). Template files have a second sheet with filling hints; files up to 5 000 rows, `.xlsx` or `.csv`.
> The import RPCs (`import_students`, `import_groups`, `import_enrollments`) need the `import` flag and branch
> scope; prices in a groups file also need `billing`.

> PROPOSED (M1): steps 1–2 are one client-side form pair; the center (with its first branch) is created through
> `create_center()` when step 2 is submitted, and the logo is uploaded right after to `center-assets/{center_id}/`.
> Before that there is nothing to resume. Steps 3–6 live at `/onboarding/{rooms|courses|import|staff}`; finishing or
> skipping a step records it in `centers.settings.onboarding`. The owner is never forced back into the wizard:
> Home shows "Continue setup" until every step is done or skipped. The M1 checklist has "create the first group"
> and "add students"; the Telegram and payment items appear with M4 and M3. Course presets create courses with
> levels in the center's language; exam presets get linked to `exam_types` in M6.

## Staff & permissions (M0)

> PROPOSED (M0): the teacher's timetable colour picker moves to M1 (the column exists; the timetable that uses it is M1). The invite link is shown once after creating it; "New link" issues a fresh token and kills the old one.

> PROPOSED: invite mechanics (hashed token, 7-day expiry, single use, phone must match), branch + flag choices, colour, disable behaviour, last-owner rule. Canvas: invites by link; owner / admin (+flags, branches) / teacher.

- Owner invites by phone and role. This creates `memberships(status='invited')` with a hashed token, and returns an **invite link** (`/invite/{token}`) to copy or send through Telegram/SMS.
- Opening the link: if signed in with the same phone, accept; otherwise sign up/in with that phone (OTP), then accept. The link expires in 7 days and is single-use.
- Admins: choose branches + permission flags (see 03; defaults pre-ticked).
- Teachers: choose branches + timetable color.
- Disable a member: status `disabled`. They lose access immediately (RLS checks `active`). History is kept.
- An owner can't remove the last owner.

## Centers, branches, rooms (M0)

> PROPOSED: the whole section (archive rule, timezone-change warning).

CRUD screens. Archiving a branch requires no active groups. Changing a branch timezone only affects lessons generated afterwards. The UI warns about this.

## Excel import (M1)

> PROPOSED: upload → mapping → validation → preview → all-or-nothing import, matching rules, re-run without duplicates, template files. The four import kinds are from the canvas.

- Upload `.xlsx` / `.csv` → `import_jobs` → column mapping UI (auto-guessed from headers in uz/ru/en) → **validation pass** (no writes) → preview with errors per row → import (one transaction per job; all or nothing).
- Kinds (in dependency order): **students** (+ guardians), **groups** (course, level, teacher, room, weekdays + time, price), **enrollments** (student ↔ group, start date), **opening balances** (student, amount; negative = debt).
- Matching: students by `external_ref`, else phone + name; groups by name within branch. Re-running the same file doesn't duplicate rows.
- Downloadable template files per kind, in each locale.
- Opening balances create `balance_adjustments(kind='opening_balance')`.

> PROPOSED (M1): opening balances are imported in **M3** (with `balance_adjustments`). The file is uploaded by the
> browser straight to Storage (`imports/{center_id}/{job_id}.xlsx`), so no large request goes through a Server
> Action; validation re-reads it with the saved column mapping. Matched rows (by `external_ref`, else phone +
> normalised name; groups by name in branch) are **skipped**, not overwritten, so a re-import never undoes edits
> made in the app. In the groups file, teachers are matched by staff name; a group whose teacher isn't on staff yet
> gets its rules but no lessons until a teacher is set. Template headers come from the i18n catalogs; header
> auto-guessing accepts the template headers of all three languages plus common aliases.

## Plans & trial (M7)

> ✅ CONFIRMED by owner (2026-10-10): 14-day trial, up to 50 active students.

> PROPOSED: 7-day grace before read_only, "active student" definition, blocking only new enrollments, manual uteach invoices. Canvas: 14-day trial, past_due → read_only, student limits.

- A 14-day trial with full features, up to 50 active students.
- When the trial ends without payment, `past_due` starts: a banner shows and everything still works for **7 days** of grace. After that the center becomes `read_only`: reads and exports work, writes are blocked by RLS (`center_writable`). Paying restores `active`.
- **Student limit** = active students (with at least one active enrollment). At the limit, new enrollments are blocked with an upgrade prompt. Existing ones are never touched.
- uteach invoices are manual at launch: super-admin issues a `platform_invoices` row, the owner pays by bank transfer or Payme, and super-admin marks it paid. Automated billing comes later.

## Super-admin (M7)

> PROPOSED: the actions list (extend trial, change plan, set status), no-login-as-user, health contents. Canvas: centers, plans, invoices, support view (audited), system health.

`/admin`, gated by `is_super_admin`. It uses the service role server-side.
- Centers list: status, plan, students, last activity, trial end. Actions: extend trial, change plan, set status.
- Plans CRUD. Invoices: issue, mark paid, void.
- **Support view:** read-only browse of one center's screens. Each open writes `audit_log(action='support_view')`.
- System health: worker heartbeats, outbox backlog/failure rate, pg_cron last runs, provider callback errors.

## Done-when checklists
See `30-milestones.md` M0, M1, M7.
