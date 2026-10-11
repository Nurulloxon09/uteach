-- M1 · Academic core
-- Spec: docs/spec/02-data-model.md (Academic, People, Enrollment), 12-students-groups.md,
-- 13-schedule.md, 03-roles-permissions.md. Billing (charges) arrives in M3; the enrollment billing hook
-- is a no-op until then. Excel import RPCs and storage buckets come with the M1d migration.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.group_status as enum ('forming', 'active', 'finished');
create type public.enrollment_status as enum ('active', 'frozen', 'ended');
create type public.enrollment_end_reason as enum ('completed', 'dropped', 'transferred', 'moved_level');
create type public.lesson_status as enum ('scheduled', 'held', 'cancelled');

-- ---------------------------------------------------------------------------
-- Changes to M0 tables
-- ---------------------------------------------------------------------------
-- Teacher colors are palette keys mapped to theme tokens, never raw hex (05-ui, 02 memberships).
alter table public.memberships drop constraint memberships_color_check;
alter table public.memberships add constraint memberships_color_check check (
  color is null or color in ('violet', 'sky', 'orange', 'green', 'rose', 'amber', 'teal', 'indigo')
);

-- Targets for composite foreign keys (children must stay in the same center / branch).
alter table public.memberships add constraint memberships_center_id_id_key unique (center_id, id);
alter table public.rooms add constraint rooms_branch_id_id_key unique (branch_id, id);

-- Center logo (onboarding wizard step 1).
alter table public.centers add column logo_path text;
grant update (logo_path) on public.centers to authenticated;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
-- "Today" in a timezone (04-rules §3: never server time or UTC days).
create function private.today_in(p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone p_tz)::date;
$$;

-- Names compared for duplicates and import matching: lower-case, single spaces, one apostrophe style.
-- Mirrors normalizeName() in packages/core.
create function private.normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(translate(trim(coalesce(p_name, '')), 'ʻʼ‘’`', repeat(chr(39), 5)), '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null default 'language' check (kind in ('language', 'exam_prep', 'school_subject', 'other')),
  default_price_amount bigint check (default_price_amount is null or default_price_amount >= 0),
  default_lesson_minutes smallint check (default_lesson_minutes is null or default_lesson_minutes between 15 and 480),
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id)
);

create unique index courses_name_live on public.courses (center_id, lower(name)) where archived_at is null;

create trigger courses_updated_at before update on public.courses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- levels
-- ---------------------------------------------------------------------------
create table public.levels (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  course_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  sort_order smallint not null default 0,
  next_level_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  unique (course_id, id),
  foreign key (center_id, course_id) references public.courses (center_id, id),
  foreign key (center_id, next_level_id) references public.levels (center_id, id),
  check (next_level_id is null or next_level_id <> id)
);

create unique index levels_name_live on public.levels (course_id, lower(name)) where archived_at is null;

create trigger levels_updated_at before update on public.levels
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- groups (no money here: prices live in group_prices, so teachers never see them)
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  course_id uuid not null,
  level_id uuid,
  name text not null check (length(trim(name)) between 1 and 120),
  teacher_membership_id uuid,
  room_id uuid,
  capacity smallint check (capacity is null or capacity > 0),
  status public.group_status not null default 'forming',
  start_date date not null,
  end_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  unique (center_id, branch_id, id),
  foreign key (center_id, branch_id) references public.branches (center_id, id),
  foreign key (center_id, course_id) references public.courses (center_id, id),
  foreign key (course_id, level_id) references public.levels (course_id, id),
  foreign key (center_id, teacher_membership_id) references public.memberships (center_id, id),
  foreign key (branch_id, room_id) references public.rooms (branch_id, id),
  check (end_date is null or end_date >= start_date)
);

create unique index groups_name_live on public.groups (branch_id, lower(name)) where archived_at is null;
create index groups_center on public.groups (center_id, branch_id);
create index groups_teacher on public.groups (teacher_membership_id);

create trigger groups_updated_at before update on public.groups
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- group_prices (price of one full cycle, with history)
-- ---------------------------------------------------------------------------
create table public.group_prices (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  group_id uuid not null,
  price_amount bigint not null check (price_amount >= 0),
  cycle_lessons smallint not null default 12 check (cycle_lessons between 1 and 100),
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, effective_from),
  foreign key (center_id, group_id) references public.groups (center_id, id)
);

create trigger group_prices_updated_at before update on public.group_prices
  for each row execute function private.set_updated_at();
create trigger group_prices_audit after insert or update or delete on public.group_prices
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- group_schedule_rules (weekly slots)
-- ---------------------------------------------------------------------------
create table public.group_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  group_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  duration_minutes smallint not null check (duration_minutes > 0 and duration_minutes <= 480),
  room_id uuid,
  teacher_membership_id uuid,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (center_id, group_id) references public.groups (center_id, id),
  foreign key (center_id, teacher_membership_id) references public.memberships (center_id, id),
  check (valid_to is null or valid_to >= valid_from)
);

create index group_schedule_rules_group on public.group_schedule_rules (group_id);

create trigger group_schedule_rules_updated_at before update on public.group_schedule_rules
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------------------
-- `local_date` is the day the lesson actually happens (branch tz). `rule_date` is the rule occurrence it
-- came from; it stays put when a lesson is moved to another day, so regeneration never re-creates it.
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  group_id uuid not null,
  rule_id uuid,
  rule_date date,
  local_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room_id uuid,
  teacher_membership_id uuid not null,
  original_teacher_membership_id uuid,
  status public.lesson_status not null default 'scheduled',
  is_makeup boolean not null default false,
  makeup_for_lesson_id uuid,
  is_billable boolean not null default true,
  cancel_reason text,
  topic text,
  is_manually_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  unique (rule_id, rule_date),
  foreign key (center_id, branch_id, group_id) references public.groups (center_id, branch_id, id),
  foreign key (group_id, rule_id) references public.group_schedule_rules (group_id, id),
  foreign key (branch_id, room_id) references public.rooms (branch_id, id),
  foreign key (center_id, teacher_membership_id) references public.memberships (center_id, id),
  foreign key (center_id, original_teacher_membership_id) references public.memberships (center_id, id),
  foreign key (center_id, makeup_for_lesson_id) references public.lessons (center_id, id),
  check (ends_at > starts_at),
  check ((rule_id is null) = (rule_date is null)),
  -- The final guard against double-booking (13-schedule): a room or a teacher can't be in two places.
  constraint lessons_room_overlap exclude using gist (
    room_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled' and room_id is not null),
  constraint lessons_teacher_overlap exclude using gist (
    teacher_membership_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);

create index lessons_branch_time on public.lessons (branch_id, starts_at);
create index lessons_group_time on public.lessons (group_id, starts_at);
create index lessons_teacher_time on public.lessons (teacher_membership_id, starts_at);

create trigger lessons_updated_at before update on public.lessons
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- holidays
-- ---------------------------------------------------------------------------
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid,
  date date not null,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (center_id, branch_id, date),
  foreign key (center_id, branch_id) references public.branches (center_id, id)
);

create trigger holidays_updated_at before update on public.holidays
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_conflicts (lessons generation could not create)
-- ---------------------------------------------------------------------------
create table public.schedule_conflicts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  group_id uuid not null,
  rule_id uuid not null,
  local_date date not null,
  conflict_kind text not null check (conflict_kind in ('room', 'teacher')),
  conflicting_lesson_id uuid references public.lessons (id) on delete set null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('resolved', 'moved', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, branch_id, group_id) references public.groups (center_id, branch_id, id),
  foreign key (group_id, rule_id) references public.group_schedule_rules (group_id, id) on delete cascade,
  check ((resolved_at is null) = (resolution is null))
);

create unique index schedule_conflicts_open on public.schedule_conflicts (rule_id, local_date)
  where resolved_at is null;
create index schedule_conflicts_branch on public.schedule_conflicts (branch_id) where resolved_at is null;

create trigger schedule_conflicts_updated_at before update on public.schedule_conflicts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- students, guardians, student_guardians, student_notes
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  birth_date date,
  gender text check (gender is null or gender in ('male', 'female')),
  school text,
  external_ref text check (external_ref is null or length(trim(external_ref)) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  foreign key (center_id, branch_id) references public.branches (center_id, id)
);

create index students_phone on public.students (center_id, phone);
create index students_name on public.students (center_id, private.normalize_name(full_name));
create unique index students_external_ref on public.students (center_id, external_ref)
  where external_ref is not null;

