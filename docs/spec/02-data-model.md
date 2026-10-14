# 02 · Data model

The source of truth for the schema. **Every schema change starts here**, then becomes a migration in `supabase/migrations/`.

Tags: 🟩 MVP (M0–M7) · 🟨 v2 (M8–M13) · ⬜ Later (M14–M18). The milestone that creates each table is given as `[M#]`.

---

## Conventions

> PROPOSED: child tables repeating `center_id` (kept equal by trigger); `created_at`/`updated_at`; financial rows voided, never deleted; one currency per center; percentages as `*_bp`; `timestamptz`/`date`/`time` usage; Postgres enums; actor columns; naming; extensions. Canvas conventions: `id uuid`, `center_id` on every tenant row, money `*_amount bigint` (tiyin), soft delete `archived_at`, phones E.164.


- **Primary keys:** `id uuid primary key default gen_random_uuid()`.
- **Tenancy:** every tenant row has `center_id uuid not null references centers(id)`. Child tables repeat `center_id` (denormalised) so that RLS never needs a join to find the tenant. A trigger or check keeps it equal to the parent's `center_id`.
- **Timestamps:** `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` (maintained by a trigger) on every mutable table. These are not repeated in the listings below.
- **Soft delete:** `archived_at timestamptz` (null = live) on master data (students, groups, courses, rooms, …). Financial rows are **never** deleted or archived. They are voided (`voided_at`, `void_reason`).
- **Money:** `*_amount bigint` in **minor units** (tiyin for UZS). Never `numeric`, never float. Currency comes from `centers.currency`; one center has one currency.
- **Percentages:** `*_bp integer` in basis points (10000 = 100%). Never float.
- **Phones:** `text` in **E.164** (`+998901234567`), validated with `check (phone ~ '^\+[1-9][0-9]{6,14}$')`.
- **Dates and times:** instants are `timestamptz`. Calendar days are `date`, interpreted in the **branch timezone**. Wall-clock times in schedule rules are `time`.
- **Enums:** Postgres enums for closed sets that code switches on. `text` + check for small sets that may grow per country.
- **Actor columns:** `created_by uuid references profiles(id)` where noted.
- **Naming:** tables are plural snake_case; foreign keys are `<singular>_id`; booleans are `is_*` or `has_*`.
- Extensions: `pgcrypto`, `btree_gist`, `pg_cron`, `citext`.

> PROPOSED (M0): when a child row must belong to the same center as its parent, a **composite foreign key** `(center_id, parent_id) → parent(center_id, id)` enforces it (e.g. `rooms → branches`), instead of a trigger. Parents get `unique (center_id, id)` for this.

> PROPOSED (M0): SQL functions and triggers report business errors as `raise exception '<code>'` (e.g. `last_owner`, `invite_expired`). The list lives in `packages/db` (`DB_ERROR_CODES`) and each code has an i18n message under `errors.db.*`.

## RLS conventions

> PROPOSED: all helper functions and shorthands, "tables with no policies = service role only", students/parents reaching data only via the service role. Canvas: RLS on every table; tenant = `center_id`.


RLS is **enabled on every table**, with no exceptions. Tables with no policies are only reachable by the service role (worker, callbacks); that is intentional.

Helper functions live in schema `private` (`security definer`, `stable`, `set search_path = ''`). They read `memberships` for `auth.uid()`:

| Helper | True when the current user… |
|---|---|
| `private.is_member(center_id)` | has an `active` membership in the center |
| `private.is_owner(center_id)` | is an active owner |
| `private.is_staff_admin(center_id)` | is an active owner or admin |
| `private.has_branch(center_id, branch_id)` | is owner, or admin with `branch_id = any(branch_ids)`, or teacher assigned to that branch |
| `private.has_perm(center_id, flag)` | is owner, or admin whose `permissions` contains `flag` |
| `private.my_membership_id(center_id)` | returns the user's membership id in that center (null if none) |
| `private.teaches_group(group_id)` | is the group's teacher, or a substitute on one of its lessons in the last 30 days or next 30 days |
| `private.is_super_admin()` | `profiles.is_super_admin` (used only in `/admin` server code, never in tenant policies) |
| `private.center_writable(center_id)` | center status is not `read_only` / `cancelled` |

Shorthand used in the RLS lines below:

- **OWN** = `private.is_owner(center_id)`
- **ADM(b)** = `private.is_staff_admin(center_id) and private.has_branch(center_id, branch_id)`
- **PERM(x)** = `private.has_perm(center_id, 'x')`
- **TCH(g)** = `private.teaches_group(group_id)`
- **MBR** = `private.is_member(center_id)`
- **W** = all write policies also require `private.center_writable(center_id)` (read-only centers can still read).

Students and parents have **no Supabase session**. The bot and Mini App access their data through the service role, scoped in code by `telegram_links` (see 17, 21).

Permission flags are listed in `03-roles-permissions.md`.

---

## Enums

> PROPOSED: every enum and value except: `lead_status` (canvas pipeline), `attendance_status` (Present/Late/Absent/Excused), `payroll_status` (draft/approved/paid), `account_kind` (cash/terminal/bank/online), `notification_channel` (telegram/sms/whatsapp/email), cash/card/transfer, and past_due/read_only.


```sql
create type membership_role   as enum ('owner','admin','teacher');
create type membership_status as enum ('invited','active','disabled');
create type center_status     as enum ('trial','active','past_due','read_only','cancelled');
create type group_status      as enum ('forming','active','finished');
create type enrollment_status as enum ('active','frozen','ended');
create type enrollment_end_reason as enum ('completed','dropped','transferred','moved_level');
create type lesson_status     as enum ('scheduled','held','cancelled');
create type attendance_status as enum ('present','late','absent','excused');
create type lead_status       as enum ('new','contacted','trial_scheduled','trial_done','won','lost');
create type lead_source       as enum ('instagram','telegram','walk_in','call','referral','web_form','meta_ads','other');
create type lead_activity_kind as enum ('note','call','status_change','task','message','system');
create type trial_status      as enum ('scheduled','attended','no_show','cancelled');
create type billing_mode      as enum ('lesson_cycle','calendar_month'); -- only lesson_cycle in MVP
create type leave_credit_policy as enum ('ask','credit','no_credit');
create type charge_status     as enum ('open','void');
create type payment_method    as enum ('cash','card','transfer','online');
create type adjustment_kind   as enum ('opening_balance','waive','write_off','correction','refund','promo','unused_lessons');
create type account_kind      as enum ('cash','terminal','bank','online');
create type exam_result_kind  as enum ('diagnostic','mock','official');
create type notification_channel as enum ('telegram','sms','whatsapp','email');
create type outbox_status     as enum ('pending','sending','sent','failed','cancelled','skipped');
create type payroll_status    as enum ('draft','approved','paid');
create type pay_rule_kind     as enum ('fixed_monthly','per_lesson','per_student_lesson','percent_of_payments','percent_of_charges');
create type invoice_status    as enum ('draft','issued','paid','void');
```

---

## Platform

### `profiles` 🟩 [M0]

> PROPOSED (M0): RLS is **own row only**. The `staff_directory` view is not built; staff lists use `memberships.display_name`. Add the view when a feature needs other people's profiles.

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

One row per `auth.users` row, created by trigger on sign-up.
| column | type | notes |
|---|---|---|
| id | uuid pk | `references auth.users(id) on delete cascade` |
| full_name | text not null | |
| phone | text unique not null | E.164; same as the auth phone |
| locale | text not null default 'uz' | `check in ('uz','ru','en')` |
| is_super_admin | boolean not null default false | settable only by the service role |

RLS: select/update own row (`id = auth.uid()`); `is_super_admin` and `phone` are not updatable by the user (column grant). Staff can select profiles of people sharing a center (for names), via the `staff_directory` view.

### `plans` 🟩 [M7]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

