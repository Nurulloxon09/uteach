# 14 · Attendance 🟩 (at-risk 🟨)

Milestone: **M2** (sheet, edit window, matrix, notifications enqueued). The at-risk UI comes in **M12**; detection rules are defined here.
Tables: `attendance`, `lead_trials`, `risk_flags`, `notification_outbox`.

## Mobile attendance sheet (teacher)

> PROPOSED: the expected-students rule, late minutes, one-RPC save, first save = `held`, optimistic UI, the 30-min-before rule, trial badge. Canvas: Present / Late / Absent / Excused and All present.

- Opened from "Today" or a lesson. It lists the **expected students**: enrollments active on `lesson.local_date`, excluding freezes covering that date, plus **trial guests** (`lead_trials`) with a "trial" badge.
- Each row has 4 big buttons: **Present / Late / Absent / Excused**. Late asks for minutes (optional), and a note is optional.
- **"All present"** button, then fix the exceptions.
- Save writes all rows in one RPC (`save_attendance(lesson_id, rows[])`). The first save sets `lesson.status='held'`. A topic field sits at the top.
- Works on a poor connection: optimistic UI, and the save is retried. (An offline queue is a nice-to-have, not required.)
- Allowed: the lesson's teacher (incl. substitute), and admins with `attendance`.

> PROPOSED (M2 plan): the sheet lives at `/attendance/[lessonId]` and reads through `attendance_sheet(lesson_id)`
> (names only, no contacts). "Expected" depends only on dates (`start_date ≤ local_date ≤ end_date`, no freeze
> covering the day), not on the enrollment's current status. Students who already have a mark but are no longer
> expected (e.g. a backdated end) stay on the sheet with a badge. Partial saves are allowed; unmarked students stay
> blank and the Save button shows "12 / 15 marked". **All present** marks only the still-unmarked rows. The draft is
> kept in the browser until it's saved, and a failed save is retried automatically (3 times) with a visible status.
> The original teacher of a substituted lesson can't mark it. A cancelled lesson can't be marked.

> PROPOSED (M2b): the draft lives in `localStorage` under the lesson id together with a "version" of the saved
> marks; a draft made against an older version (someone else saved since) is dropped, not merged. Once some rows
> are marked, "All present" reads "Mark the rest present". After the window an admin sees a note that their
> changes go to the audit log. Today chips: "To mark" (open, nothing marked), "Not marked" (ended, nothing
> marked), "12/15 marked" + "2 absent", "Upcoming", "Cancelled".

> PROPOSED (M5 plan): trial guests are listed after the students with a "Trial" badge and the same four
> buttons; "All present" includes them. Their row has a "Feedback" field (the lesson's teacher or an admin with
> `leads`). Guests are never billed and don't count in attendance %, the matrix, lesson stats or absence
> alerts. A guest whose trial was cancelled leaves the sheet unless already marked.

> PROPOSED (M2 plan): the owner/admin nav gets **Attendance**: lessons of one day (default today) in the user's
> branches with their state (not marked yet, "12 / 14 · 2 absent", cancelled) and a "not marked" filter over the
> last 7 days. Tapping a lesson opens the sheet; marking needs the `attendance` flag.

## Edit window

> PROPOSED: the edit window measured from `ends_at`, the "ask an admin" message, making it a center setting. Canvas: teachers 48 h; admins any time (audited).

- Teachers can create or edit attendance until **`lesson.ends_at + 48 h`** (`centers.attendance_edit_hours`). After that the sheet is read-only for them, with the message "ask an admin".
- Admins with `attendance`: any time. Edits after the window write `audit_log`.
- Teachers can't mark a lesson more than 30 min before it starts.

> PROPOSED (M2 plan): the 30-minute rule applies to admins too (a future lesson has no attendance). Someone who is
> both the lesson's teacher and an admin with `attendance` gets the admin rules. An admin edit after the window
> writes one `audit_log` row per changed attendance row (changed columns only). Owners set the window, the alert
> delay, late alerts and quiet hours in Center settings → "Attendance & notifications".

## Attendance matrix

> PROPOSED: cell styling, the % formula (excused excluded), admin click-to-edit, Excel export.

