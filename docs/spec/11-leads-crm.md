# 11 · Leads CRM 🟩 (auto-capture 🟨)

Milestones: **M5** (board, timeline, follow-ups, trials, convert); **M13** (auto-capture: web form endpoint, bot enquiry, Meta lead ads, round-robin).
Tables: `leads`, `lead_activities`, `lead_trials`, `lost_reasons`.
Permission: `leads` flag, branch-scoped.

## Pipeline board (M5)

> PROPOSED: kanban drag, every move logged, `won` only through Convert, trial picker on move, filters, list view, card contents. Statuses and "lost needs a reason" are from the canvas.

Columns: `new → contacted → trial_scheduled → trial_done → won / lost`.
- Kanban with drag between columns. Each move writes a `lead_activities(kind='status_change')`.
- Moving to **lost** requires a reason (from `lost_reasons`) plus an optional note.
- Moving to **won** is only possible through **Convert to student** (below).
- Moving to **trial_scheduled** opens the trial picker.
- Filters: branch, source, assignee, course, "follow-up overdue". A list view is also available, with phone search.
- Card shows: name, phone, source icon, goal, assignee avatar, and the next follow-up (red if overdue).

## Lead detail & timeline (M5)

> PROPOSED: the field list beyond goal / level / schedule, `next_follow_up_at` = earliest open task, "my follow-ups today", duplicate check also against **students**, warn-not-block, merge.

- Fields: name, phone, source + detail, goal (e.g. "IELTS 7.0"), target score, current level, interested course, preferred schedule, branch, assignee.
- Timeline (newest first): notes, calls (with outcome), status changes, tasks, system events.
- **Follow-up tasks**: a due date/time and assignee. Setting one updates `leads.next_follow_up_at` to the earliest open task. "My follow-ups today" appears on the admin dashboard.
- **Duplicate check**: on create and on phone edit, the app looks for existing leads **and students** in the center with the same phone and shows "possible duplicate" with links. It doesn't block, but offers a merge into the existing lead.

## Trial lessons (M5)

> PROPOSED: trial statuses, present/late → `trial_done`, absent → stays `trial_scheduled`, teacher feedback, day-before reminder.

- Pick an upcoming lesson of a group (filtered by course/level) → `lead_trials(status='scheduled')`, and the lead moves to `trial_scheduled`.
- The lead appears as a **guest** row on that lesson's attendance sheet (teacher sees the name and a "trial" badge).
- Marking the guest present or late sets trial `attended` and the lead moves to `trial_done`. Absent sets `no_show` (the lead stays in `trial_scheduled` and the admin reschedules).
- The teacher can add trial feedback ("level B1, recommend group X").
- Optional: if the lead has Telegram linked (M13), a reminder is sent the day before.

## Convert to student (M5)

> PROPOSED: single `convert_lead` RPC, re-using an existing student/guardian, optional first payment. Canvas: creates student + guardian + enrollment, with a prorated charge (now: the first cycle charge, see 15).

One RPC (`convert_lead`) in a single transaction:
1. Creates the **student** (prefilled from the lead), or links an existing student found by the duplicate check.
2. Creates or links the **guardian** (by phone; siblings share).
3. Creates the **enrollment** (group, start date, discount), which creates the **first cycle charge** (see 15).
4. Sets the lead to `won` with `converted_student_id`.
5. Optionally records the first payment right away (opens the payment dialog).

## Lost reasons

> PROPOSED: the seeded reason list and that lost leads stay searchable.

Seeded per center: price, schedule, location, chose competitor, no response, other. Editable in settings. Lost leads stay searchable, and the "re-engage" campaign comes in M15.

## Auto-capture 🟨 (M13)

> PROPOSED: per-center token, rate limit, honeypot, UTM, Meta via page webhook, idempotent by `external_id`, Telegram alert to assignee. The four capture channels are from the canvas.

- **Web form endpoint:** `POST /api/leads/capture/{center_slug}` with a per-center token. It is rate-limited, has a honeypot field, and creates a lead with `source='web_form'` and `utm`.
- **Bot enquiry:** an unknown user in the bot taps "Enquire", gives name + contact + course interest, and a lead is created with `source='telegram'`.
- **Meta lead ads:** a webhook (page subscription) maps form fields to a lead with `source='meta_ads'`. It's idempotent by `external_id`.
- **Round-robin assignment:** new auto-captured leads rotate among admins with the `leads` flag in that branch, and the assignee gets a Telegram staff alert.

## Analytics hooks

> PROPOSED: the metrics listed (conversion rate, time-to-contact). Canvas: funnel by source.

The funnel by source and stage, conversion rate, and time-to-contact are computed in M12 from `lead_activities`.