create trigger students_updated_at before update on public.students
  for each row execute function private.set_updated_at();

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  locale text check (locale is null or locale in ('uz', 'ru', 'en')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  -- One guardian per phone per center: this is how siblings share a guardian.
  unique (center_id, phone)
);

create trigger guardians_updated_at before update on public.guardians
  for each row execute function private.set_updated_at();

create table public.student_guardians (
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  guardian_id uuid not null,
  relation text not null default 'parent' check (relation in ('mother', 'father', 'parent', 'other')),
  is_primary boolean not null default false,
  receives_notifications boolean not null default true,
  receives_billing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, guardian_id),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, guardian_id) references public.guardians (center_id, id)
);

create unique index student_guardians_one_primary on public.student_guardians (student_id) where is_primary;
create index student_guardians_guardian on public.student_guardians (guardian_id);

create trigger student_guardians_updated_at before update on public.student_guardians
  for each row execute function private.set_updated_at();

create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 5000),
  is_pinned boolean not null default false,
  visible_to_teachers boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, student_id) references public.students (center_id, id)
);

create index student_notes_student on public.student_notes (student_id);

create trigger student_notes_updated_at before update on public.student_notes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- enrollments, enrollment_freezes
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  group_id uuid not null,
  status public.enrollment_status not null default 'active',
  start_date date not null,
  end_date date,
  end_reason public.enrollment_end_reason,
  transferred_to_enrollment_id uuid,
  discount_bp integer not null default 0 check (discount_bp between 0 and 10000),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  discount_reason text,
  price_override_amount bigint check (price_override_amount is null or price_override_amount >= 0),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, group_id) references public.groups (center_id, id),
  foreign key (center_id, transferred_to_enrollment_id) references public.enrollments (center_id, id),
  check (end_date is null or end_date >= start_date),
  check (status <> 'ended' or end_date is not null),
  check ((end_date is null) = (end_reason is null)),
  check ((discount_bp = 0 and discount_amount = 0) or length(trim(coalesce(discount_reason, ''))) > 0)
);

-- At most one non-ended enrollment of a student in a group.
create unique index enrollments_one_open on public.enrollments (student_id, group_id) where status <> 'ended';
create index enrollments_group on public.enrollments (group_id);

create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function private.set_updated_at();
create trigger enrollments_audit after insert or update or delete on public.enrollments
  for each row execute function private.audit_row();

create table public.enrollment_freezes (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  enrollment_id uuid not null,
  from_date date not null,
  to_date date not null,
  reason text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, enrollment_id) references public.enrollments (center_id, id),
  check (to_date >= from_date),
  constraint enrollment_freezes_no_overlap exclude using gist (
    enrollment_id with =, daterange(from_date, to_date, '[]') with &&
  )
);

create trigger enrollment_freezes_updated_at before update on public.enrollment_freezes
  for each row execute function private.set_updated_at();
create trigger enrollment_freezes_audit after insert or update or delete on public.enrollment_freezes
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- import_jobs (the import flow itself comes with the M1d migration)
-- ---------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  kind text not null check (kind in ('students', 'groups', 'enrollments', 'opening_balances', 'leads')),
  file_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'validated', 'failed', 'imported')),
  column_mapping jsonb,
  row_count integer,
  error_count integer,
  errors jsonb,
  created_by uuid default auth.uid() references public.profiles (id),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (file_path like center_id::text || '/%')
);

create trigger import_jobs_updated_at before update on public.import_jobs
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers for the academic tables (security definer: no recursion through policies)
-- ---------------------------------------------------------------------------
create function private.group_branch(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.branch_id from public.groups g where g.id = p_group_id;
$$;

create function private.student_branch(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.branch_id from public.students s where s.id = p_student_id;
$$;

create function private.enrollment_group(p_enrollment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.group_id from public.enrollments e where e.id = p_enrollment_id;
$$;

-- The caller is the group's teacher, or teaches one of its lessons (e.g. as a substitute) within 30 days.
create function private.teaches_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    join public.memberships m
      on m.center_id = g.center_id and m.profile_id = (select auth.uid()) and m.status = 'active'
    where g.id = p_group_id
      and (
        g.teacher_membership_id = m.id
        or exists (
          select 1 from public.lessons l
          where l.group_id = g.id and l.teacher_membership_id = m.id
            and l.starts_at between now() - interval '30 days' and now() + interval '30 days'
        )
      )
  );
$$;

-- The caller teaches a group the student is (still) enrolled in.
create function private.teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id and e.status <> 'ended' and private.teaches_group(e.group_id)
  );
$$;

-- Owner or admin of the branch (02 shorthand ADM(b)).
create function private.is_branch_admin(p_center_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff_admin(p_center_id) and private.has_branch(p_center_id, p_branch_id);
$$;

-- A teacher may be assigned in a branch if they are active or invited, and are the owner or work there.
create function private.check_teacher(p_center_id uuid, p_branch_id uuid, p_membership_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_membership_id is null then
    return;
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.id = p_membership_id and m.center_id = p_center_id and m.status in ('active', 'invited')
      and (m.role = 'owner' or p_branch_id = any (m.branch_ids))
  ) then
    raise exception 'invalid_teacher';
  end if;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Invariant triggers
-- ---------------------------------------------------------------------------
create function private.groups_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.teacher_membership_id is distinct from old.teacher_membership_id
     or new.branch_id is distinct from old.branch_id then
    perform private.check_teacher(new.center_id, new.branch_id, new.teacher_membership_id);
  end if;
  return new;
end;
$$;

create trigger groups_check before insert or update on public.groups
  for each row execute function private.groups_check();

create function private.rules_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_branch uuid := private.group_branch(new.group_id);
begin
  perform private.check_teacher(new.center_id, v_branch, new.teacher_membership_id);
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.branch_id = v_branch
  ) then
    raise exception 'invalid_room';
  end if;
  return new;
end;
$$;

create trigger group_schedule_rules_check before insert or update on public.group_schedule_rules
  for each row execute function private.rules_check();

create function private.lessons_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.teacher_membership_id is distinct from old.teacher_membership_id then
    perform private.check_teacher(new.center_id, new.branch_id, new.teacher_membership_id);
  end if;
  return new;
end;
$$;

create trigger lessons_check before insert or update on public.lessons
  for each row execute function private.lessons_check();

-- A student is archived only without active or frozen enrollments (the balance check joins in M3).
create function private.students_check_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null and exists (
    select 1 from public.enrollments e where e.student_id = new.id and e.status <> 'ended'
  ) then
    raise exception 'student_has_active_enrollments';
  end if;
  return new;
end;
$$;

create trigger students_check_archive before update of archived_at on public.students
  for each row execute function private.students_check_archive();

-- ---------------------------------------------------------------------------
-- Lesson generation (13-schedule)
-- ---------------------------------------------------------------------------
-- Pure expansion, mirrored by expandRules() in packages/core (parity-tested on shared fixtures).
-- p_rules: [{id, weekday, startTime, durationMinutes, validFrom, validTo}]
create function private.expand_rules(
  p_rules jsonb,
  p_holidays date[],
  p_from date,
  p_to date,
  p_tz text
)
returns table (rule_id uuid, local_date date, starts_at timestamptz, ends_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    d.day,
    (d.day + r."startTime") at time zone p_tz,
    ((d.day + r."startTime") at time zone p_tz) + make_interval(mins => r."durationMinutes")
  from jsonb_to_recordset(p_rules) as r (
    id uuid, weekday int, "startTime" time, "durationMinutes" int, "validFrom" date, "validTo" date
  )
  cross join lateral (
    select g::date as day
    from generate_series(
      greatest(p_from, r."validFrom"),
      least(p_to, coalesce(r."validTo", p_to)),
      interval '1 day'
    ) as g
  ) as d
  where extract(isodow from d.day) = r.weekday
    and not (d.day = any (coalesce(p_holidays, '{}')))
  order by 3, r.id::text collate "C";
$$;

-- Generates the group's lessons for the next 8 weeks (never in the past). Idempotent: an existing
-- (rule, rule_date) is left alone; room/teacher clashes are recorded in schedule_conflicts.
-- Returns the number of lessons created. Callers check permissions.
create function private.generate_group_lessons(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_tz text;
  v_today date;
  v_from date;
  v_to date;
  v_rules jsonb;
  v_holidays date[];
  v_occ record;
  v_teacher uuid;
  v_room uuid;
  v_constraint text;
  v_kind text;
  v_other uuid;
  v_created integer := 0;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found or v_group.archived_at is not null or v_group.status = 'finished' then
    return 0;
  end if;

  select b.timezone into v_tz from public.branches b where b.id = v_group.branch_id;
  v_today := private.today_in(v_tz);
  v_from := greatest(v_today, v_group.start_date);
  v_to := v_today + 55;
  if v_group.end_date is not null then
    v_to := least(v_to, v_group.end_date);
  end if;
  if v_from > v_to then
    return 0;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'weekday', r.weekday, 'startTime', r.start_time,
           'durationMinutes', r.duration_minutes, 'validFrom', r.valid_from, 'validTo', r.valid_to)), '[]')
    into v_rules
  from public.group_schedule_rules r
  where r.group_id = p_group_id;

  select coalesce(array_agg(h.date), '{}') into v_holidays
  from public.holidays h
  where h.center_id = v_group.center_id
    and (h.branch_id is null or h.branch_id = v_group.branch_id)
    and h.date between v_from and v_to;

  for v_occ in
    select x.rule_id, x.local_date, x.starts_at, x.ends_at, r.room_id, r.teacher_membership_id
    from private.expand_rules(v_rules, v_holidays, v_from, v_to, v_tz) x
    join public.group_schedule_rules r on r.id = x.rule_id
  loop
    v_teacher := coalesce(v_occ.teacher_membership_id, v_group.teacher_membership_id);
    v_room := coalesce(v_occ.room_id, v_group.room_id);
    continue when v_teacher is null;
    continue when exists (
      select 1 from public.lessons l where l.rule_id = v_occ.rule_id and l.rule_date = v_occ.local_date
    );
    -- A conflict the staff skipped or resolved by placing the lesson elsewhere stays decided.
    continue when exists (
      select 1 from public.schedule_conflicts c
      where c.rule_id = v_occ.rule_id and c.local_date = v_occ.local_date and c.resolution in ('skipped', 'moved')
    );

    begin
      insert into public.lessons (
        center_id, branch_id, group_id, rule_id, rule_date, local_date, starts_at, ends_at,
        room_id, teacher_membership_id
      )
      values (
        v_group.center_id, v_group.branch_id, v_group.id, v_occ.rule_id, v_occ.local_date, v_occ.local_date,
        v_occ.starts_at, v_occ.ends_at, v_room, v_teacher
      );
      v_created := v_created + 1;
      update public.schedule_conflicts
      set resolved_at = now(), resolution = 'resolved'
      where rule_id = v_occ.rule_id and local_date = v_occ.local_date and resolved_at is null;
    exception when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      v_kind := case when v_constraint = 'lessons_room_overlap' then 'room' else 'teacher' end;
      select l.id into v_other
      from public.lessons l
      where l.status <> 'cancelled'
        and tstzrange(l.starts_at, l.ends_at) && tstzrange(v_occ.starts_at, v_occ.ends_at)
        and case when v_kind = 'room' then l.room_id = v_room else l.teacher_membership_id = v_teacher end
      limit 1;
      insert into public.schedule_conflicts (
        center_id, branch_id, group_id, rule_id, local_date, conflict_kind, conflicting_lesson_id
      )
      values (
        v_group.center_id, v_group.branch_id, v_group.id, v_occ.rule_id, v_occ.local_date, v_kind, v_other
      )
      on conflict (rule_id, local_date) where resolved_at is null
      do update set conflict_kind = excluded.conflict_kind,
                    conflicting_lesson_id = excluded.conflicting_lesson_id,
                    detected_at = now();
    end;
  end loop;

  return v_created;
