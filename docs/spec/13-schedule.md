# 13 · Schedule 🟩

Milestone: **M1** (rules, generation, conflicts, timetable). Cancel/makeup/substitute come in M1, and their notifications are enqueued from M2 and sent from M4.
Tables: `group_schedule_rules`, `lessons`, `holidays`, `schedule_conflicts`.

## Lesson generation

> PROPOSED: the algorithm details (horizon from today in branch tz, `on conflict (rule_id, local_date)`), what happens on rule edits, `expandRules()` with DST tests. Canvas: 8 weeks ahead, idempotent, holidays skipped.

- Input: active rules (`valid_from ≤ day ≤ coalesce(valid_to, ∞)`), the group's start and end date, holidays (branch or center-wide), and the branch timezone.
- Horizon: **8 weeks ahead** from today (branch tz).
- For each (rule, date) where the weekday matches and it isn't a holiday: `starts_at = (date + start_time) at time zone branch.timezone`, `ends_at = starts_at + duration`. Insert with `on conflict (rule_id, local_date) do nothing`, so generation is **idempotent**.
- If an exclusion constraint fires (room or teacher conflict), skip the lesson and upsert `schedule_conflicts`.
- Runs: when rules are saved (for that group), and daily via pg_cron `generate_lessons` (all groups).
- **Rule edits** (time, weekday, room, teacher): future lessons from that rule with status `scheduled`, **no attendance**, and `is_manually_edited = false` are deleted and regenerated. Past lessons and lessons with attendance are never touched.
- The pure function `expandRules(rules, holidays, range, tz)` lives in `packages/core/schedule` and is unit tested, including across DST (Uzbekistan has none, but the code must not assume that).

> PROPOSED (M1): the SQL generator is built on `private.expand_rules()`, a pure SQL function with the same inputs.
> A parity test runs both on the same fixtures (`packages/core/src/schedule/fixtures.json`) in PGlite. Lessons are
> never generated in the past. A rule with no teacher (neither its own nor the group's) generates nothing; saving
> such a rule is refused (`rule_needs_teacher`). Until M2, "no attendance" means `status = 'scheduled'`.

## Conflict detection

> PROPOSED: UI pre-check and the conflicts inbox with its resolutions. DB exclusion constraints on room & teacher are from the canvas.

- A DB **exclusion constraint** on room and on teacher overlapping time ranges (non-cancelled lessons). It's the final guard and can't be bypassed.
- The UI pre-checks when editing rules or moving a lesson ("Room 3 is taken by IELTS-2 at 18:00") using the same query.
- The conflicts inbox (badge in the timetable) lists `schedule_conflicts`. Resolve by moving the lesson, changing the room, or skipping (marks resolved).

## Timetable

> PROPOSED: drag sets `is_manually_edited`, "notify students?" prompt, one-off move doesn't change the rule, teacher's mobile list. Canvas: week/day by room or teacher, drag to reschedule.

- Views: **week** and **day**; by **room** (columns = rooms) or by **teacher** (columns = teachers). Filter by branch.
- **Drag to reschedule** one lesson: updates `starts_at/ends_at` and sets `is_manually_edited = true`. Changing the date or time asks "notify students?" (default yes). This one-off move doesn't change the rule.
- Teacher's own view (mobile): today's and the week's lessons as a list, and tapping a lesson opens the attendance sheet.

> PROPOSED (M1): the "notify students?" prompt arrives in M2 with the outbox. Until the attendance sheet exists
> (M2), tapping a lesson in Today opens its group. Drag uses `@dnd-kit` (keyboard support); every lesson also has a
> "Move" dialog, so moving never depends on a mouse. Below `md` the timetable is a day list, never a sideways grid.

## Cancel / makeup / substitute

> PROPOSED: the "center's fault" → non-billable rule, makeup billing default, substitutes counted in payroll, the notification template keys, building these in M1. Canvas: cancel / makeup / substitute with notifications.

| Action | Effect | Notification |
|---|---|---|
| **Cancel** (reason; "center's fault" checkbox, default on) | `status='cancelled'`; if center's fault, `is_billable=false` → the lesson doesn't count, so each student's cycle extends by one lesson (no charge changes) | `lesson_cancelled` to students and guardians |
| **Makeup** | Creates an ad-hoc lesson (`is_makeup`, `makeup_for_lesson_id`), billable state as chosen (default: not billable if it replaces a cancelled billable one, i.e. net zero) | `lesson_moved` / new lesson |
| **Substitute** | Sets `teacher_membership_id` = substitute, keeps `original_teacher_membership_id`; the substitute can mark attendance; payroll counts the lesson for the substitute | optional to students; staff alert to the substitute |
| **Move** | Same as drag | `lesson_moved` |

Notifications are enqueued into the outbox with dedupe keys (`lesson_cancelled:{lesson_id}:{recipient}`).

> PROPOSED (M2 plan): `cancel_lesson`, `move_lesson` and `create_makeup_lesson` get `p_notify boolean default true`,
> and `add_holiday` gets `p_notify boolean default false` (opt-in, as above). Recipients are the students expected
> at the lesson plus their guardians with `receives_notifications`. A move notifies only when the date or time
> changes (not a room-only change); its dedupe key includes the new start (`lesson_moved:{lesson_id}:{epoch}:{recipient}`),
> and a new move or a cancel sets the lesson's still-pending `lesson_moved` rows to `cancelled`. A makeup for a
> cancelled lesson sends `lesson_moved` (old and new time); an extra lesson sends a new key, `lesson_added`.
> Substitutes don't notify students in M2; the substitute's staff alert comes with M4. Dropping a lesson on the
> timetable opens a confirm with "Notify students and parents" ticked. Regeneration and holiday cancelling also
> skip lessons that have attendance (until now `status = 'scheduled'` stood in for that).

## Holidays

> PROPOSED: adding a holiday cancels already-generated lessons, which extends running cycles.

A center or branch list per date. Adding a holiday affects lessons already generated on that date (no attendance): they become cancelled + non-billable, running cycles extend by those lessons, and admins can opt to notify.