Global (not tenant). The uteach subscription plans.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| code | text unique not null | `starter`, `growth`, `pro` |
| name | text not null | |
| student_limit | integer | null = unlimited; counts active students |
| branch_limit | integer | null = unlimited |
| price_amount | bigint not null | per month, in `currency` minor units |
| currency | char(3) not null | |
| features | jsonb not null default '{}' | feature flags, e.g. `{"payroll":true}` |
| is_public | boolean not null default true | |

RLS: select for `authenticated`; writes by service role only.

> PROPOSED (M7a, as built): also `sort_order smallint`, `archived_at timestamptz`; a hidden `trial` row holds the
> trial limits (centers with `plan_id` null use it).

### `platform_settings` 🟩 [M7]

> PROPOSED (M7a): uteach-wide settings. `key text pk`, `value jsonb not null default '{}'`, `updated_at`.
> `payment_instructions` = `{uz, ru, en}` text for the Subscription page. RLS: select for `authenticated`;
> writes by the service role only.

### `centers` 🟩 [M0]

> PROPOSED (M0): the M0 migration creates only the columns M0 uses: `id, name, slug, country_code, currency, default_locale, timezone, status, trial_ends_at, settings, archived_at`. The others arrive with the milestone that needs them: `attendance_edit_hours`, `absence_alert_delay_min` (M2); `rounding_unit_amount`, `billing_day`, `payment_due_days` (M3); `reminder_every_days`, `quiet_hours_*` (M4); `plan_id`, `past_due_since` (M7); `logo_path` (M1 wizard).

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Exception: the 48 h edit window and 10 min absence delay values come from the canvas.

> ✅ CONFIRMED by owner (2026-10-10): defaults 1 000 UZS rounding, due in 10 days, reminders every 3 days, quiet hours 21:00–08:00. Billing is per lesson cycle (open question 2, decided).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text not null | |
| slug | citext unique not null | public page / links |
| country_code | char(2) not null default 'UZ' | |
| currency | char(3) not null default 'UZS' | immutable after the first charge |
| default_locale | text not null default 'uz' | |
| timezone | text not null default 'Asia/Tashkent' | default for new branches; IANA name |
| status | center_status not null default 'trial' | |
| plan_id | uuid references plans | null during trial = trial limits |
| trial_ends_at | timestamptz | created_at + 14 days |
| past_due_since | timestamptz | |
| paid_until | date | PROPOSED (M7 plan): last day covered by a paid uteach invoice; an `active` center past it becomes `past_due` |
| rounding_unit_amount | bigint not null default 100000 | charges round to this (100000 tiyin = 1 000 UZS) |
| billing_mode | billing_mode not null default 'lesson_cycle' | ✅ confirmed default; `calendar_month` not built in MVP |
| leave_credit_policy | leave_credit_policy not null default 'ask' | ✅ center decides what happens to unused lessons when a student leaves mid-cycle (see 15) |
| payment_due_days | smallint not null default 10 | due_date = cycle start + N days |
| reminder_every_days | smallint not null default 3 | overdue reminder cadence |
| quiet_hours_start | time not null default '21:00' | no Telegram/SMS sends between start and end (center tz) |
| quiet_hours_end | time not null default '08:00' | |
| attendance_edit_hours | smallint not null default 48 | teacher edit window |
| absence_alert_delay_min | smallint not null default 10 | |
| late_alert_enabled | boolean not null default false | PROPOSED (M2): late marks also alert (14) |
| logo_path | text | storage `center-assets/{center_id}/…` |
| settings | jsonb not null default '{}' | non-critical UI settings only; anything logic depends on gets a real column |
| archived_at | timestamptz | |

RLS: select **MBR**; update **OWN** (W) except `status`, `plan_id`, `trial_ends_at`, `past_due_since`, `paid_until` (service role only).

