# 12 · Students & groups 🟩

Milestone: **M1**.
Tables: `students`, `guardians`, `student_guardians`, `student_notes`, `courses`, `levels`, `groups`, `group_prices`, `enrollments`, `enrollment_freezes`.

## Students & guardians

> PROPOSED: the profile contents, linking guardians by matching phone, notes hidden from teachers by default, list filters, "active" = has an active or frozen enrollment, archive rules.

- **Student profile:** name, phone (optional for kids), birth date, gender, school, home branch, guardians, enrollments (current and past), balance (if the viewer has `billing`), attendance summary, scores, notes, Telegram linked ✓/✗.
- **Guardians:** name, phone, relation, primary, receives notifications/billing. Adding a guardian whose phone already exists in the center **links the existing guardian**, which is how siblings share guardians. The UI shows "also guardian of: …".
- **Notes:** free text with pin. "Visible to teachers" is off by default.
> PROPOSED (M4c, as built): `student_overview.telegram_linked` (the student or a guardian has a live link)
> drives the Students filter "Telegram: linked / not linked", a Telegram mark next to the name, and a chip on
> the profile.

- **Students list:** search (name, phone, guardian phone), filters (branch, group, course, status active/inactive, debtors, Telegram not linked), bulk actions (broadcast, export).
- A student counts as **active** if they have at least one `active` or `frozen` enrollment.
- Archive a student only with no active enrollments; the balance must be 0 or be written off.

## Courses, levels, groups

> PROPOSED: course kinds, `next_level_id`, auto-suggested group names, `forming → active → finished`, price history with "from which month?". Canvas: teacher, room, capacity, price, schedule rules.

- **Course:** name, kind, exam type (for exam prep), default price, default lesson length. **Levels** are an ordered list per course, each with an optional `next_level_id`.
- **Group:** branch, course, level, name (auto-suggested, e.g. "IELTS 6.0 · Mon/Wed/Fri 18:00"), teacher, default room, capacity, start/end date, status (`forming → active → finished`).
- **Price:** `group_prices` rows with an effective date. Changing the price adds a new row from the next month by default; the UI asks "from which month?".
- **Schedule rules:** one or more weekly slots (weekday, start time, duration, optional room/teacher override). Saving rules triggers lesson generation (see 13).

## Group page

> PROPOSED: the Finance tab and what teachers can see on each tab. Roster, lessons, attendance matrix and scores are from the canvas.

Tabs:
- **Roster:** active students, start dates, discounts (billing only), Telegram ✓, quick actions (freeze, transfer, end).
- **Lessons:** past and upcoming, with status, topic and attendance counts.
- **Attendance matrix:** students × lessons for a month, with color cells (see 14).
- **Scores:** results grid and per-student chart vs target (see 16).
- **Finance** (billing only): this month's charges and collection rate for the group.
Teachers see Roster (names only), Lessons, Attendance, Scores.

## Enroll / freeze / transfer / end

> PROPOSED: every rule in the table and below it: default start date, capacity = warning only, plan-limit block, frozen status flip, transfer = end + new enrollment keeping the discount, `moved_level` prompt, backdating, audit. Canvas: each action recalculates the month's charge.

All four are RPCs that keep cycle charges right (see 15). Schedule changes never change a charge amount; they only move the end of the cycle.

| Action | Input | Effect |
|---|---|---|
| **Enroll** | student, group, start date (default: next lesson date), discount %/amount + reason, price override | Creates the enrollment and the **first cycle charge** (starts at the student's first billable lesson). Warns if the group is at capacity; blocks if the plan's student limit is reached. |
| **Freeze** | from date, to date, reason | Creates `enrollment_freezes`; lessons in range are non-billable for this student; `status='frozen'` while today is in range (nightly job flips it back). The current cycle pauses and continues after the freeze; no charge changes. |
| **Transfer** | target group, transfer date | Ends the current enrollment (`end_date = date − 1`, `end_reason='transferred'`) and creates a new one from that date, keeping the discount by default. Unused lessons of the old group's cycle are always credited; cycle 1 starts in the new group. |
| **End** | end date, reason (completed / dropped / moved_level) | Sets `end_date`, `status='ended'`, voids not-yet-started cycles, and handles unused lessons by the center's `leave_credit_policy`. If `moved_level`, prompts to enroll in a group of the next level. |

Rules:
- Dates in the past are allowed (backdating); cycles are counted the same way. Money fixes are voids, reissues or `balance_adjustments`, never edits.
- Two non-ended enrollments of the same student in the same group are not allowed.
- Every action writes `audit_log`.

> PROPOSED (M1c): the group page's Roster tab comes after Lessons. The duplicate check runs on save: a match by
> phone or normalised name shows a warning and a second save creates the student anyway. The students list has
> no bulk actions yet: broadcast arrives with M4 and export with M7. Debtor and "Telegram not linked" filters
> come with M3 and M4.

> PROPOSED (M1): in M1 the billing side (first cycle charge, voiding cycles, unused-lesson credits) is the no-op
> hook `private.on_enrollment_change`; M3 fills it in. The plan's student limit check comes with plans in M7.
> Default start date = the group's next scheduled lesson on or after today (branch tz), else the group's start date.
> An end date in the future keeps the enrollment `active` until a nightly job sets `ended`; freezes flip
> `active ↔ frozen` the same way. Student archive checks active enrollments now; the balance check joins in M3.