end;
$$;

-- Deletes the group's future lessons that generation may recreate: from a rule, still scheduled and
-- not edited by hand (13: past lessons and edited ones are never touched). Optionally only some rules.
create function private.clear_future_lessons(p_group_id uuid, p_rule_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.lessons l
  where l.group_id = p_group_id
    and l.rule_id is not null
    and (p_rule_ids is null or l.rule_id = any (p_rule_ids))
    and l.status = 'scheduled'
    and not l.is_manually_edited
    and l.starts_at > now();
  get diagnostics v_count = row_count;

  -- Open conflicts for future days are re-detected by the next generation.
  delete from public.schedule_conflicts c
  where c.group_id = p_group_id
    and c.resolved_at is null
    and (p_rule_ids is null or c.rule_id = any (p_rule_ids))
    and c.local_date >= private.today_in((select b.timezone from public.branches b where b.id = c.branch_id));
  return v_count;
end;
$$;

-- Daily pg_cron job: generate for every live group (idempotent).
create function private.generate_all_lessons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_total integer := 0;
begin
  for v_group in
    select g.id from public.groups g
    join public.centers c on c.id = g.center_id
    where g.archived_at is null and g.status <> 'finished' and c.status not in ('read_only', 'cancelled')
  loop
    v_total := v_total + private.generate_group_lessons(v_group);
  end loop;
  return v_total;
end;
$$;

-- Changing a group's teacher, room, dates or status regenerates its future untouched lessons.
create function private.groups_regenerate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.teacher_membership_id is distinct from old.teacher_membership_id
     or new.room_id is distinct from old.room_id
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.status is distinct from old.status
     or new.archived_at is distinct from old.archived_at then
    perform private.clear_future_lessons(new.id);
    perform private.generate_group_lessons(new.id);
  end if;
  return null;
end;
$$;

create trigger groups_regenerate after update on public.groups
  for each row execute function private.groups_regenerate();

-- ---------------------------------------------------------------------------
-- Enrollment status follows the dates; the billing hook is a no-op until M3
-- ---------------------------------------------------------------------------
-- Called after enroll / freeze / transfer / end. M3 replaces the body: first cycle charge, voiding
-- not-yet-started cycles and unused-lesson credits (15-payments-debts).
create function private.on_enrollment_change(p_enrollment_id uuid, p_action text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  return;
end;
$$;

-- `ended` once the end date has passed; `frozen` while today is inside a freeze; else `active`.
create function private.enrollment_status_for(p_enrollment_id uuid)
returns public.enrollment_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.end_date is not null and e.end_date < private.today_in(b.timezone) then 'ended'
    when exists (
      select 1 from public.enrollment_freezes f
      where f.enrollment_id = e.id and private.today_in(b.timezone) between f.from_date and f.to_date
    ) then 'frozen'
    else 'active'
  end::public.enrollment_status
  from public.enrollments e
  join public.groups g on g.id = e.group_id
  join public.branches b on b.id = g.branch_id
  where e.id = p_enrollment_id;
$$;

-- Hourly pg_cron job (branches are in different timezones; idempotent).
create function private.refresh_enrollment_statuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.enrollments e
  set status = private.enrollment_status_for(e.id)
  where e.status is distinct from private.enrollment_status_for(e.id)
    and e.status <> 'ended';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.courses enable row level security;
alter table public.levels enable row level security;
alter table public.groups enable row level security;
alter table public.group_prices enable row level security;
alter table public.group_schedule_rules enable row level security;
alter table public.lessons enable row level security;
alter table public.holidays enable row level security;
alter table public.schedule_conflicts enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_notes enable row level security;
alter table public.enrollments enable row level security;
alter table public.enrollment_freezes enable row level security;
alter table public.import_jobs enable row level security;

-- courses, levels: members read; `academics` writes. The default price column is not granted (see below).
create policy courses_select on public.courses
  for select to authenticated using (private.is_member(center_id));
create policy courses_insert on public.courses
  for insert to authenticated
  with check (private.has_perm(center_id, 'academics') and private.center_writable(center_id));
create policy courses_update on public.courses
  for update to authenticated
  using (private.has_perm(center_id, 'academics') and private.center_writable(center_id))
  with check (private.has_perm(center_id, 'academics') and private.center_writable(center_id));

create policy levels_select on public.levels
  for select to authenticated using (private.is_member(center_id));
create policy levels_insert on public.levels
  for insert to authenticated
  with check (private.has_perm(center_id, 'academics') and private.center_writable(center_id));
create policy levels_update on public.levels
  for update to authenticated
  using (private.has_perm(center_id, 'academics') and private.center_writable(center_id))
  with check (private.has_perm(center_id, 'academics') and private.center_writable(center_id));

-- groups: branch staff and the group's teachers read; `academics` in the branch edits.
-- New groups come from create_group() (group + price + rules in one transaction).
create policy groups_select on public.groups
  for select to authenticated
  using (private.is_branch_admin(center_id, branch_id) or private.teaches_group(id));
create policy groups_update on public.groups
  for update to authenticated
  using (
    private.has_perm(center_id, 'academics') and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  )
  with check (
    private.has_perm(center_id, 'academics') and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  );

-- group_prices: money. Branch staff with `billing` read; never teachers. Written by RPCs.
create policy group_prices_select on public.group_prices
  for select to authenticated
  using (
    private.has_perm(center_id, 'billing')
    and private.is_branch_admin(center_id, private.group_branch(group_id))
  );

-- group_schedule_rules: read like groups; written by save_schedule_rules().
create policy group_schedule_rules_select on public.group_schedule_rules
  for select to authenticated
  using (
    private.is_branch_admin(center_id, private.group_branch(group_id)) or private.teaches_group(group_id)
  );

-- lessons: branch staff, the lesson's teacher (incl. a substitute) and the group's teachers read.
-- Changed only through the lesson RPCs.
create policy lessons_select on public.lessons
  for select to authenticated
  using (
    private.is_branch_admin(center_id, branch_id)
    or teacher_membership_id = private.my_membership_id(center_id)
    or private.teaches_group(group_id)
  );

-- holidays: members read; written by add_holiday() / remove_holiday().
create policy holidays_select on public.holidays
  for select to authenticated using (private.is_member(center_id));

-- schedule_conflicts: `academics` in the branch.
create policy schedule_conflicts_select on public.schedule_conflicts
  for select to authenticated
  using (private.has_perm(center_id, 'academics') and private.has_branch(center_id, branch_id));

-- students: branch staff read; `students` writes. Teachers read rosters only through group_roster().
create policy students_select on public.students
  for select to authenticated using (private.is_branch_admin(center_id, branch_id));
create policy students_insert on public.students
  for insert to authenticated
  with check (
    private.has_perm(center_id, 'students') and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  );
create policy students_update on public.students
  for update to authenticated
  using (
    private.has_perm(center_id, 'students') and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  )
  with check (
    private.has_perm(center_id, 'students') and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  );

-- guardians: the owner, or branch staff of one of the guardian's students. Written by RPCs.
create policy guardians_select on public.guardians
  for select to authenticated
  using (
    private.is_owner(center_id)
    or exists (
      select 1 from public.student_guardians sg
      join public.students s on s.id = sg.student_id
      where sg.guardian_id = guardians.id and private.is_branch_admin(s.center_id, s.branch_id)
    )
  );

create policy student_guardians_select on public.student_guardians
  for select to authenticated
  using (private.is_branch_admin(center_id, private.student_branch(student_id)));

-- student_notes: staff of the branch; teachers of the student only for notes marked visible to them.
-- Authors edit and delete their own notes.
create policy student_notes_select on public.student_notes
  for select to authenticated
  using (
    private.is_branch_admin(center_id, private.student_branch(student_id))
    or (visible_to_teachers and private.teaches_student(student_id))
  );
create policy student_notes_insert on public.student_notes
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.center_writable(center_id)
    and (
      private.is_branch_admin(center_id, private.student_branch(student_id))
      or private.teaches_student(student_id)
    )
  );
create policy student_notes_update on public.student_notes
  for update to authenticated
  using (created_by = (select auth.uid()) and private.center_writable(center_id))
  with check (created_by = (select auth.uid()) and private.center_writable(center_id));
create policy student_notes_delete on public.student_notes
  for delete to authenticated
  using (created_by = (select auth.uid()) and private.center_writable(center_id));

-- enrollments, freezes: branch staff of the group read. Written by the enrollment RPCs.
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (private.is_branch_admin(center_id, private.group_branch(group_id)));
create policy enrollment_freezes_select on public.enrollment_freezes
  for select to authenticated
  using (
    private.is_branch_admin(center_id, private.group_branch(private.enrollment_group(enrollment_id)))
  );

-- import_jobs: `import`.
create policy import_jobs_select on public.import_jobs
  for select to authenticated using (private.has_perm(center_id, 'import'));
create policy import_jobs_insert on public.import_jobs
  for insert to authenticated
  with check (private.has_perm(center_id, 'import') and private.center_writable(center_id));
create policy import_jobs_update on public.import_jobs
  for update to authenticated
  using (private.has_perm(center_id, 'import') and private.center_writable(center_id))
  with check (private.has_perm(center_id, 'import') and private.center_writable(center_id));

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
revoke all on public.courses, public.levels, public.groups, public.group_prices,
  public.group_schedule_rules, public.lessons, public.holidays, public.schedule_conflicts,
  public.students, public.guardians, public.student_guardians, public.student_notes,
  public.enrollments, public.enrollment_freezes, public.import_jobs
  from anon, authenticated;

grant select on public.levels, public.groups, public.group_prices, public.group_schedule_rules,
  public.lessons, public.holidays, public.schedule_conflicts, public.students, public.guardians,
  public.student_guardians, public.student_notes, public.enrollments, public.enrollment_freezes,
  public.import_jobs
  to authenticated;

-- Courses are readable by teachers, so the default price (money) is left out; staff with `billing`
-- read it through course_default_prices().
grant select (id, center_id, name, kind, default_lesson_minutes, description, archived_at, created_at, updated_at)
  on public.courses to authenticated;
grant insert (center_id, name, kind, default_price_amount, default_lesson_minutes, description)
  on public.courses to authenticated;
grant update (name, kind, default_price_amount, default_lesson_minutes, description, archived_at)
  on public.courses to authenticated;

grant insert (center_id, course_id, name, sort_order, next_level_id) on public.levels to authenticated;
grant update (name, sort_order, next_level_id, archived_at) on public.levels to authenticated;

grant update (name, level_id, teacher_membership_id, room_id, capacity, status, start_date, end_date, archived_at)
  on public.groups to authenticated;

grant insert (center_id, branch_id, full_name, phone, birth_date, gender, school, external_ref)
  on public.students to authenticated;
grant update (branch_id, full_name, phone, birth_date, gender, school, archived_at)
  on public.students to authenticated;

grant insert (center_id, student_id, body, is_pinned, visible_to_teachers) on public.student_notes to authenticated;
grant update (body, is_pinned, visible_to_teachers) on public.student_notes to authenticated;
grant delete on public.student_notes to authenticated;

grant insert (center_id, kind, file_path) on public.import_jobs to authenticated;
grant update (column_mapping, status, row_count, error_count, errors) on public.import_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs: courses and groups
-- ---------------------------------------------------------------------------
create function private.require(p_ok boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create function private.require_writable(p_center_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.center_writable(p_center_id) then
    raise exception 'center_read_only' using errcode = '42501';
  end if;
end;
$$;

grant execute on function private.require(boolean), private.require_writable(uuid) to authenticated, service_role;

-- Course default prices, for staff with `billing` (the column isn't granted to authenticated).
create function public.course_default_prices(p_center_id uuid)
returns table (course_id uuid, default_price_amount bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.default_price_amount
  from public.courses c
  where c.center_id = p_center_id and private.has_perm(p_center_id, 'billing');
$$;

-- Saves a group's weekly rules. p_rules is the full list: [{id?, weekday, startTime, durationMinutes,
-- roomId?, teacherMembershipId?}]. Changed and removed rules drop their future untouched lessons;
-- removed rules end yesterday (or disappear if nothing happened yet). Then lessons are regenerated.
-- Returns {created, conflicts}.
create function private.apply_schedule_rules(p_group_id uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_today date;
  v_rule jsonb;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_old public.group_schedule_rules;
  v_new_teacher uuid;
  v_created integer;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id for update;
  v_today := private.today_in((select b.timezone from public.branches b where b.id = v_group.branch_id));

  for v_rule in select value from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    v_new_teacher := nullif(v_rule ->> 'teacherMembershipId', '')::uuid;
    if coalesce(v_new_teacher, v_group.teacher_membership_id) is null then
      raise exception 'rule_needs_teacher';
    end if;
    v_id := nullif(v_rule ->> 'id', '')::uuid;

    if v_id is null then
      insert into public.group_schedule_rules (
        center_id, group_id, weekday, start_time, duration_minutes, room_id, teacher_membership_id, valid_from
      )
      values (
        v_group.center_id, v_group.id, (v_rule ->> 'weekday')::smallint, (v_rule ->> 'startTime')::time,
        (v_rule ->> 'durationMinutes')::smallint, nullif(v_rule ->> 'roomId', '')::uuid, v_new_teacher,
        v_group.start_date
      )
      returning id into v_id;
    else
      select r.* into v_old from public.group_schedule_rules r where r.id = v_id and r.group_id = p_group_id;
      if not found then
        raise exception 'rule_not_found';
      end if;
      if v_old.weekday <> (v_rule ->> 'weekday')::smallint
         or v_old.start_time <> (v_rule ->> 'startTime')::time
         or v_old.duration_minutes <> (v_rule ->> 'durationMinutes')::smallint
         or v_old.room_id is distinct from nullif(v_rule ->> 'roomId', '')::uuid
         or v_old.teacher_membership_id is distinct from v_new_teacher
         or v_old.valid_to is not null then
        perform private.clear_future_lessons(p_group_id, array[v_id]);
        update public.group_schedule_rules
        set weekday = (v_rule ->> 'weekday')::smallint,
            start_time = (v_rule ->> 'startTime')::time,
            duration_minutes = (v_rule ->> 'durationMinutes')::smallint,
            room_id = nullif(v_rule ->> 'roomId', '')::uuid,
            teacher_membership_id = v_new_teacher,
            valid_to = null
        where id = v_id;
      end if;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  -- Rules no longer in the list.
  for v_old in
    select r.* from public.group_schedule_rules r
    where r.group_id = p_group_id and not (r.id = any (v_keep))
      and (r.valid_to is null or r.valid_to >= v_today)
  loop
    perform private.clear_future_lessons(p_group_id, array[v_old.id]);
    if exists (select 1 from public.lessons l where l.rule_id = v_old.id and l.rule_date < v_today) then
      update public.group_schedule_rules set valid_to = v_today - 1 where id = v_old.id;
    else
      -- Nothing happened yet: detach any hand-edited future lessons and drop the rule.
      update public.lessons set rule_id = null, rule_date = null where rule_id = v_old.id;
      delete from public.group_schedule_rules where id = v_old.id;
    end if;
  end loop;

  v_created := private.generate_group_lessons(p_group_id);
  return jsonb_build_object(
    'created', v_created,
    'conflicts', (select count(*) from public.schedule_conflicts c where c.group_id = p_group_id and c.resolved_at is null)
  );
end;
$$;

create function public.save_schedule_rules(p_group_id uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'academics') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  return private.apply_schedule_rules(p_group_id, p_rules);
end;
$$;

-- Creates a group with its first price (needs `billing` too) and rules, then generates lessons.
create function public.create_group(
  p_branch_id uuid,
  p_course_id uuid,
  p_name text,
  p_start_date date,
  p_level_id uuid default null,
  p_teacher_membership_id uuid default null,
  p_room_id uuid default null,
  p_capacity smallint default null,
  p_end_date date default null,
  p_price_amount bigint default null,
  p_cycle_lessons smallint default null,
  p_rules jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center uuid;
  v_group uuid;
begin
  select b.center_id into v_center from public.branches b where b.id = p_branch_id and b.archived_at is null;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_center);
  perform private.require(private.has_perm(v_center, 'academics') and private.has_branch(v_center, p_branch_id));
  if p_price_amount is not null then
    perform private.require(private.has_perm(v_center, 'billing'));
  end if;

  insert into public.groups (
    center_id, branch_id, course_id, level_id, name, teacher_membership_id, room_id, capacity, start_date, end_date
  )
  values (
    v_center, p_branch_id, p_course_id, p_level_id, trim(p_name), p_teacher_membership_id, p_room_id, p_capacity,
    p_start_date, p_end_date
  )
  returning id into v_group;

  if p_price_amount is not null then
    insert into public.group_prices (center_id, group_id, price_amount, cycle_lessons, effective_from)
    values (v_center, v_group, p_price_amount, coalesce(p_cycle_lessons, 12), p_start_date);
  end if;

  perform private.apply_schedule_rules(v_group, p_rules);
  return v_group;
exception
  when unique_violation then
    raise exception 'duplicate';
end;
$$;

-- Adds (or replaces) the price that applies from p_effective_from (the UI asks "from which month?").
create function public.set_group_price(
  p_group_id uuid,
  p_price_amount bigint,
  p_cycle_lessons smallint,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_id uuid;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'academics') and private.has_perm(v_group.center_id, 'billing')
    and private.has_branch(v_group.center_id, v_group.branch_id)
  );

  insert into public.group_prices (center_id, group_id, price_amount, cycle_lessons, effective_from)
  values (v_group.center_id, p_group_id, p_price_amount, p_cycle_lessons, p_effective_from)
  on conflict (group_id, effective_from)
  do update set price_amount = excluded.price_amount, cycle_lessons = excluded.cycle_lessons
  returning id into v_id;
  return v_id;
end;
$$;

-- Manual generation (the daily job does this for every group).
create function public.generate_lessons(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'academics') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  return private.generate_group_lessons(p_group_id);
end;
$$;

-- Pre-check for the rules editor: clashes the proposed rules would hit in the next 8 weeks, against
-- other lessons (the group's own future untouched lessons would be regenerated, so they don't count).
create function public.check_schedule_conflicts(p_group_id uuid, p_rules jsonb)
returns table (
  local_date date,
  starts_at timestamptz,
  conflict_kind text,
  other_group_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_tz text;
  v_today date;
  v_rules jsonb;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    private.has_perm(v_group.center_id, 'academics') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  select b.timezone into v_tz from public.branches b where b.id = v_group.branch_id;
  v_today := private.today_in(v_tz);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', coalesce(nullif(r ->> 'id', ''), gen_random_uuid()::text),
           'weekday', r -> 'weekday', 'startTime', r -> 'startTime', 'durationMinutes', r -> 'durationMinutes',
           'validFrom', v_group.start_date, 'validTo', null,
           'roomId', r -> 'roomId', 'teacherMembershipId', r -> 'teacherMembershipId')), '[]')
    into v_rules
  from jsonb_array_elements(coalesce(p_rules, '[]')) r;

  return query
  with occ as (
    select x.local_date, x.starts_at, x.ends_at,
           coalesce(nullif(rr ->> 'roomId', '')::uuid, v_group.room_id) as room_id,
           coalesce(nullif(rr ->> 'teacherMembershipId', '')::uuid, v_group.teacher_membership_id) as teacher_id
    from private.expand_rules(
      v_rules,
      (select coalesce(array_agg(h.date), '{}') from public.holidays h
        where h.center_id = v_group.center_id and (h.branch_id is null or h.branch_id = v_group.branch_id)),
      greatest(v_today, v_group.start_date),
      case when v_group.end_date is null then v_today + 55 else least(v_today + 55, v_group.end_date) end,
      v_tz
    ) x
    join jsonb_array_elements(v_rules) rr on (rr ->> 'id')::uuid = x.rule_id
  )
  select o.local_date, o.starts_at, k.kind, og.name
  from occ o
  join public.lessons l
    on l.status <> 'cancelled'
   and tstzrange(l.starts_at, l.ends_at) && tstzrange(o.starts_at, o.ends_at)
   and not (l.group_id = p_group_id and l.rule_id is not null and l.status = 'scheduled'
            and not l.is_manually_edited and l.starts_at > now())
  cross join lateral (
    select 'room'::text as kind where o.room_id is not null and l.room_id = o.room_id
    union all
    select 'teacher' where l.teacher_membership_id = o.teacher_id
  ) k
  join public.groups og on og.id = l.group_id
  order by o.starts_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: single lessons (13: move, cancel, makeup, substitute) and conflicts
-- ---------------------------------------------------------------------------
create function private.lesson_for_edit(p_lesson_id uuid)
returns public.lessons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
begin
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_lesson.center_id);
  perform private.require(
    private.has_perm(v_lesson.center_id, 'academics') and private.has_branch(v_lesson.center_id, v_lesson.branch_id)
  );
  return v_lesson;
