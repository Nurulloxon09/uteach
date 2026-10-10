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

## Edit window

> PROPOSED: the edit window measured from `ends_at`, the "ask an admin" message, making it a center setting. Canvas: teachers 48 h; admins any time (audited).

- Teachers can create or edit attendance until **`lesson.ends_at + 48 h`** (`centers.attendance_edit_hours`). After that the sheet is read-only for them, with the message "ask an admin".
- Admins with `attendance`: any time. Edits after the window write `audit_log`.
- Teachers can't mark a lesson more than 30 min before it starts.

## Attendance matrix

> PROPOSED: cell styling, the % formula (excused excluded), admin click-to-edit, Excel export.

- On the group page: students (rows) × lessons in the month (columns). Cells are P / L / A / E, color-coded, or blank if not marked. Cancelled lessons are greyed. Before an enrollment's start or after its end the cell is hatched.
- The totals column shows attendance % for the month = (present + late) / (marked lessons − excused).
- Admins can click a cell to edit. Teachers can edit within the window.
- Export to Excel.

## Absence alerts

> PROPOSED: who receives it, the dedupe key format, cancelling when the status changes, optional late alerts, quiet hours applied at enqueue. Canvas: guardian notified after 10 min, deduped; M2 only enqueues.

- When a student is saved as **absent**, enqueue `absence_alert` for each guardian with `receives_notifications` (or for the student, if they're an adult with no guardians) with:
  - `send_after = marked_at + 10 min` (`centers.absence_alert_delay_min`), so a quick correction doesn't spam the parent;
  - `dedupe_key = 'absence:{lesson_id}:{student_id}:{guardian_id}'`.
- If the status is changed away from absent before sending, the pending outbox row is set to `cancelled`.
- Late can optionally alert too (center setting, default off). Excused never alerts.
- Quiet hours push `send_after` to the end of quiet hours (see 17).
- **M2 only enqueues.** Sending starts in M4. M2 must still produce correct outbox rows (tested).

## At-risk detection 🟨

> PROPOSED: excused breaks the streak, at least 6 marked lessons, auto-resolve, resolution note required, staff alert. Canvas: 3 absences in a row or < 60% in 30 days → admin calls.

Nightly `detect_at_risk`, per active enrollment:
- **3 absences in a row**: the last 3 *marked* lessons are all `absent` (excused breaks the streak; it doesn't count as absent).
- **Low attendance**: under 60% `(present+late)/(marked − excused)` over the last 30 days, with at least 6 marked lessons.
- Creates a `risk_flags` row (unique open per enrollment + kind). Auto-resolves when the condition is gone.
- The admin sees the "At-risk" list (M12) and calls. Resolving requires a note.
- Optional staff alert to the branch admin in Telegram.
