# 00 · README (start here)

**uteach** is a multi-tenant SaaS that runs learning centers (language schools and exam-prep centers). It covers students, groups, schedule, attendance, payments and debts, exam scores and teacher payroll. Parents get updates through **Telegram**.

The first market is 🇺🇿 Uzbekistan: uz/ru UI, UZS currency, Click, Payme and Uzum payments, and Eskiz SMS. **The code must stay country-agnostic.** Country specifics live behind adapters and per-center settings.

## How to use this spec

> PROPOSED: "when they disagree, the note wins; fix the canvas"; "don't build anything from a later milestone early"; updating `progress.md` when a milestone is done (comes from your file tree, not the canvas).


- The **canvas** (`docs/uteach.canvas`) is the map. These notes are the **source of truth**. When they disagree, the note wins; fix the canvas.
- Build **strictly in milestone order** (`30-milestones.md`). Don't build anything from a later milestone early, even if it looks easy.
- Every schema change starts in `02-data-model.md`. Update the spec first, then write the migration.
- When a milestone is done, update `progress.md`.

## Files

| File | What it is |
|---|---|
| `01-tech-stack.md` | Fixed stack, repo layout, runtime architecture, hosting, scheduled jobs |
| `02-data-model.md` | Every table, column, enum, constraint, view and RLS rule |
| `03-roles-permissions.md` | Roles, admin permission flags, permission matrix, RLS helpers |
| `04-rules.md` | Non-negotiable cross-cutting rules (money, time, i18n, adapters, audit…) |
| `05-ui.md` | UI & design system: the reference app, tokens, fonts, layout, patterns, `/dev/ui` |
| `10-platform-onboarding.md` | Auth, centers/branches/rooms, staff, onboarding wizard, import, plans, super-admin |
| `11-leads-crm.md` | Lead pipeline, timeline, trials, conversion, auto-capture |
| `12-students-groups.md` | Students, guardians, courses, levels, groups, enrollments |
| `13-schedule.md` | Schedule rules, lesson generation, conflicts, timetable, cancel/makeup/substitute |
| `14-attendance.md` | Mobile sheet, edit window, matrix, absence alerts, at-risk |
| `15-payments-debts.md` | Cycle charges, payments, receipts, balances, debtors, online payments |
| `16-exam-scores.md` | Exam types, score entry, targets, progress |
| `17-telegram-notifications.md` | Bot linking and menu, outbox, SMS fallback, broadcasts, reminders |
| `18-teacher-payroll.md` | Pay rules, monthly runs, my earnings |
| `19-finance-expenses.md` | Accounts, expenses, transfers, kassa closing, P&L |
| `20-analytics.md` | Role dashboards, money/students/sales/teacher analytics |
| `21-student-parent-portal.md` | Telegram Mini App |
| `22-learning.md` | Homework, materials, monthly PDF reports |
| `23-growth.md` | Referrals, campaigns, public page, API and webhooks, expansion |
| `30-milestones.md` | M0–M18 with scope and "done when" criteria |
| `progress.md` | What's finished. Claude updates this. |

## Release tiers

- 🟩 **MVP** (M0–M7): the first paying center
- 🟨 **v2** (M8–M13): right after launch
- ⬜ **Later** (M14–M18): growth

## Core business flow (the loop uteach automates)

1. **Lead comes in** (Instagram, Telegram, walk-in, call, referral). *Leads CRM*
2. **Contacted**: record goal (e.g. IELTS 7.0), level and preferred schedule. *Leads CRM*
3. **Trial lesson**: the lead is a guest on a real lesson's attendance sheet. *Leads, Schedule*
4. **Enrolled**: creates student, guardian and enrollment, plus the first cycle charge. *Students & groups, Payments*
5. **Attends**: the teacher marks attendance and the parent is alerted on absence. *Attendance, Telegram*
6. **Pays per cycle**: prepaid charge for each cycle of lessons (e.g. 12), reminders, receipt. (Changed from the canvas "charge on the 1st", 2026-10-10.) *Payments & debts*
7. **Mock tests**: scores vs target; parents see progress. *Exam prep & scores*
8. **Renews / sits exam**: next level, or official result recorded. *Students & groups, Exams*
9. **Refers a friend**: a referral code becomes a new lead. *Growth ⬜*

Side paths:
- ✖ **Lost lead**: a reason is required; re-engage with a campaign later.
- ⚠ **Overdue debt**: reminders every N days → debtors list → call.
- ⚠ **At-risk** 🟨: 3 absences in a row, or under 60% attendance in 30 days → admin calls.

## Glossary

| Term | Meaning |
|---|---|
| Center | A tenant (one customer business). Every tenant row has `center_id`. |
| Branch | A physical location of a center. Has its own timezone. |
| Membership | A staff user's role in a center (owner / admin / teacher). |
| Group | A class: a course + level, teacher, room, schedule and price. |
| Lesson | One concrete scheduled occurrence of a group. |
| Enrollment | A student in a group over a date range. |
| Charge | What a student owes for one enrollment for one month. |
| Tiyin | Minor unit of UZS (1 UZS = 100 tiyin). All money is stored in minor units. |
| Kassa | Cash desk. "Kassa closing" is the daily cash count. |
| Outbox | Table of pending notifications that the worker sends. |
