# Progress

> PROPOSED: the status table format and symbols. The file itself comes from your file tree, not the canvas.


Claude updates this file at the end of every work session and when a milestone's "done when" list is complete.
Format: newest first. Keep it short and factual.

## Current milestone
**M0 · Foundation**: not started.

## Milestones
| # | Milestone | Status | Finished |
|---|---|---|---|
| M0 | Foundation | ☐ not started | |
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

## Log

### 2026-10-10
- **All `> PROPOSED:` items in the spec are confirmed by the user**, as is every later proposal (the M0 plan included). The markers stay as a record of which decisions didn't come from the canvas.
- Spec written from the canvas (`docs/uteach.canvas`) into `docs/spec/`. No code yet.
- Decisions made while drafting, to confirm (see "Open questions" in 02):
  - Auth = phone + password, with SMS OTP for sign-up verification and reset (the canvas mentions both "phone+OTP" and "phone + password").
  - `group_prices` table added (keeps prices away from teachers; price history).
  - `audit_log` moved to M0 (needed by M2 and M7).
  - Charges are per enrollment (per cycle since the 2026-10-10 decision); unexcused absences are still billed.

### 2026-10-10: owner decisions
- ✅ Charges: separate charge per enrollment (2 groups = 2 charges).
- ✅ Unexcused absences are billed.
- ✅ Staff login: phone + password; SMS OTP only for sign-up and password reset.
- ✅ Center defaults: 1 000 UZS rounding, due in 10 days, reminders every 3 days, quiet hours 21:00–08:00.
- ✅ Trial: 14 days, up to 50 active students.
- ✅ Admins without `discounts` can give at most 10%.
- ✅ Billing model: **per lesson cycle from the student's start date** (option B), replacing the canvas "charge on the 1st". Cycle length set per group (default 12). Prepaid before the cycle starts. Freezes pause the cycle. Unused lessons when leaving mid-cycle: each center decides (`leave_credit_policy`, default `ask`). Spec rewritten in 15, 02 (`charges`, `centers`, `group_prices`), 12, 13, 30 (M3); calendar-month billing kept as an appendix in 15 for later.
- Update the canvas: core flow step 6 still says "charge on the 1st".
- Fixed: Obsidian links in `04`, worked-example arithmetic in `15`. Added `CLAUDE.md`.

## Known gaps / follow-ups
- Verify the SAT / CEFR / Milliy sertifikat score ranges and grade mappings against official sources before M6.
- "Upcoming events page" (from brainstorm) has no milestone yet; decide in M15 planning.