- On the group page: students (rows) × lessons in the month (columns). Cells are P / L / A / E, color-coded, or blank if not marked. Cancelled lessons are greyed. Before an enrollment's start or after its end the cell is hatched.
- The totals column shows attendance % for the month = (present + late) / (marked lessons − excused).
- Admins can click a cell to edit. Teachers can edit within the window.
- Export to Excel.

> PROPOSED (M2 plan): the month is a calendar month of `lessons.local_date`. Rows = students with an enrollment in
> the group overlapping the month (or a mark in it); frozen days are hatched like days outside the enrollment.
> With no marked lessons the % shows "—". The % is computed by `attendanceRate()` in `packages/core` (basis
> points, half-up). Teachers read the matrix through `attendance_matrix(group_id, from, to)` (names only). Clicking a
> cell opens a small P/L/A/E picker that saves through `save_attendance` with one row. Below `md` the tab shows a
> per-student summary (%, P/L/A/E counts) instead of the grid. The export has the same cells and % as the screen.

> PROPOSED (M2c): cell letters are translated (en P/L/A/E, ru П/О/Н/У, uz B/K/Y/S; frozen F/З/M). The rate chip is
> green from 80%, amber from 60% (the at-risk line), red below. The tab is `?tab=attendance&month=YYYY-MM`. The
> export is `/[locale]/groups/[id]/attendance/export?month=YYYY-MM` (title row, then a header row of dates and a
> row of weekday + time or "cancelled", then one row per student with P/L/A/E counts and the rate as a % cell).
> The group's Lessons tab shows each lesson's marking state and links to its sheet; the student profile gets an
> Attendance tab (per group: this month and last 30 days, then the latest 10 marks).

## Absence alerts

> PROPOSED: who receives it, the dedupe key format, cancelling when the status changes, optional late alerts, quiet hours applied at enqueue. Canvas: guardian notified after 10 min, deduped; M2 only enqueues.

- When a student is saved as **absent**, enqueue `absence_alert` for each guardian with `receives_notifications` (or for the student, if they're an adult with no guardians) with:
  - `send_after = marked_at + 10 min` (`centers.absence_alert_delay_min`), so a quick correction doesn't spam the parent;
  - `dedupe_key = 'absence:{lesson_id}:{student_id}:{guardian_id}'`.
- If the status is changed away from absent before sending, the pending outbox row is set to `cancelled`.
- Late can optionally alert too (center setting, default off). Excused never alerts.
- Quiet hours push `send_after` to the end of quiet hours (see 17).
- **M2 only enqueues.** Sending starts in M4. M2 must still produce correct outbox rows (tested).

> PROPOSED (M2 plan): alerts are enqueued only while the lesson is inside the teacher edit window
> (`now() < ends_at + attendance_edit_hours`); later corrections don't message parents. The recipients are the
> guardians with `receives_notifications`; if there are none, the student. Marking absent again after a change
> revives the cancelled outbox row (same dedupe key, new `send_after`); a row that was already sent is never
> re-sent. `late_alert` follows the same rules when `centers.late_alert_enabled`. Payload: `student`, `group`,
> `date` (ISO), `time` (HH:MM, branch tz), `center`, `lessonId`, `studentId`, plus `minutes` for late alerts (0 when
> not entered); M4 formats them per locale. Changing a mark only re-queues when the status changes.

## At-risk detection 🟨

> PROPOSED: excused breaks the streak, at least 6 marked lessons, auto-resolve, resolution note required, staff alert. Canvas: 3 absences in a row or < 60% in 30 days → admin calls.

Nightly `detect_at_risk`, per active enrollment:
- **3 absences in a row**: the last 3 *marked* lessons are all `absent` (excused breaks the streak; it doesn't count as absent).
- **Low attendance**: under 60% `(present+late)/(marked − excused)` over the last 30 days, with at least 6 marked lessons.
- Creates a `risk_flags` row (unique open per enrollment + kind). Auto-resolves when the condition is gone.
- The admin sees the "At-risk" list (M12) and calls. Resolving requires a note.
- Optional staff alert to the branch admin in Telegram.