end;
$$;

-- Turns exclusion violations into business errors the UI can show.
create function private.raise_lesson_conflict(p_constraint text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_constraint = 'lessons_room_overlap' then
    raise exception 'lesson_conflict_room';
  elsif p_constraint = 'lessons_teacher_overlap' then
    raise exception 'lesson_conflict_teacher';
  else
    raise exception 'lesson_conflict';
  end if;
end;
$$;

-- What a move would clash with (shown before the user confirms; the DB still has the final word).
create function public.lesson_move_conflicts(p_lesson_id uuid, p_starts_at timestamptz, p_room_id uuid default null)
returns table (conflict_kind text, other_group_name text, other_starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_ends timestamptz;
  v_room uuid;
begin
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    private.has_perm(v_lesson.center_id, 'academics') and private.has_branch(v_lesson.center_id, v_lesson.branch_id)
  );
  v_ends := p_starts_at + (v_lesson.ends_at - v_lesson.starts_at);
  v_room := coalesce(p_room_id, v_lesson.room_id);

  return query
  select k.kind, g.name, l.starts_at
  from public.lessons l
  join public.groups g on g.id = l.group_id
  cross join lateral (
    select 'room'::text as kind where v_room is not null and l.room_id = v_room
    union all
    select 'teacher' where l.teacher_membership_id = v_lesson.teacher_membership_id
  ) k
  where l.id <> p_lesson_id and l.status <> 'cancelled'
    and tstzrange(l.starts_at, l.ends_at) && tstzrange(p_starts_at, v_ends)
  order by l.starts_at;
end;
$$;

-- One-off move (drag or the Move dialog). Keeps the duration; never changes the rule.
create function public.move_lesson(p_lesson_id uuid, p_starts_at timestamptz, p_room_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_tz text;
  v_constraint text;
begin
  v_lesson := private.lesson_for_edit(p_lesson_id);
  if v_lesson.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled';
  end if;
  if p_room_id is not null and not exists (
    select 1 from public.rooms r where r.id = p_room_id and r.branch_id = v_lesson.branch_id and r.archived_at is null
  ) then
    raise exception 'invalid_room';
  end if;
  select b.timezone into v_tz from public.branches b where b.id = v_lesson.branch_id;

  begin
    update public.lessons
    set starts_at = p_starts_at,
        ends_at = p_starts_at + (v_lesson.ends_at - v_lesson.starts_at),
        local_date = (p_starts_at at time zone v_tz)::date,
        room_id = coalesce(p_room_id, room_id),
        is_manually_edited = true
    where id = p_lesson_id;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform private.raise_lesson_conflict(v_constraint);
  end;
end;
$$;

-- Cancel: if it's the center's fault the lesson doesn't count (is_billable = false), so each student's
-- cycle extends by one lesson. Notifications are enqueued from M2.
create function public.cancel_lesson(p_lesson_id uuid, p_reason text, p_center_fault boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
begin
  v_lesson := private.lesson_for_edit(p_lesson_id);
  if v_lesson.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled';
  end if;
  update public.lessons
  set status = 'cancelled',
      cancel_reason = nullif(trim(p_reason), ''),
      is_billable = not coalesce(p_center_fault, true),
      is_manually_edited = true
  where id = p_lesson_id;
end;
$$;

-- Makeup or extra lesson. Billable by default unless it replaces a cancelled lesson that still counted
-- (net zero for the students).
create function public.create_makeup_lesson(
  p_group_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_for_lesson_id uuid default null,
  p_room_id uuid default null,
  p_teacher_membership_id uuid default null,
  p_is_billable boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_for public.lessons;
  v_tz text;
  v_id uuid;
  v_constraint text;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'academics') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  if p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
    raise exception 'invalid_duration';
  end if;
  if p_for_lesson_id is not null then
    select l.* into v_for from public.lessons l where l.id = p_for_lesson_id and l.group_id = p_group_id;
    if not found then
      raise exception 'not_found';
    end if;
  end if;
  select b.timezone into v_tz from public.branches b where b.id = v_group.branch_id;

  begin
    insert into public.lessons (
      center_id, branch_id, group_id, local_date, starts_at, ends_at, room_id, teacher_membership_id,
      is_makeup, makeup_for_lesson_id, is_billable, is_manually_edited
    )
    values (
      v_group.center_id, v_group.branch_id, v_group.id, (p_starts_at at time zone v_tz)::date, p_starts_at,
      p_starts_at + make_interval(mins => p_duration_minutes),
      coalesce(p_room_id, v_for.room_id, v_group.room_id),
      coalesce(p_teacher_membership_id, v_for.teacher_membership_id, v_group.teacher_membership_id),
      p_for_lesson_id is not null, p_for_lesson_id,
      coalesce(p_is_billable, case when p_for_lesson_id is null then true else not v_for.is_billable end),
      true
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform private.raise_lesson_conflict(v_constraint);
    when not_null_violation then
      raise exception 'rule_needs_teacher';
  end;
  return v_id;
end;
$$;

-- Substitute teacher for one lesson; choosing the original teacher again undoes it.
create function public.substitute_teacher(p_lesson_id uuid, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_original uuid;
  v_constraint text;
begin
  v_lesson := private.lesson_for_edit(p_lesson_id);
  if v_lesson.status <> 'scheduled' then
    raise exception 'lesson_not_scheduled';
  end if;
  v_original := coalesce(v_lesson.original_teacher_membership_id, v_lesson.teacher_membership_id);

  begin
    update public.lessons
    set teacher_membership_id = p_membership_id,
        original_teacher_membership_id = case when p_membership_id = v_original then null else v_original end,
        is_manually_edited = true
    where id = p_lesson_id;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform private.raise_lesson_conflict(v_constraint);
  end;
end;
$$;

-- The teacher's topic for a lesson (the sheet in M2 uses it).
create function public.set_lesson_topic(p_lesson_id uuid, p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
begin
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_lesson.center_id);
  perform private.require(
    v_lesson.teacher_membership_id = private.my_membership_id(v_lesson.center_id)
    or (private.has_perm(v_lesson.center_id, 'academics') and private.has_branch(v_lesson.center_id, v_lesson.branch_id))
  );
  update public.lessons set topic = nullif(trim(p_topic), '') where id = p_lesson_id;
end;
$$;

-- Conflicts inbox: skip the occurrence, or place it at another time/room ("moved").
create function public.resolve_conflict(
  p_conflict_id uuid,
  p_resolution text,
  p_starts_at timestamptz default null,
  p_room_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict public.schedule_conflicts;
  v_group public.groups;
  v_rule public.group_schedule_rules;
  v_tz text;
  v_lesson uuid;
  v_constraint text;
begin
  select c.* into v_conflict from public.schedule_conflicts c where c.id = p_conflict_id and c.resolved_at is null for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_conflict.center_id);
  perform private.require(
    private.has_perm(v_conflict.center_id, 'academics') and private.has_branch(v_conflict.center_id, v_conflict.branch_id)
  );

  if p_resolution = 'skipped' then
    update public.schedule_conflicts set resolved_at = now(), resolution = 'skipped' where id = p_conflict_id;
    return null;
  elsif p_resolution <> 'moved' or p_starts_at is null then
    raise exception 'invalid_resolution';
  end if;

  select g.* into v_group from public.groups g where g.id = v_conflict.group_id;
  select r.* into v_rule from public.group_schedule_rules r where r.id = v_conflict.rule_id;
  select b.timezone into v_tz from public.branches b where b.id = v_group.branch_id;
  begin
    insert into public.lessons (
      center_id, branch_id, group_id, rule_id, rule_date, local_date, starts_at, ends_at, room_id,
      teacher_membership_id, is_manually_edited
    )
    values (
      v_group.center_id, v_group.branch_id, v_group.id, v_rule.id, v_conflict.local_date,
      (p_starts_at at time zone v_tz)::date, p_starts_at,
      p_starts_at + make_interval(mins => v_rule.duration_minutes),
      coalesce(p_room_id, v_rule.room_id, v_group.room_id),
      coalesce(v_rule.teacher_membership_id, v_group.teacher_membership_id), true
    )
    returning id into v_lesson;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform private.raise_lesson_conflict(v_constraint);
  end;
  update public.schedule_conflicts set resolved_at = now(), resolution = 'moved' where id = p_conflict_id;
  return v_lesson;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: holidays
-- ---------------------------------------------------------------------------
-- Adds a holiday (whole center when p_branch_id is null) and cancels the lessons already generated that
-- day that haven't happened (no attendance): not billable, so running cycles extend. Returns how many.
create function public.add_holiday(p_center_id uuid, p_date date, p_name text, p_branch_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_writable(p_center_id);
  perform private.require(
    private.has_perm(p_center_id, 'academics')
    and (case when p_branch_id is null then private.is_owner(p_center_id)
              else private.has_branch(p_center_id, p_branch_id) end)
  );
  insert into public.holidays (center_id, branch_id, date, name) values (p_center_id, p_branch_id, p_date, trim(p_name));

  update public.lessons l
  set status = 'cancelled', is_billable = false, cancel_reason = 'holiday'
  where l.center_id = p_center_id
    and (p_branch_id is null or l.branch_id = p_branch_id)
    and l.local_date = p_date
    and l.status = 'scheduled';
  get diagnostics v_count = row_count;
  return v_count;
exception
  when unique_violation then
    raise exception 'duplicate';
end;
$$;

-- Removes a holiday: lessons it cancelled come back (unless something else took the slot) and the
-- affected groups regenerate.
create function public.remove_holiday(p_holiday_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holiday public.holidays;
  v_lesson uuid;
  v_group uuid;
begin
  select h.* into v_holiday from public.holidays h where h.id = p_holiday_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_holiday.center_id);
  perform private.require(
    private.has_perm(v_holiday.center_id, 'academics')
    and (case when v_holiday.branch_id is null then private.is_owner(v_holiday.center_id)
              else private.has_branch(v_holiday.center_id, v_holiday.branch_id) end)
  );
  delete from public.holidays where id = p_holiday_id;

  for v_lesson in
    select l.id from public.lessons l
    where l.center_id = v_holiday.center_id
      and (v_holiday.branch_id is null or l.branch_id = v_holiday.branch_id)
      and l.local_date = v_holiday.date and l.status = 'cancelled' and l.cancel_reason = 'holiday'
      and not exists (
        select 1 from public.holidays h
        where h.center_id = l.center_id and h.date = l.local_date and (h.branch_id is null or h.branch_id = l.branch_id)
      )
  loop
    begin
      update public.lessons set status = 'scheduled', is_billable = true, cancel_reason = null where id = v_lesson;
    exception when exclusion_violation then
      null; -- the slot was taken meanwhile; the lesson stays cancelled
    end;
  end loop;

  for v_group in
    select g.id from public.groups g
    where g.center_id = v_holiday.center_id and (v_holiday.branch_id is null or g.branch_id = v_holiday.branch_id)
      and g.archived_at is null
  loop
    perform private.generate_group_lessons(v_group);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: guardians (shared by phone) and rosters
-- ---------------------------------------------------------------------------
-- Adds or updates a student's guardian. A phone that already belongs to a guardian of the center links
-- that guardian (siblings share guardians; their name is kept). Returns {guardianId, linkedExisting}.
create function public.upsert_guardian(
  p_student_id uuid,
  p_full_name text,
  p_phone text,
  p_relation text default 'parent',
  p_is_primary boolean default false,
  p_receives_notifications boolean default true,
  p_receives_billing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_guardian uuid;
  v_existing boolean := true;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_student.center_id);
  perform private.require(
    private.has_perm(v_student.center_id, 'students') and private.has_branch(v_student.center_id, v_student.branch_id)
  );

  select g.id into v_guardian from public.guardians g where g.center_id = v_student.center_id and g.phone = p_phone;
  if not found then
    v_existing := false;
    insert into public.guardians (center_id, full_name, phone)
    values (v_student.center_id, trim(p_full_name), p_phone)
    returning id into v_guardian;
  end if;

  if coalesce(p_is_primary, false) then
    update public.student_guardians set is_primary = false
    where student_id = p_student_id and guardian_id <> v_guardian and is_primary;
  end if;

  insert into public.student_guardians (
    center_id, student_id, guardian_id, relation, is_primary, receives_notifications, receives_billing
  )
  values (
    v_student.center_id, p_student_id, v_guardian, coalesce(p_relation, 'parent'), coalesce(p_is_primary, false),
    coalesce(p_receives_notifications, true), coalesce(p_receives_billing, true)
  )
  on conflict (student_id, guardian_id) do update
  set relation = excluded.relation,
      is_primary = excluded.is_primary,
      receives_notifications = excluded.receives_notifications,
      receives_billing = excluded.receives_billing;

  return jsonb_build_object('guardianId', v_guardian, 'linkedExisting', v_existing);
end;
$$;

-- Edits a guardian's own details (shared by every student they're linked to).
create function public.update_guardian(p_guardian_id uuid, p_full_name text, p_phone text, p_locale text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guardian public.guardians;
begin
  select g.* into v_guardian from public.guardians g where g.id = p_guardian_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_guardian.center_id);
  perform private.require(
    private.has_perm(v_guardian.center_id, 'students')
    and exists (
      select 1 from public.student_guardians sg join public.students s on s.id = sg.student_id
      where sg.guardian_id = p_guardian_id and private.has_branch(s.center_id, s.branch_id)
    )
  );
  update public.guardians
  set full_name = trim(p_full_name), phone = p_phone, locale = p_locale
  where id = p_guardian_id;
exception
  when unique_violation then
    raise exception 'guardian_phone_taken';
end;
$$;

create function public.unlink_guardian(p_student_id uuid, p_guardian_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_student.center_id);
  perform private.require(
    private.has_perm(v_student.center_id, 'students') and private.has_branch(v_student.center_id, v_student.branch_id)
  );
  delete from public.student_guardians where student_id = p_student_id and guardian_id = p_guardian_id;
end;
$$;

-- A group's current roster. Teachers get names and dates only: no contacts, discounts or prices (03).
create function public.group_roster(p_group_id uuid)
returns table (
  enrollment_id uuid,
  student_id uuid,
  full_name text,
  status public.enrollment_status,
  start_date date,
  end_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    private.is_branch_admin(v_group.center_id, v_group.branch_id) or private.teaches_group(p_group_id)
  );
  return query
  select e.id, s.id, s.full_name, e.status, e.start_date, e.end_date
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.group_id = p_group_id and e.status <> 'ended'
  order by private.normalize_name(s.full_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: enroll / freeze / transfer / end (12-students-groups)
-- ---------------------------------------------------------------------------
create function private.group_for_enrollment(p_group_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'students') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  if v_group.archived_at is not null or v_group.status = 'finished' then
    raise exception 'group_closed';
  end if;
  return v_group;
end;
$$;

-- The group's next scheduled lesson day on or after today (branch tz), else its start date.
create function public.next_lesson_date(p_group_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select min(l.local_date) from public.lessons l
      where l.group_id = g.id and l.status = 'scheduled' and l.local_date >= private.today_in(b.timezone)),
    greatest(g.start_date, private.today_in(b.timezone))
  )
  from public.groups g
  join public.branches b on b.id = g.branch_id
  where g.id = p_group_id
    and (private.is_branch_admin(g.center_id, g.branch_id) or private.teaches_group(g.id));
$$;

-- Discounts: admins without `discounts` give at most 10% and no fixed amounts or price overrides (03).
create function private.check_discount(
  p_center_id uuid,
  p_discount_bp integer,
  p_discount_amount bigint,
  p_discount_reason text,
  p_price_override_amount bigint
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (coalesce(p_discount_bp, 0) > 0 or coalesce(p_discount_amount, 0) > 0)
     and length(trim(coalesce(p_discount_reason, ''))) = 0 then
    raise exception 'discount_reason_required';
  end if;
  if not private.has_perm(p_center_id, 'discounts')
     and (coalesce(p_discount_bp, 0) > 1000 or coalesce(p_discount_amount, 0) > 0 or p_price_override_amount is not null) then
    raise exception 'discount_cap';
  end if;
  if p_price_override_amount is not null and not private.has_perm(p_center_id, 'billing') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create function public.enroll(
  p_student_id uuid,
  p_group_id uuid,
  p_start_date date default null,
  p_discount_bp integer default 0,
  p_discount_amount bigint default 0,
  p_discount_reason text default null,
  p_price_override_amount bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_student public.students;
  v_start date;
  v_id uuid;
begin
  v_group := private.group_for_enrollment(p_group_id);
  select s.* into v_student from public.students s where s.id = p_student_id and s.center_id = v_group.center_id;
  if not found or v_student.archived_at is not null then
    raise exception 'not_found';
  end if;
  perform private.check_discount(
    v_group.center_id, p_discount_bp, p_discount_amount, p_discount_reason, p_price_override_amount
  );
  v_start := coalesce(p_start_date, public.next_lesson_date(p_group_id));
  if v_group.end_date is not null and v_start > v_group.end_date then
    raise exception 'enrollment_after_group_end';
  end if;

  insert into public.enrollments (
    center_id, student_id, group_id, start_date, discount_bp, discount_amount, discount_reason, price_override_amount
  )
  values (
    v_group.center_id, p_student_id, p_group_id, v_start, coalesce(p_discount_bp, 0), coalesce(p_discount_amount, 0),
    nullif(trim(p_discount_reason), ''), p_price_override_amount
  )
  returning id into v_id;

  perform private.on_enrollment_change(v_id, 'enroll');
  return v_id;
exception
  when unique_violation then
    raise exception 'enrollment_exists';
end;
$$;

create function private.enrollment_for_edit(p_enrollment_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
  v_group public.groups;
begin
  select e.* into v_enrollment from public.enrollments e where e.id = p_enrollment_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  select g.* into v_group from public.groups g where g.id = v_enrollment.group_id;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'students') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  if v_enrollment.status = 'ended' then
    raise exception 'enrollment_ended';
  end if;
  return v_enrollment;
end;
$$;

create function public.freeze_enrollment(p_enrollment_id uuid, p_from date, p_to date, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
  v_id uuid;
begin
  v_enrollment := private.enrollment_for_edit(p_enrollment_id);
  if p_from < v_enrollment.start_date or (v_enrollment.end_date is not null and p_to > v_enrollment.end_date) then
    raise exception 'freeze_outside_enrollment';
  end if;
  insert into public.enrollment_freezes (center_id, enrollment_id, from_date, to_date, reason)
  values (v_enrollment.center_id, p_enrollment_id, p_from, p_to, nullif(trim(p_reason), ''))
  returning id into v_id;

  update public.enrollments set status = private.enrollment_status_for(id) where id = p_enrollment_id;
  perform private.on_enrollment_change(p_enrollment_id, 'freeze');
  return v_id;
exception
  when exclusion_violation then
    raise exception 'freeze_overlap';
  when check_violation then
    raise exception 'invalid_dates';
end;
$$;

-- Ends the enrollment the day before p_date and enrolls into the target group from p_date, keeping the
-- discount by default (price overrides don't carry over: the new group has its own price).
create function public.transfer_enrollment(
  p_enrollment_id uuid,
  p_target_group_id uuid,
  p_date date,
  p_keep_discount boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.enrollments;
  v_target public.groups;
  v_new uuid;
begin
  v_old := private.enrollment_for_edit(p_enrollment_id);
  v_target := private.group_for_enrollment(p_target_group_id);
  if v_target.id = v_old.group_id then
    raise exception 'transfer_same_group';
  end if;
  if p_date - 1 < v_old.start_date then
    raise exception 'transfer_before_start';
  end if;

  insert into public.enrollments (
    center_id, student_id, group_id, start_date, discount_bp, discount_amount, discount_reason
  )
  values (
    v_old.center_id, v_old.student_id, p_target_group_id, p_date,
    case when p_keep_discount then v_old.discount_bp else 0 end,
    case when p_keep_discount then v_old.discount_amount else 0 end,
    case when p_keep_discount then v_old.discount_reason end
  )
  returning id into v_new;

  update public.enrollments
  set end_date = p_date - 1, end_reason = 'transferred', transferred_to_enrollment_id = v_new
  where id = p_enrollment_id;
  update public.enrollments set status = private.enrollment_status_for(id) where id = p_enrollment_id;

  perform private.on_enrollment_change(p_enrollment_id, 'transfer_out');
  perform private.on_enrollment_change(v_new, 'transfer_in');
  return v_new;
exception
  when unique_violation then
    raise exception 'enrollment_exists';
end;
$$;

-- Sets the last billable day. `moved_level` lets the UI offer the course's next level.
create function public.end_enrollment(
  p_enrollment_id uuid,
  p_end_date date,
  p_reason public.enrollment_end_reason
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
begin
  v_enrollment := private.enrollment_for_edit(p_enrollment_id);
  if p_reason = 'transferred' then
    raise exception 'use_transfer';
  end if;
  if p_end_date < v_enrollment.start_date then
    raise exception 'invalid_dates';
  end if;
  update public.enrollments set end_date = p_end_date, end_reason = p_reason where id = p_enrollment_id;
  update public.enrollments set status = private.enrollment_status_for(id) where id = p_enrollment_id;
  perform private.on_enrollment_change(p_enrollment_id, 'end');
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.course_default_prices(uuid) from public, anon;
revoke all on function public.save_schedule_rules(uuid, jsonb) from public, anon;
revoke all on function public.create_group(uuid, uuid, text, date, uuid, uuid, uuid, smallint, date, bigint, smallint, jsonb) from public, anon;
revoke all on function public.set_group_price(uuid, bigint, smallint, date) from public, anon;
revoke all on function public.generate_lessons(uuid) from public, anon;
revoke all on function public.check_schedule_conflicts(uuid, jsonb) from public, anon;
revoke all on function public.lesson_move_conflicts(uuid, timestamptz, uuid) from public, anon;
revoke all on function public.move_lesson(uuid, timestamptz, uuid) from public, anon;
revoke all on function public.cancel_lesson(uuid, text, boolean) from public, anon;
revoke all on function public.create_makeup_lesson(uuid, timestamptz, integer, uuid, uuid, uuid, boolean) from public, anon;
revoke all on function public.substitute_teacher(uuid, uuid) from public, anon;
revoke all on function public.set_lesson_topic(uuid, text) from public, anon;
revoke all on function public.resolve_conflict(uuid, text, timestamptz, uuid) from public, anon;
revoke all on function public.add_holiday(uuid, date, text, uuid) from public, anon;
revoke all on function public.remove_holiday(uuid) from public, anon;
revoke all on function public.upsert_guardian(uuid, text, text, text, boolean, boolean, boolean) from public, anon;
revoke all on function public.update_guardian(uuid, text, text, text) from public, anon;
revoke all on function public.unlink_guardian(uuid, uuid) from public, anon;
revoke all on function public.group_roster(uuid) from public, anon;
revoke all on function public.next_lesson_date(uuid) from public, anon;
revoke all on function public.enroll(uuid, uuid, date, integer, bigint, text, bigint) from public, anon;
revoke all on function public.freeze_enrollment(uuid, date, date, text) from public, anon;
revoke all on function public.transfer_enrollment(uuid, uuid, date, boolean) from public, anon;
revoke all on function public.end_enrollment(uuid, date, public.enrollment_end_reason) from public, anon;

grant execute on function public.course_default_prices(uuid) to authenticated;
grant execute on function public.save_schedule_rules(uuid, jsonb) to authenticated;
grant execute on function public.create_group(uuid, uuid, text, date, uuid, uuid, uuid, smallint, date, bigint, smallint, jsonb) to authenticated;
grant execute on function public.set_group_price(uuid, bigint, smallint, date) to authenticated;
grant execute on function public.generate_lessons(uuid) to authenticated;
grant execute on function public.check_schedule_conflicts(uuid, jsonb) to authenticated;
grant execute on function public.lesson_move_conflicts(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.move_lesson(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.cancel_lesson(uuid, text, boolean) to authenticated;
grant execute on function public.create_makeup_lesson(uuid, timestamptz, integer, uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.substitute_teacher(uuid, uuid) to authenticated;
grant execute on function public.set_lesson_topic(uuid, text) to authenticated;
grant execute on function public.resolve_conflict(uuid, text, timestamptz, uuid) to authenticated;
grant execute on function public.add_holiday(uuid, date, text, uuid) to authenticated;
grant execute on function public.remove_holiday(uuid) to authenticated;
grant execute on function public.upsert_guardian(uuid, text, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_guardian(uuid, text, text, text) to authenticated;
grant execute on function public.unlink_guardian(uuid, uuid) to authenticated;
grant execute on function public.group_roster(uuid) to authenticated;
grant execute on function public.next_lesson_date(uuid) to authenticated;
grant execute on function public.enroll(uuid, uuid, date, integer, bigint, text, bigint) to authenticated;
grant execute on function public.freeze_enrollment(uuid, date, date, text) to authenticated;
grant execute on function public.transfer_enrollment(uuid, uuid, date, boolean) to authenticated;
grant execute on function public.end_enrollment(uuid, date, public.enrollment_end_reason) to authenticated;

-- Helpers defined above default to EXECUTE for PUBLIC; keep the private schema closed.
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron). Guarded: PGlite (pnpm db:test:lite) has no pg_cron.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('generate_lessons', '0 2 * * *', 'select private.generate_all_lessons()');
    perform cron.schedule('refresh_enrollment_statuses', '5 * * * *', 'select private.refresh_enrollment_statuses()');
  end if;
end;
$$;