> PROPOSED (M7 plan): read-only is enforced by the trigger `private.guard_center_writes` on every table with a
> `center_id` (most writes go through `security definer` RPCs, which RLS alone doesn't stop). It raises
> `center_read_only` for a `read_only` or `cancelled` center unless the writer is the platform (`service_role`,
> `postgres` for pg_cron jobs, `uteach_worker` for the outbox). A pgTAP check fails if a tenant table lacks it. Insert via the `create_center()` RPC only (creates center + owner membership + first branch atomically).

> PROPOSED (M3 plan): M3 adds `rounding_unit_amount`, `billing_mode` (only `lesson_cycle` accepted),
> `leave_credit_policy` and `payment_due_days`; `reminder_every_days` comes with reminders in M4 and
> `billing_day` only with calendar-month billing. `currency` becomes immutable once the center has a charge
> (trigger).

> PROPOSED (M2 plan): M2 adds `attendance_edit_hours` (1–720), `absence_alert_delay_min` (0–240),
> `late_alert_enabled`, and `quiet_hours_start` / `quiet_hours_end` (moved here from M4, because enqueue applies
> quiet hours). Equal start and end mean no quiet hours.

> PROPOSED (M4 plan): M4 adds `reminder_every_days` (1–30, default 3), `due_soon_reminder_enabled boolean not
> null default true`, `sms_enabled boolean not null default false` and `sms_monthly_cap integer not null default
> 0` (0 = no SMS; counted from `notification_outbox` rows with channel `sms` sent this month, center tz). Owners
> update them like the M2/M3 settings. The bot deep link is derived from `slug`, not stored.

### `branches` 🟩 [M0]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| name | text not null | unique (center_id, name) where archived_at is null |
| address | text | |
| phone | text | E.164 |
| timezone | text not null | IANA; **all schedule logic for this branch uses it** |
| archived_at | timestamptz | |

RLS: select **MBR**; insert/update **OWN** (W).

> PROPOSED (M3 plan): `code text not null`, 2–6 uppercase letters/digits, `unique (center_id, code)`, used in
> receipt numbers `{code}-{YYYY}-{000123}`. The migration fills it from the branch name (initials, de-duplicated
> with a digit); new branches get a suggestion the owner can edit.

### `rooms` 🟩 [M0]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, branch_id | uuid fk | |
| name | text not null | unique (branch_id, name) where archived_at is null |
| capacity | smallint | |
| archived_at | timestamptz | |

RLS: select **MBR**; write **ADM(branch_id)** and PERM(settings), or OWN (W).

### `memberships` 🟩 [M0]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: hashed invite tokens with 7-day expiry, `branch_ids` array, admins with `staff` managing teachers.

A staff user's role in a center. One row per (center, person).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| profile_id | uuid references profiles | null while `invited` |
| role | membership_role not null | |
| status | membership_status not null default 'invited' | |
| display_name | text not null | name shown before the invite is accepted |
| invited_phone | text | E.164 |
| invite_token_hash | text | sha256 of the one-time token; cleared on accept |
| invite_expires_at | timestamptz | 7 days |
| branch_ids | uuid[] not null default '{}' | admins and teachers: branches in scope. Ignored for owners (all branches). |
| permissions | text[] not null default '{}' | admin flags (see 03); ignored for owner and teacher |
| color | text | timetable color for teachers |

> PROPOSED (M1): `color` is a **palette key** (`violet`, `sky`, `orange`, `green`, `rose`, `amber`, `teal`, `indigo`),
> not a hex value. Each key maps to theme tokens (`--palette-*` in `globals.css`), so the timetable never shows a raw
> color (05-ui). M0 allowed `#rrggbb` but no row used it; the M1 migration swaps the check.

Constraints: unique (center_id, profile_id) where profile_id is not null; at least one active owner per center (deferred trigger); `permissions <@ allowed_flags`.
RLS: select **MBR** (staff see colleagues); insert/update/disable **OWN** (W). An admin with PERM(staff) may manage **teacher** memberships in their branches. No one can change their own role.

> PROPOSED (M0), replacing "select MBR" above: owners and admins see all memberships of the center; **teachers see only their own row**, so they can't read colleagues' permissions (M0 "done when"). Invites are created only by `create_invite()`, activated only by `accept_invite()`. A deferred constraint trigger keeps at least one active owner.

### `platform_invoices` 🟩 [M7]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

uteach billing the center.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| plan_id | uuid fk | |
| number | text unique not null | `UT-2026-000123` |
| period_start, period_end | date not null | |
| amount | bigint not null | |
| currency | char(3) not null | |
| status | invoice_status not null default 'draft' | |
| issued_at, paid_at | timestamptz | |
| payment_note | text | bank transfer reference etc. |

RLS: select **OWN**; writes service role (super-admin) only.

---

## Academic

### `courses` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| name | text not null | "General English", "IELTS" |
| kind | text not null default 'language' | `check in ('language','exam_prep','school_subject','other')` |
| exam_type_id | uuid references exam_types | for exam-prep courses (scores default to it) |
| default_price_amount | bigint | prefilled into new groups' price |
| default_lesson_minutes | smallint | |
| description | text | |
| archived_at | timestamptz | |

RLS: select **MBR**; write PERM(academics) or OWN (W).

> PROPOSED (M1): `default_price_amount` is money, and teachers can read courses, so the column is **not granted**
> to `authenticated`. Staff with `billing` read it through `course_default_prices(center_id)`.

> PROPOSED (M1): `exam_type_id` is added in **M6** together with `exam_types` (the column can't reference a table
> that doesn't exist yet). Course presets of kind `exam_prep` get linked then.

> PROPOSED (M6 plan): added in `m6_exams`. The course form shows it for kind `exam_prep`; "Enter scores"
> defaults to it. There are no seeded course rows to link.

### `levels` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, course_id | uuid fk | |
| name | text not null | "Beginner", "B1", "IELTS 6.0+" |
| sort_order | smallint not null | |
| next_level_id | uuid references levels | for "renews → next level" |
| archived_at | timestamptz | |

RLS: same as courses.

### `groups` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, branch_id | uuid fk | |
| course_id | uuid fk not null | |
| level_id | uuid fk | |
| name | text not null | unique (branch_id, name) where archived_at is null |
| teacher_membership_id | uuid references memberships | main teacher (role teacher or owner/admin who teaches) |
| room_id | uuid references rooms | default room |
| capacity | smallint | warn on over-enrollment; not a hard block |
| status | group_status not null default 'forming' | |
| start_date | date not null | |
| end_date | date | null = open-ended |
| archived_at | timestamptz | |

RLS: select **ADM(branch_id)** or **TCH(id)** or OWN; write PERM(academics) and ADM(branch_id), or OWN (W).
**There is no money on this table.** Price lives in `group_prices`, so teachers (who can read groups) never see it.

### `group_prices` 🟩 [M1]

> PROPOSED: **the entire table**. It is not in the canvas table list. columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

*Added to the canvas list:* keeps money out of `groups` and keeps price history.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, group_id | uuid fk | |
| price_amount | bigint not null | price of **one full cycle** |
| cycle_lessons | smallint not null default 12 | ✅ lessons per cycle, set per group (e.g. 12 or 8); `check (cycle_lessons between 1 and 100)` |
| effective_from | date not null | the price for a cycle = latest row with effective_from ≤ cycle start date |

Unique (group_id, effective_from). RLS: select/write **ADM(branch of group)** with PERM(billing), or OWN. Teachers: none.

### `group_schedule_rules` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

Weekly recurring slots of a group.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, group_id | uuid fk | |
| weekday | smallint not null | ISO 1=Mon … 7=Sun |
| start_time | time not null | branch local wall-clock time |
| duration_minutes | smallint not null | `check > 0 and <= 480` |
| room_id | uuid references rooms | null = group's default room |
| teacher_membership_id | uuid references memberships | null = group's teacher |
| valid_from | date not null | |
| valid_to | date | null = open |

RLS: select like `groups`; write PERM(academics) (W).

> PROPOSED (M1): rules have no `branch_id`; policies find the branch with `private.group_branch(group_id)`
> (security definer, stable). Rules are written only through `save_schedule_rules()`, which regenerates lessons.
> Removing a rule sets `valid_to` (past lessons still point at it) instead of deleting it.

### `lessons` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Exception: the room and teacher exclusion constraints are on the canvas.

Concrete occurrences. Generated from rules, or created ad hoc (makeup / extra).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, branch_id, group_id | uuid fk | |
| rule_id | uuid references group_schedule_rules | null for ad-hoc lessons |
| local_date | date not null | in branch tz; used for idempotency and billing |
| starts_at, ends_at | timestamptz not null | computed from local_date + rule time in branch tz |
| room_id | uuid references rooms | |
| teacher_membership_id | uuid references memberships not null | who actually teaches (substitute overrides) |
| original_teacher_membership_id | uuid | set when substituted |
| status | lesson_status not null default 'scheduled' | `held` is set when attendance is first saved |
| is_makeup | boolean not null default false | |
| makeup_for_lesson_id | uuid references lessons | |
| is_billable | boolean not null default true | cancelled-by-center lessons → false |
| cancel_reason | text | |
| topic | text | entered by the teacher |
| is_manually_edited | boolean not null default false | regeneration never touches edited lessons |

Constraints:
- `unique (rule_id, local_date)`: makes generation idempotent.
- `check (ends_at > starts_at)`.
- **Room conflict:** `exclude using gist (room_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled' and room_id is not null)`.
- **Teacher conflict:** `exclude using gist (teacher_membership_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled')`.

RLS: select **ADM(branch_id)** or teacher_membership_id = my membership or TCH(group_id), or OWN; insert/update PERM(academics) (W). Teachers may update only `topic` (column grant through the `set_lesson_topic` RPC).

> PROPOSED (M1): a `rule_date date` column holds the rule occurrence a lesson came from, and the idempotency key is
> `unique (rule_id, rule_date)` instead of `(rule_id, local_date)`. `local_date` stays the day the lesson actually
> happens. Without this, dragging a Monday lesson to Tuesday would free "Monday" and the next generation would
> create it again. `check ((rule_id is null) = (rule_date is null))`.

> PROPOSED (M1): generation never creates lessons in the past (before today in the branch timezone). Until M2 adds
> `attendance`, "a lesson with no attendance" means `status = 'scheduled'`; M2 adds the attendance check to
> regeneration and holiday cancelling. Lessons change only through RPCs (`generate_lessons`, `move_lesson`,
> `cancel_lesson`, `create_makeup_lesson`, `substitute_teacher`); there is no direct insert/update grant.

### `holidays` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| branch_id | uuid fk | null = all branches |
| date | date not null | |
| name | text not null | |

Unique (center_id, branch_id, date). Generation skips these dates. Adding a holiday cancels already-generated lessons on that date (`is_billable=false`) if they have no attendance, and recalculates the affected charges.
RLS: select **MBR**; write PERM(academics) (W).

### `schedule_conflicts` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

Lessons that generation could not create because of an exclusion violation.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, group_id | uuid fk | |
| rule_id | uuid fk | |
| local_date | date not null | |
| branch_id | uuid fk | PROPOSED (M1): denormalised from the group, so RLS needs no join |
| conflict_kind | text not null | `check in ('room','teacher')` |
| conflicting_lesson_id | uuid references lessons | |
| detected_at | timestamptz not null default now() | |
| resolved_at | timestamptz | |
| resolution | text | `moved`, `skipped`, `room_changed`, … |

Unique (rule_id, local_date) where resolved_at is null.
RLS: select/update PERM(academics) and ADM(branch of group).

---

## People

### `students` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| branch_id | uuid fk not null | home branch |
| full_name | text not null | |
| phone | text | E.164; the student's own phone (optional for kids) |
| birth_date | date | |
| gender | text | `check in ('male','female')` or null |
| school | text | |
| lead_id | uuid references leads | source lead, if converted. PROPOSED (M1): added in **M5** with `leads` |
| external_ref | text | id from imported file |
| archived_at | timestamptz | |

Index: (center_id, phone). The duplicate check uses phone + normalised name.
RLS: select **ADM(branch_id)** or OWN, or teacher where the student has an enrollment in a group they teach (via `private.teaches_student(student_id)`); write PERM(students) and ADM (W). Teachers can't see `phone` (they read through the `group_roster` view, which omits contact fields).

> PROPOSED (M1), replacing the teacher part above: teachers get **no** select on `students` (or `enrollments`),
> because RLS filters rows, not columns, so a teacher could read `phone` through the API. Teachers read rosters
> only through `public.group_roster(group_id)`, a security-definer function that checks `private.teaches_group()`
> and returns names and dates only (no contacts, discounts or prices). `unique (center_id, external_ref)` where not
> null, so imports can match rows. The duplicate check **warns** ("Create anyway"); it doesn't block.

### View `student_overview` 🟩 [M1]

> PROPOSED (M1c): a read-only view for the students list, `with (security_invoker = true)` so the caller's RLS
> applies to every table it reads (teachers see nothing). Columns: the student's own columns plus `is_active`
> (an active or frozen enrollment), `group_ids` and `course_ids` (current groups/courses) and `search_text`
> (name, phone and the guardians' phones). It lets the list filter and paginate on the server without long
> `in (…)` id lists.

### `guardians` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. "Siblings share guardians" is on the canvas; doing it by unique phone per center is proposed.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| full_name | text not null | |
| phone | text not null | E.164; unique (center_id, phone) — this is how siblings share a guardian |
| locale | text | notification language override |
| archived_at | timestamptz | |

RLS: select/write as students (no teacher access).

### `student_guardians` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| center_id | uuid fk | |
| student_id, guardian_id | uuid fk | pk (student_id, guardian_id) |
| relation | text not null default 'parent' | `mother`, `father`, `parent`, `other` |
| is_primary | boolean not null default false | at most one primary per student (partial unique index) |
| receives_notifications | boolean not null default true | |
| receives_billing | boolean not null default true | |

RLS: as students (no teachers).

### `student_notes` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id | uuid fk | |
| body | text not null | |
| is_pinned | boolean not null default false | |
| visible_to_teachers | boolean not null default false | |
| created_by | uuid fk profiles | |

RLS: select ADM or (TCH-of-student and visible_to_teachers); insert ADM or teacher of the student; update/delete only the author (W).

### `telegram_links` 🟩 [M2 table, M4 linking]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: one row per subject; creating the table in M2.

Who a Telegram user is, in which center. One Telegram user can be several subjects (a parent of two kids, or a staff member who is also a parent).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| telegram_user_id | bigint not null | |
| chat_id | bigint not null | private chat id |
| phone | text not null | from the shared contact, E.164 |
| student_id | uuid fk | exactly one of student_id / guardian_id / membership_id |
| guardian_id | uuid fk | |
| membership_id | uuid fk | |
| locale | text not null default 'uz' | |
| linked_at | timestamptz not null default now() | |
| unlinked_at | timestamptz | user blocked the bot or was unlinked |

Check: `num_nonnulls(student_id, guardian_id, membership_id) = 1`. Unique (center_id, telegram_user_id, coalesce(student_id, guardian_id, membership_id)) where unlinked_at is null.
RLS: select ADM (to show "linked ✓"); writes service role (worker) only.

---

## Enrollment

### `enrollments` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id, group_id | uuid fk | |
| status | enrollment_status not null default 'active' | |
| start_date | date not null | first billable day |
| end_date | date | last billable day; set on end/transfer |
| end_reason | enrollment_end_reason | |
| transferred_to_enrollment_id | uuid references enrollments | |
| discount_bp | integer not null default 0 | 0–10000 |
| discount_amount | bigint not null default 0 | fixed discount per cycle; applied after percent |
| discount_reason | text | required if any discount |
| price_override_amount | bigint | replaces group price for this student |

Constraints: one non-ended enrollment per (student_id, group_id) (partial unique index); `end_date >= start_date`.

> PROPOSED (M1): without the `discounts` flag an admin gives at most 10% (`discount_bp ≤ 1000`) and no fixed
> `discount_amount` or `price_override_amount` (both can exceed 10%); a price override also needs `billing`.

> PROPOSED (M1): `status` follows the dates. `end_enrollment` with an end date before today (branch tz) sets `ended`
> at once; a later end date keeps `active` until the nightly `refresh_enrollment_statuses` job. Freezes flip
> `active ↔ frozen` the same way. The billing hook (`private.on_enrollment_change`) is a no-op until M3.
RLS: select ADM(branch of group) or OWN; teachers select through `group_roster` (no discount or price columns); write PERM(students) (W). **Enroll, freeze, transfer and end go through RPCs** that create the first cycle charge, void future cycles and apply unused-lesson credits (see 15).

### `enrollment_freezes` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, enrollment_id | uuid fk | |
| from_date | date not null | |
| to_date | date not null | inclusive |
| reason | text | |
| created_by | uuid fk | |

Exclusion: no overlapping freezes per enrollment (`daterange(from_date, to_date, '[]')`). Lessons in a freeze are not billable for that student, so the cycle pauses (✅ confirmed).
RLS: as enrollments.

### `risk_flags` 🟨 [M12, rules from M2]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: the `overdue_debt` kind.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id | uuid fk | |
| enrollment_id | uuid fk | |
| kind | text not null | `consecutive_absences`, `low_attendance`, `overdue_debt` |
| details | jsonb | e.g. `{"absences":3}` or `{"rate_bp":5500}` |
| detected_at | timestamptz not null default now() | |
| resolved_at | timestamptz | |
| resolved_by | uuid fk profiles | |
| resolution_note | text | |

Unique (enrollment_id, kind) where resolved_at is null.
RLS: select/update ADM(branch).

---

## Leads

### `leads` 🟩 [M5]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Exceptions from the canvas: the status list and "lost needs a reason". Proposed: `won` requires `converted_student_id`; teachers have no access.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| branch_id | uuid fk | |
| full_name | text not null | |
| phone | text | E.164 |
| telegram_username | text | |
| source | lead_source not null | |
| source_detail | text | campaign / ad name / referrer |
| status | lead_status not null default 'new' | |
| goal | text | "IELTS 7.0", "Kids English" |
| target_score | numeric(5,1) | |
| current_level | text | |
| interested_course_id | uuid fk courses | |
| preferred_schedule | text | free text: "evenings, Mon/Wed/Fri" |
| assigned_membership_id | uuid fk memberships | |
| next_follow_up_at | timestamptz | |
| lost_reason_id | uuid fk lost_reasons | **required when status = 'lost'** (check) |
| lost_note | text | |
| converted_student_id | uuid fk students | set when won |
| referral_id | uuid fk referrals | ⬜ M15 |
| utm | jsonb | 🟨 M13 |
| external_id | text | Meta lead id etc.; unique (center_id, source, external_id) |
| archived_at | timestamptz | |

Check: `status <> 'lost' or lost_reason_id is not null`; `status <> 'won' or converted_student_id is not null`.
Index (center_id, phone) for the duplicate check (warn, don't block).
RLS: select/write PERM(leads) and ADM(branch) (W). Teachers: none.

> PROPOSED (M5 plan): `branch_id` not null. `source` defaults to `'other'`. Phone indexed (center_id, phone);
> `lead_duplicates(phone)` (security definer, PERM(leads)) returns matching leads, students and guardians'
> students. Insert and plain-field updates go through RLS with column grants; `status`, `lost_reason_id`,
> `lost_note`, `converted_student_id` and `next_follow_up_at` are written only by `move_lead`,
> `convert_lead`, `merge_leads` and the follow-up trigger. Composite fks keep `branch_id`,
> `interested_course_id`, `assigned_membership_id` and `lost_reason_id` inside the same center. `utm`,
> `external_id` and `referral_id` are added by M13/M15, not M5.

### `lead_activities` 🟩 [M5]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, lead_id | uuid fk | |
| kind | lead_activity_kind not null | |
| body | text | |
| from_status, to_status | lead_status | for status_change |
| due_at | timestamptz | for tasks (follow-ups) |
| done_at | timestamptz | |
| assigned_membership_id | uuid fk | |
| created_by | uuid fk profiles | null for system |

RLS: as leads. Activities are append-only, except that tasks can update `done_at`.

> PROPOSED (M5 plan): written only through `add_lead_activity`, `complete_lead_task` and the lead RPCs (no
> insert/update grants). A call stores its outcome in `body` with `call_outcome` (`reached`, `no_answer`,
> `call_back`). Check: `kind = 'task'` ⇔ `due_at is not null`; `done_at` only on tasks.

### `lead_trials` 🟩 [M5]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, lead_id, lesson_id | uuid fk | |
| status | trial_status not null default 'scheduled' | set from the attendance sheet |
| feedback | text | teacher's note |
| created_by | uuid fk | |

Unique (lead_id, lesson_id).
RLS: ADM with PERM(leads); teachers of the lesson can select (name only, through the attendance sheet view) and set status/feedback.

> PROPOSED (M5 plan): teachers get no grant on `lead_trials`; the name reaches them through
> `attendance_sheet` and they write through `save_attendance` / `save_trial_feedback` (lesson's teacher or
> TCH(group), same edit window as attendance). Partial unique index: one `scheduled` trial per lead.
> Cancelling the lesson sets its scheduled trials `cancelled` (lead back to `contacted`, `system` activity).

### `lost_reasons` 🟩 [M5]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| label | text not null | seeded: price, schedule, location, chose competitor, no response, other |
| sort_order | smallint | |
| archived_at | timestamptz | |

RLS: select MBR; write PERM(settings).

> PROPOSED (M5 plan): adds `system_key text` (`price`, `schedule`, `location`, `competitor`, `no_response`,
> `other`), unique per center; `label` may be null while `system_key` is set (the UI translates the key).
> Seeded by `create_center` and backfilled for existing centers. Archive instead of delete.

---

## Attendance

### `attendance` 🟩 [M2]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Exceptions from the canvas: unique (lesson, student); the 48 h teacher window and admin edits at any time (audited); trial guests on the sheet.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, lesson_id | uuid fk | |
| student_id | uuid fk | |
| lead_trial_id | uuid fk lead_trials | trial guests |
| enrollment_id | uuid fk | the enrollment that made the student expected |
| status | attendance_status not null | |
| late_minutes | smallint | |
| note | text | |
| marked_by | uuid fk profiles not null | |
| marked_at | timestamptz not null default now() | |
| last_edited_by | uuid fk profiles | |
| last_edited_at | timestamptz | |

Checks: `num_nonnulls(student_id, lead_trial_id) = 1`.
Unique: **(lesson_id, student_id)** and (lesson_id, lead_trial_id).
RLS:
- select: ADM(branch) or OWN, or the lesson's teacher, or TCH(group).
- insert: the lesson's teacher (W), or ADM with PERM(attendance).
- update: the lesson's teacher **only while `now() < lesson.ends_at + centers.attendance_edit_hours`**; admins with PERM(attendance) at any time. Admin edits after the window write `audit_log`.
- delete: none (change status instead).

> PROPOSED (M2 plan):
> - Trial guests come in **M5**: until then `student_id` and `enrollment_id` are `not null` and there is no
>   `lead_trial_id`. M5 adds the column (fk `lead_trials`), drops both `not null`s, and adds the `num_nonnulls` check
>   and `unique (lesson_id, lead_trial_id)`.
> - `group_id` is denormalised from the lesson (composite fk `(center_id, group_id, lesson_id)` →
>   `lessons (center_id, group_id, id)`), so RLS and the month matrix need no join. `enrollment_id` is a composite
>   fk to `enrollments`. `late_minutes` is null unless `status = 'late'` (then 1–240).
> - **No direct insert/update grants.** All writes go through `save_attendance(lesson_id, rows jsonb, topic)`
>   (security definer, one transaction): it checks the window rules above, upserts on `(lesson_id, student_id)`,
>   sets the lesson `held` on the first save, saves the topic, writes `audit_log` for admin edits after the window,
>   and enqueues or cancels alerts. Reads for teachers go through `attendance_sheet(lesson_id)` and
>   `attendance_matrix(group_id, from, to)`; `lesson_attendance_stats(lesson_ids)` gives per-lesson counts for lists.
>   Select policy: ADM(branch of group), or TCH(group), or the lesson's teacher.

> PROPOSED (M5 plan): guest rows have `lead_trial_id` set and `student_id`, `enrollment_id` null; the trial's
> lesson must be the row's lesson (composite fk `(center_id, lesson_id, lead_trial_id)` → `lead_trials`).
> `save_attendance` upserts guests on `(lesson_id, lead_trial_id)`; `attendance_matrix`,
> `lesson_attendance_stats`, rates, billing (`charge_cycles`) and absence alerts ignore guest rows.

---

## Billing

### `charges` 🟩 [M3]

> ✅ CONFIRMED by owner (2026-10-10): one charge per enrollment per **lesson cycle**, prepaid; cycle length per group.

> PROPOSED: columns, types, defaults, constraints, RLS policies, the computed (not stored) cycle end, `is_manual`, `calc`, void-and-reissue instead of edits.

One row per enrollment per billing cycle (see 15).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id, enrollment_id | uuid fk | |
| cycle_no | integer not null | 1, 2, 3 … per enrollment |
| cycle_start_date | date not null | date of the cycle's first billable lesson |
| cycle_lessons | smallint not null | N for this cycle, copied from `group_prices` at creation |
| due_date | date not null | `cycle_start_date + centers.payment_due_days` |
| price_amount | bigint not null | full-cycle price used |
| discount_amount | bigint not null default 0 | total discount applied (percent + fixed) |
| amount | bigint not null | final, rounded; `check (amount >= 0)` |
| status | charge_status not null default 'open' | |
| is_manual | boolean not null default false | one-off fees outside the cycle logic |
| calc | jsonb not null | inputs and steps, so the number can be explained on screen |
| voided_at | timestamptz | |
| void_reason | text | |

Unique (enrollment_id, cycle_no) where status = 'open'.
The cycle's end date and lessons used are **computed** in the view `charge_cycles` (security_invoker), never stored.
RLS: select ADM(branch of student) with PERM(billing), or OWN; writes through RPCs only (`enroll`, `generate_cycle_charges`, `void_charge`) (W). **Teachers: none.**

### `payments` 🟩 [M3]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: receipt number format, voids instead of deletes, teachers have no access.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, branch_id, student_id | uuid fk | |
| account_id | uuid fk accounts not null | where the money went |
| amount | bigint not null | `check (amount > 0)` |
| method | payment_method not null | |
| paid_at | timestamptz not null default now() | |
| receipt_no | text not null | `{branch_code}-{year}-{seq}`; unique (center_id, receipt_no) |
| receipt_path | text | storage `receipts/{center_id}/…pdf` |
| payer_name | text | e.g. guardian name |
| note | text | |
| received_by | uuid fk profiles | null for online |
| payment_intent_id | uuid fk payment_intents | 🟨 online payments |
| voided_at | timestamptz | |
| voided_by | uuid fk | |
| void_reason | text | required when voided |

RLS: select PERM(billing) and ADM(branch); insert PERM(payments) and ADM(branch) (W); void PERM(void) only; never delete. **Teachers: none.**

### `balance_adjustments` 🟩 [M3]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: the sign convention (positive = in the student's favour).

Signed corrections. **Positive = in the student's favour** (reduces debt).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id | uuid fk | |
| kind | adjustment_kind not null | |
| amount | bigint not null | signed, `<> 0` |
| charge_id | uuid fk | for waive/write-off of a specific charge |
| reason | text not null | |
| created_by | uuid fk | |
| voided_at | timestamptz | |

`opening_balance` comes from import: negative = an existing debt, positive = prepaid.
RLS: select as payments; insert PERM(adjustments) (W).

### `accounts` 🟩 [M3]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: creating default accounts already in M3 (the canvas puts Accounts in M11).

Where money sits. MVP creates one cash account per branch plus a default terminal account. Full finance comes in M11.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| branch_id | uuid fk | null = center-level (bank, online) |
| kind | account_kind not null | |
| name | text not null | |
| provider | text | `payme`, `click`, `uzum` for online |
| is_active | boolean not null default true | |

RLS: select PERM(billing); write OWN or PERM(finance).

> PROPOSED (M3 plan): created by the M3 migration for existing branches and by a trigger for new ones (cash +
> terminal per branch, one center-level bank account); no accounts UI until M11. Admins with `payments` may read
> accounts too (to pick one when recording a payment): select is `PERM(billing) or PERM(payments)`.

### `receipt_sequences` 🟩 [M3]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| center_id, branch_id | uuid | pk (branch_id, year) |
| year | smallint | |
| next_no | integer not null default 1 | |

Read and incremented only inside the `next_receipt_no(branch_id)` function (`update … returning`, so concurrent payments can't share a number). No direct RLS access.

### Views (billing) 🟩 [M3]

> PROPOSED: all three views; FIFO computed in views with no stored allocation; aging buckets. Canvas: FIFO oldest due date, aging.

- `student_balances(student_id, center_id, charged, paid, adjusted, balance)`: `balance = paid + adjusted − charged`. Negative = debt. Only open charges and non-voided payments/adjustments count.
- `charge_debts(charge_id, student_id, due_date, amount, covered, outstanding, days_overdue)`: **FIFO**. A student's credits (payments + positive adjustments) are applied to their open charges ordered by `due_date, created_at`; the remainder is outstanding. Computed with window sums; there is no stored allocation.
- `debtors(student_id, branch_id, debt, oldest_due_date, max_days_overdue, aging_bucket)`: buckets are `0-30`, `31-60`, `61-90`, `90+`.
All three views are `security_invoker = true`, so the RLS of the underlying tables applies.

> PROPOSED (M3a, as built):
> - `charges`: `cycle_no` / `cycle_lessons` / `enrollment_id` are null only for `is_manual` charges;
>   `reissue_of_id` links a void-and-reissue; `voided_by`. The unique key is `(enrollment_id, cycle_no)` over open,
>   non-manual charges, so a reissue takes the voided slot.
> - `balance_adjustments`: `enrollment_id` (unused-lesson credits), `details jsonb` (what the system computed);
>   `reason` is required except for `unused_lessons` and `opening_balance`.
> - `accounts.name` null = the translated default name of its kind.
> - `branches.code` defaults to `''`, which the trigger replaces with a suggestion.
> - A guard trigger on `charges`, `payments` and `balance_adjustments` refuses deletes, truncates and any
>   update other than voiding (and `payments.receipt_path`), even for the service role.
> - `charge_debts` lists **debt items**: open charges and negative adjustments (e.g. an imported opening debt,
>   due the day it was recorded), FIFO-covered by payments and positive adjustments. `debtors` also lists
>   students whose debt isn't due yet (`is_overdue = false`), bucket `0-30`.
> - `student_balances`, `charge_debts` and `debtors` show rows only to staff with `billing`.

> PROPOSED (M3 plan): `charge_cycles` is a fourth view (`security_invoker`): per open cycle charge,
> `first_lesson_date`, `lessons_used` (billable lessons up to today, branch tz), `lessons_left`,
> `expected_last_date` (from generated lessons; null if not generated yet). Billable lessons are numbered by
> `private.billable_lessons(enrollment_id)`; cycle k covers the lessons after the previous cycles' `cycle_lessons`.
> A pure TS mirror (`cycleWindows`) and shared fixtures keep the two in step (parity test, as with
> `expandRules`).

### `refunds` 🟨 [M8]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, payment_id, student_id | uuid fk | |
| amount | bigint not null | ≤ remaining refundable amount of the payment |
| account_id | uuid fk | money out of |
| provider_transaction_id | uuid fk | for online refunds |
| reason | text not null | |
| created_by | uuid fk | |

A refund also creates a `balance_adjustments(kind='refund', amount = −refund)`, so the balance goes down by the refund.
RLS: PERM(refunds).

### `promo_codes` 🟨 [M8]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| code | citext not null | unique (center_id, code) |
| discount_bp | integer | one of bp / amount |
| discount_amount | bigint | |
| applies_months | smallint not null default 1 | |
| valid_from, valid_to | date | |
| max_uses | integer | |
| used_count | integer not null default 0 | |
| course_id | uuid fk | optional restriction |
| archived_at | timestamptz | |

RLS: PERM(discounts).

### `payment_provider_configs` 🟨 [M8]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: secrets referenced in Vault (Vault itself is on the canvas).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| provider | text not null | `payme`, `click`, `uzum`; unique (center_id, provider) |
| merchant_id | text not null | |
| service_id | text | Click |
| secret_ref | uuid not null | Supabase **Vault** secret id; never stored in plaintext |
| account_id | uuid fk accounts | where online payments land |
| is_enabled | boolean not null default false | |
| is_test | boolean not null default true | |

RLS: select OWN (without secret_ref, via a view); write OWN through an RPC that writes to Vault.

### `payment_intents` 🟨 [M8]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

A pay link or pay code.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id | uuid fk | |
| amount | bigint not null | |
| pay_code | text not null | short numeric code for paying by code in Payme/Click; unique (center_id, pay_code) |
| provider | text | null = any enabled provider |
| status | text not null default 'pending' | `pending`, `paid`, `cancelled`, `expired` |
| expires_at | timestamptz | |
| created_by | uuid fk | null = created from bot/Mini App |
| paid_payment_id | uuid fk payments | |

RLS: select/insert PERM(payments); bot and Mini App use the service role.

### `provider_transactions` 🟨 [M8]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

Raw provider state machine (Payme CreateTransaction/Perform/Cancel; Click Prepare/Complete; Uzum).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| provider | text not null | |
| provider_txn_id | text not null | unique (provider, provider_txn_id) — idempotency |
| payment_intent_id | uuid fk | |
| amount | bigint not null | |
| state | text not null | provider-specific state code |
| created_time, perform_time, cancel_time | timestamptz | |
| cancel_reason | integer | |
| raw | jsonb not null | last request/response |
| payment_id | uuid fk payments | set on perform |

RLS: select OWN (support); writes service role only.

---

## Exams

### `exam_types` 🟩 [M6]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: global presets as rows with `center_id` null.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | **null = global preset** (IELTS, SAT, CEFR, Milliy sertifikat) |
| code | text not null | unique (coalesce(center_id, zero uuid), code) |
| name | text not null | |
| sections | jsonb not null | `[{key:"listening",label:{uz,ru,en},min:0,max:9,step:0.5}, …]` |
| total_rule | text not null | `ielts_band` (avg rounded to 0.5, IELTS rule), `sum`, `average`, `none` |
| total_min, total_max | numeric(6,1) | |
| archived_at | timestamptz | |

RLS: select MBR or `center_id is null`; write PERM(academics) for own center rows only. Presets are read-only.

> PROPOSED (M6 plan): adds `meta jsonb` (display-only: CEFR levels, Milliy grades). `code` is `ielts`, `sat`,
> `cefr`, `milliy` for presets. `total_min`/`total_max` are filled for every type. Once a result exists,
> `sections` and `total_rule` can't change (trigger, `exam_type_in_use`); name and `archived_at` can. Preset
> rows get no write grant.

### `exam_results` 🟩 [M6]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id, exam_type_id | uuid fk | |
| group_id | uuid fk | context; null for official results |
| kind | exam_result_kind not null | |
| taken_on | date not null | |
| section_scores | jsonb not null | `{"listening":6.5,"reading":7,…}`; validated against exam_types.sections |
| total_score | numeric(6,1) | computed by total_rule (in code + DB trigger) |
| certificate_path | text | official results |
| note | text | |
| entered_by | uuid fk profiles | |

Unique (student_id, exam_type_id, group_id, taken_on, kind) (re-entry updates the same row).
RLS: select ADM or OWN or TCH(group_id) / teacher of the student; insert/update ADM, or the teacher of group_id (W).

> PROPOSED (M6 plan): unique key uses `nulls not distinct`. Written only through `save_group_scores`,
> `save_official_result` and `delete_exam_result` (no direct write grant). Trigger `exam_results_check`:
> section keys must exist on the type, values within min–max and on the step (`exam_score_invalid`), at least
> one section; `total_score` = total rule when every section has a value, else null. `kind = 'official'`
> needs `group_id` null; mock/diagnostic need a group. Admin scope = the group's (or the student's) branch.

### `student_targets` 🟩 [M6]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, student_id, exam_type_id | uuid fk | unique (student_id, exam_type_id) |
| target_total | numeric(6,1) | |
| target_sections | jsonb | |
| exam_date | date | planned official exam |
| baseline_total | numeric(6,1) | first diagnostic, for "uplift" |

RLS: as exam_results.

> PROPOSED (M6 plan): written through `set_student_target` (upsert by student + type); `convert_lead` writes
> one when the course has an exam type and the lead has `target_score`. `baseline_total` stays optional:
> without it the baseline is the first diagnostic, then the first result.

---

## Notifications

### `notification_templates` 🟩 [M2 table + seed, M4 editing]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | **null = system default**; a center row overrides it |
| key | text not null | `absence_alert`, `payment_received`, `payment_reminder`, `lesson_cancelled`, `lesson_moved`, `score_posted`, `charge_created`, `broadcast`, … |
| channel | notification_channel not null | |
| locale | text not null | |
| body | text not null | ICU message with named placeholders `{student}`, `{amount}`, … |
| sms_provider_template_id | text | Eskiz requires pre-approved templates |
| is_enabled | boolean not null default true | |

Unique (coalesce(center_id, zero uuid), key, channel, locale).
RLS: select MBR + system rows; write PERM(settings) for own rows.

> PROPOSED (M4 plan): M4 seeds Telegram rows (uz/ru/en) for `charge_created`, `payment_reminder`,
> `payment_due_soon`, `broadcast`, and the staff keys `substitute_assigned` and `schedule_conflict`, and SMS rows
> for `absence_alert`, `payment_reminder` and `lesson_cancelled` with `sms_provider_template_id` null. A row
> without an Eskiz id is never sent by SMS. Centers edit their own override rows from Settings →
> Notifications; "Reset to default" deletes the override, so the system row applies again.

### `notification_outbox` 🟩 [M2 enqueue, M4 send]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: the dedupe key formats, channel resolved at send time, max 5 attempts.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| channel | notification_channel | null until the sender resolves it (see 17); set for SMS fallback rows and explicit-channel broadcasts |
| template_key | text not null | |
| locale | text not null | |
| payload | jsonb not null | placeholder values |
| telegram_chat_id | bigint | |
| phone | text | for SMS |
| student_id, guardian_id, membership_id | uuid | the recipient subject (for history and analytics) |
| dedupe_key | text | unique (center_id, dedupe_key) where not null; e.g. `absence:{lesson}:{student}:{guardian}` |
| status | outbox_status not null default 'pending' | |
| send_after | timestamptz not null default now() | delays and quiet hours push this forward |
| attempts | smallint not null default 0 | max 5, exponential backoff |
| last_error | text | |
| locked_at | timestamptz | |
| sent_at | timestamptz | |
| provider_message_id | text | |
| fallback_of_id | uuid references notification_outbox | the SMS row created after Telegram failed |
| broadcast_id | uuid fk broadcasts | |

Index: (status, send_after) where status = 'pending'.
RLS: select ADM (history screens); insert only through `enqueue_notification()` (security definer); update service role only.

> PROPOSED (M2 plan): `broadcast_id` is added with `broadcasts` in M4. Dedupe keys are `{base}:{recipient_id}`
> (recipient = guardian or student id). `enqueue_notification` revives a `cancelled` row with the same key
> (`on conflict … do update … where status = 'cancelled'`); other rows are left alone. A partial index on
> `dedupe_key text_pattern_ops where status = 'pending'` lets RPCs cancel a lesson's pending rows by key prefix.
> Select is **OWN only** in M2: rows have no branch and the payload holds names, so admin access (scoped by the
> recipient student's branch) comes with M4's history screen.
> Templates: select MBR for the center's rows and everyone signed in for system rows; no write grants until M4.

> PROPOSED (M4 plan): `broadcast_id uuid` is added (same-center fk to `broadcasts`). Select widens from OWN to
> ADM scoped by the recipient student's branch (a guardian row follows the guardian's students); staff-alert rows
> (`membership_id`) stay OWN only. The Debtors "last reminder" column reads the latest `sent` row with key
> `payment_reminder` per student. The worker changes rows only through `worker.*` functions (below, under
> `system_heartbeats`); the outbox gets no update grant.

### `broadcasts` 🟩 [M4]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| audience | jsonb not null | `{"branch_ids":[],"group_ids":[],"course_ids":[],"debtors":true,"recipients":"guardians|students|both"}` |
| body | text not null | |
| channel | notification_channel not null default 'telegram' | |
| scheduled_at | timestamptz | null = now |
| status | text not null default 'draft' | `draft`, `queued`, `sent`, `cancelled` |
| recipient_count | integer | |
| created_by | uuid fk | |

RLS: PERM(broadcasts) and ADM(branch).

> PROPOSED (M4 plan): also `body_by_locale jsonb` (optional per-locale texts; `body` is the fallback),
> `delivered_count` / `failed_count` read from the outbox rather than stored, and `created_at`. Broadcasts are
> created and queued only through `create_broadcast()` (security definer): it checks `broadcasts`, limits the
> audience to the caller's branches, expands it to outbox rows (`broadcast:{id}:{recipient}`), and sets
> `recipient_count`. `preview_broadcast()` returns the same count plus how many have no Telegram link. SMS is used
> only when the broadcast chooses it, and never past `sms_monthly_cap`. No deletes; a scheduled broadcast can be
> cancelled, which cancels its pending rows.

### `bot_sessions` 🟩 [M4]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

Global (keyed by Telegram user). Conversation state for grammY.
| column | type | notes |
|---|---|---|
| telegram_user_id | bigint pk | |
| state | jsonb not null default '{}' | |
| active_center_id | uuid | for users linked to several centers |

RLS: enabled, **no policies** (worker only).

---

## Payroll 🟨 [M10]

### `teacher_pay_rules`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, membership_id | uuid fk | |
| kind | pay_rule_kind not null | |
| amount | bigint | fixed_monthly / per_lesson / per_student_lesson |
| rate_bp | integer | percent kinds |
| group_id | uuid fk | scope (null = all) |
| course_id | uuid fk | scope |
| valid_from | date not null | |
| valid_to | date | |

Check: exactly the right one of amount / rate_bp for the kind.
RLS: PERM(payroll); the teacher can select their own rules.

### `payroll_runs`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| branch_id | uuid fk | null = all |
| period_month | date not null | unique (center_id, branch_id, period_month) |
| status | payroll_status not null default 'draft' | |
| approved_by, approved_at | | |
| paid_at | timestamptz | |
| total_amount | bigint | |

### `payroll_items`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, payroll_run_id, membership_id | uuid fk | |
| rule_id | uuid fk | |
| basis | jsonb not null | e.g. `{"lessons":24,"student_lessons":231,"payments_amount":…}` |
| amount | bigint not null | |

### `payroll_adjustments`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, payroll_run_id, membership_id | uuid fk | |
| amount | bigint not null | signed (bonus +, penalty/advance −) |
| reason | text not null | |
| created_by | uuid fk | |

RLS (runs/items/adjustments): PERM(payroll) and ADM; the teacher can select their own items and adjustments in **approved/paid** runs only. Draft runs are editable; approved runs are frozen; `paid` creates `expenses` rows.

---

## Finance 🟨 [M11]

### `expense_categories`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

`id, center_id, name, parent_id, is_system (payroll, refunds), archived_at`. RLS: select PERM(finance); write OWN.

### `expenses`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| branch_id | uuid fk | |
| account_id | uuid fk not null | |
| category_id | uuid fk not null | |
| amount | bigint not null | `> 0` |
| spent_on | date not null | |
| description | text | |
| attachment_path | text | `attachments/{center_id}/…` |
| payroll_run_id | uuid fk | auto-created |
| created_by | uuid fk | |
| voided_at, void_reason | | |

RLS: PERM(finance) and ADM(branch); never delete.

### `account_transfers`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

`id, center_id, from_account_id, to_account_id, amount bigint (>0), transferred_at, note, created_by, voided_at`. Check from ≠ to. RLS: PERM(finance).

### `cash_closings`

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id, account_id | uuid fk | cash accounts only |
| business_date | date not null | unique (account_id, business_date) |
| expected_amount | bigint not null | opening + in − out, computed |
| counted_amount | bigint not null | |
| difference_amount | bigint generated | counted − expected |
| note | text | required if difference ≠ 0 |
| closed_by | uuid fk | |

RLS: PERM(finance) or ADM(branch) with PERM(cash_closing). A closing locks that day: payments and expenses with that date on that account can no longer be voided except by the owner.

### View `account_balances`

> PROPOSED: the whole view.

`account_id, balance = payments − refunds − expenses ± transfers` (security_invoker).

---

## Learning ⬜ [M14]

> PROPOSED: every column and rule in these five tables. The canvas only lists their names.


- `homework`: `id, center_id, group_id, lesson_id, title, body, attachments jsonb, due_at, max_score numeric, created_by`. RLS: TCH(group), ADM.
- `homework_submissions`: `id, center_id, homework_id, student_id, text, attachments jsonb (audio allowed), submitted_at, score numeric, feedback, graded_by, graded_at`. Unique (homework_id, student_id). RLS: TCH, ADM; students via service role.
- `materials`: `id, center_id, course_id | level_id | group_id (exactly one), title, kind (file, link, video), path_or_url, created_by, archived_at`.
- `progress_reports`: `id, center_id, student_id, period_month, pdf_path, data jsonb, generated_at, sent_at`. Unique (student_id, period_month).
- `report_comments`: `id, center_id, progress_report_id, membership_id, body`.

## Growth ⬜ [M15–M16]

> PROPOSED: every column and rule in these six tables. The canvas only lists their names.


- `referral_codes`: `id, center_id, student_id | guardian_id, code citext unique per center, reward_rule jsonb, archived_at`.
- `referrals`: `id, center_id, referral_code_id, lead_id, status (pending, qualified, rewarded, rejected), reward_adjustment_id fk balance_adjustments, rejected_reason`. Anti-abuse: unique lead phone per center; a referrer can't refer their own phone or guardian phones.
- `saved_audiences`: `id, center_id, name, filter jsonb, created_by`.
- `api_keys`: `id, center_id, name, prefix text, key_hash text, scopes text[], last_used_at, revoked_at, created_by`. Only the hash is stored.
- `webhook_endpoints`: `id, center_id, url, secret_ref (Vault), events text[], is_enabled`.
- `webhook_deliveries`: `id, center_id, endpoint_id, event, payload jsonb, status, attempts, response_code, next_attempt_at, delivered_at`.

## System

### `audit_log` 🟩 [M0 infra, M7 UI]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name. Also proposed: **moving it to M0** (the canvas marks it 🟨); the list of audited tables.

*Note:* the canvas marks this 🟨, but attendance edits (M2) and the super-admin support view (M7) need it in the MVP, so the table and trigger come in M0.
| column | type | notes |
|---|---|---|
| id | bigint generated always as identity pk | |
| center_id | uuid | null for platform actions |
| actor_profile_id | uuid | null for system/cron |
| actor_kind | text not null | `user`, `super_admin`, `system`, `provider` |
| action | text not null | `insert`, `update`, `delete`, `void`, `support_view`, … |
| table_name | text | |
| row_id | uuid | |
| before, after | jsonb | changed columns only |
| at | timestamptz not null default now() | |

Audited tables: payments, charges, balance_adjustments, attendance (edits after the window), enrollments, memberships, group_prices, refunds, expenses, payroll_*, centers.
RLS: select OWN; no update/delete for anyone (append-only, also enforced by trigger).

### `import_jobs` 🟩 [M1]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| center_id | uuid fk | |
| kind | text not null | `students`, `groups`, `enrollments`, `opening_balances`, `leads` |
| file_path | text not null | `imports/{center_id}/…` |
| status | text not null | `uploaded`, `validated`, `failed`, `imported` |
| column_mapping | jsonb | |
| row_count, error_count | integer | |
| errors | jsonb | `[{row, column, message}]` |
| created_by | uuid fk | |
| imported_at | timestamptz | |

RLS: PERM(import).

### `system_heartbeats` 🟩 [M4]

> PROPOSED: columns, types, defaults, constraints, RLS policies and the [M#] tag. The canvas only lists this table's name.

`service text pk, last_beat_at timestamptz, info jsonb`. RLS: none (service role); shown in super-admin.

> PROPOSED (M4 plan): until super-admin exists, owners see the worker's health through `public.worker_health()`
> (security definer, returns only `service` and `last_beat_at`).
> **`worker` schema:** the worker's only way into the database, executable only by the `uteach_worker` role (01):
> `claim_outbox(limit)`, `mark_sent`, `mark_retry(id, error, retry_at)`, `mark_failed(id, error, permanent)`
> (a permanent Telegram error also sets the link's `unlinked_at` and queues the SMS fallback row),
> `recover_stale()`, `beat(service, info)`, `link_contact(telegram_user_id, chat_id, phone, locale)`,
> `unlink_chat(chat_id)`, `get_session` / `set_session`, and the bot's reads (`bot_subjects`, `bot_schedule`,
> `bot_attendance`, `bot_payments`, `bot_scores` (M6c)), each limited to subjects linked to the given Telegram user.
> **`private.otp_sends`** (`phone_hash text, sent_at timestamptz`): the per-phone OTP limit log written by the auth
> SMS hook (10); no grants, rows older than a day are removed by pg_cron.

---

## Relationships at a glance

```
centers ─┬─ branches ─┬─ rooms
         │            └─ groups ─┬─ group_prices
         │                       ├─ group_schedule_rules ─► lessons ─┬─ attendance
         ├─ memberships ─────────┘ (teacher)                         └─ lead_trials
         ├─ courses ─ levels
         ├─ students ─┬─ student_guardians ─ guardians
         │            ├─ enrollments ─┬─ enrollment_freezes
         │            │               └─ charges
         │            ├─ payments, balance_adjustments
         │            └─ exam_results, student_targets
         ├─ leads ─ lead_activities / lead_trials → students (converts to)
         └─ telegram_links, notification_outbox
```

## Open questions (confirm before the milestone that needs them)

1. ✅ **Charges per enrollment.** CONFIRMED (2026-10-10): a student in 2 groups gets 2 separate charges.
2. ✅ **Billing model.** CONFIRMED (2026-10-10): **per lesson cycle from each student's start date** (option B), prepaid, cycle length set per group, freezes pause the cycle, and each center decides what happens to unused lessons when a student leaves. `centers.billing_mode` keeps room for calendar-month billing later. Details in 15.
3. ✅ **Unexcused absences are billed.** CONFIRMED (2026-10-10). Only freezes and center-cancelled lessons don't count.
4. `group_prices` is an addition to the canvas table list (keeps money away from teachers, keeps history).
5. `audit_log` moves from 🟨 to M0 (see note above).
