-- M2 · Attendance: the teacher's sheet, the edit window, the month matrix, and alerts into the outbox.
-- Spec: docs/spec/14-attendance.md, 13-schedule.md (notify on cancel/move), 17-telegram-notifications.md
-- (outbox, templates, quiet hours) and 02-data-model.md (Attendance, Notifications, telegram_links).
-- M2 only enqueues notifications; the worker sends them from M4.

create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
create type public.notification_channel as enum ('telegram', 'sms', 'whatsapp', 'email');
create type public.outbox_status as enum ('pending', 'sending', 'sent', 'failed', 'cancelled', 'skipped');

-- ---------------------------------------------------------------------------
-- centers: attendance and notification settings (quiet hours moved here from M4)
-- ---------------------------------------------------------------------------
alter table public.centers
  add column attendance_edit_hours smallint not null default 48
    check (attendance_edit_hours between 1 and 720),
  add column absence_alert_delay_min smallint not null default 10
    check (absence_alert_delay_min between 0 and 240),
  add column late_alert_enabled boolean not null default false,
  add column quiet_hours_start time not null default '21:00',
  add column quiet_hours_end time not null default '08:00';

grant update (attendance_edit_hours, absence_alert_delay_min, late_alert_enabled, quiet_hours_start, quiet_hours_end)
  on public.centers to authenticated;

-- Attendance rows point at (center, group, lesson), so the group always matches the lesson.
alter table public.lessons add constraint lessons_center_group_id_key unique (center_id, group_id, id);

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  group_id uuid not null,
  lesson_id uuid not null,
  -- Trial guests (lead_trial_id) arrive in M5, which relaxes these two `not null`s.
  student_id uuid not null,
  enrollment_id uuid not null,
  status public.attendance_status not null,
  late_minutes smallint,
  note text check (note is null or length(note) <= 500),
  marked_by uuid not null references public.profiles (id),
  marked_at timestamptz not null default now(),
  last_edited_by uuid references public.profiles (id),
  last_edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, student_id),
  foreign key (center_id, group_id, lesson_id) references public.lessons (center_id, group_id, id),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, enrollment_id) references public.enrollments (center_id, id),
  check (late_minutes is null or (status = 'late' and late_minutes between 1 and 240))
);

create index attendance_group on public.attendance (group_id, lesson_id);
create index attendance_student on public.attendance (student_id);

create trigger attendance_updated_at before update on public.attendance
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- telegram_links (created empty; the bot fills it from M4)
-- ---------------------------------------------------------------------------
create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  telegram_user_id bigint not null,
  chat_id bigint not null,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  student_id uuid,
  guardian_id uuid,
  membership_id uuid,
  locale text not null default 'uz' check (locale in ('uz', 'ru', 'en')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, guardian_id) references public.guardians (center_id, id),
  foreign key (center_id, membership_id) references public.memberships (center_id, id),
  check (num_nonnulls(student_id, guardian_id, membership_id) = 1)
);

create unique index telegram_links_live on public.telegram_links
  (center_id, telegram_user_id, coalesce(student_id, guardian_id, membership_id))
  where unlinked_at is null;

create trigger telegram_links_updated_at before update on public.telegram_links
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_templates (system rows have center_id = null; centers override them from M4)
-- ---------------------------------------------------------------------------
create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  center_id uuid references public.centers (id),
  key text not null check (key ~ '^[a-z][a-z_]{2,39}$'),
  channel public.notification_channel not null,
  locale text not null check (locale in ('uz', 'ru', 'en')),
  body text not null check (length(body) between 1 and 2000),
  sms_provider_template_id text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notification_templates_key on public.notification_templates
  (coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid), key, channel, locale);

create trigger notification_templates_updated_at before update on public.notification_templates
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_outbox (one row per recipient subject; the sender picks the channel in M4)
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  channel public.notification_channel,
  template_key text not null,
  locale text not null check (locale in ('uz', 'ru', 'en')),
  payload jsonb not null default '{}',
  telegram_chat_id bigint,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  student_id uuid,
  guardian_id uuid,
  membership_id uuid,
  dedupe_key text,
  status public.outbox_status not null default 'pending',
  send_after timestamptz not null default now(),
  attempts smallint not null default 0 check (attempts >= 0),
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  fallback_of_id uuid references public.notification_outbox (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, guardian_id) references public.guardians (center_id, id),
  foreign key (center_id, membership_id) references public.memberships (center_id, id),
  check (num_nonnulls(student_id, guardian_id, membership_id) = 1)
);

create unique index notification_outbox_dedupe on public.notification_outbox (center_id, dedupe_key)
  where dedupe_key is not null;
create index notification_outbox_due on public.notification_outbox (send_after) where status = 'pending';
-- Lets RPCs cancel a lesson's or a student's pending rows by key prefix.
create index notification_outbox_pending_key on public.notification_outbox (center_id, dedupe_key text_pattern_ops)
  where status = 'pending';

create trigger notification_outbox_updated_at before update on public.notification_outbox
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The caller (active membership) teaches this very lesson, e.g. as a substitute.
create function private.teaches_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
    where l.id = p_lesson_id and l.teacher_membership_id = private.my_membership_id(l.center_id)
  );
$$;

-- A student's state in a group on a day (14): 'expected' (an enrollment covers the day and no freeze does),
-- 'frozen', or 'out'. Only dates count, not the enrollment's current status.
create function private.day_state(p_group_id uuid, p_student_id uuid, p_day date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when bool_or(f.id is null) then 'expected'
    when count(*) > 0 then 'frozen'
    else 'out'
  end
  from public.enrollments e
  left join public.enrollment_freezes f on f.enrollment_id = e.id and p_day between f.from_date and f.to_date
  where e.group_id = p_group_id and e.student_id = p_student_id
    and e.start_date <= p_day and (e.end_date is null or e.end_date >= p_day);
$$;

-- Students expected at a lesson, with the enrollment that makes them expected (same rule as day_state).
create function private.expected_students(p_lesson_id uuid)
returns table (student_id uuid, enrollment_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (e.student_id) e.student_id, e.id
  from public.lessons l
  join public.enrollments e on e.group_id = l.group_id
  where l.id = p_lesson_id
    and e.start_date <= l.local_date
    and (e.end_date is null or e.end_date >= l.local_date)
    and not exists (
      select 1 from public.enrollment_freezes f
      where f.enrollment_id = e.id and l.local_date between f.from_date and f.to_date
    )
  order by e.student_id, e.start_date desc;
$$;

-- How the caller may mark a lesson (14): 'admin' (any time), 'teacher' (inside the window), or why not:
-- 'none', 'cancelled', 'too_early' (more than 30 min before the start, for everyone) or 'closed'.
create function private.attendance_mode(p_lesson public.lessons)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(
    private.has_perm(p_lesson.center_id, 'attendance') and private.has_branch(p_lesson.center_id, p_lesson.branch_id),
    false
  );
  v_teacher boolean := coalesce(p_lesson.teacher_membership_id = private.my_membership_id(p_lesson.center_id), false);
  v_hours smallint;
begin
  if not (v_admin or v_teacher) then
    return 'none';
  end if;
  if p_lesson.status = 'cancelled' then
    return 'cancelled';
  end if;
  if now() < p_lesson.starts_at - interval '30 minutes' then
    return 'too_early';
  end if;
  if v_admin then
    return 'admin';
  end if;
  select c.attendance_edit_hours into v_hours from public.centers c where c.id = p_lesson.center_id;
  if now() >= p_lesson.ends_at + make_interval(hours => v_hours) then
    return 'closed';
  end if;
  return 'teacher';
end;
$$;

-- Quiet hours (wall clock in p_tz; the window may wrap midnight): a time inside them moves to their end.
-- Equal start and end mean no quiet hours.
create function private.apply_quiet_hours(p_at timestamptz, p_tz text, p_start time, p_end time)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_at at time zone p_tz;
  v_time time := v_local::time;
  v_day date := v_local::date;
begin
  if p_start = p_end then
    return p_at;
  end if;
  if p_start < p_end then
    if v_time >= p_start and v_time < p_end then
      return (v_day + p_end) at time zone p_tz;
    end if;
  elsif v_time >= p_start then
    return ((v_day + 1) + p_end) at time zone p_tz;
  elsif v_time < p_end then
    return (v_day + p_end) at time zone p_tz;
  end if;
  return p_at;
end;
$$;

-- Fields every lesson notification carries. Dates are ISO and times HH:MM in the branch timezone; the
-- sender formats them for the recipient's locale (M4).
create function private.lesson_payload(p_lesson public.lessons)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lessonId', p_lesson.id,
    'group', g.name,
    'date', to_char(p_lesson.local_date, 'YYYY-MM-DD'),
    'time', to_char(p_lesson.starts_at at time zone b.timezone, 'HH24:MI'),
    'center', c.name
  )
  from public.groups g
  join public.branches b on b.id = g.branch_id
  join public.centers c on c.id = g.center_id
  where g.id = p_lesson.group_id;
$$;

-- Queues a notification about a student (17): one row per recipient subject, channel chosen by the sender.
-- p_audience: 'guardians_or_student' (guardians who receive notifications, else the student) or
-- 'student_and_guardians'. Dedupe key = '{p_dedupe_base}:{recipient id}', so a guardian of two siblings gets one
-- lesson message. A cancelled row with the same key comes back (absent → present → absent); pending, sent and
-- failed rows are left alone. Quiet hours (center timezone) push send_after to their end. Returns rows queued.
create function private.enqueue_notification(
  p_center_id uuid,
  p_template_key text,
  p_student_id uuid,
  p_payload jsonb,
  p_dedupe_base text,
  p_send_after timestamptz,
  p_audience text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_send_after timestamptz;
  v_count integer;
begin
  if p_audience not in ('guardians_or_student', 'student_and_guardians') then
    raise exception 'invalid audience %', p_audience;
  end if;
  select c.* into v_center from public.centers c where c.id = p_center_id;
  v_send_after := private.apply_quiet_hours(
    coalesce(p_send_after, now()), v_center.timezone, v_center.quiet_hours_start, v_center.quiet_hours_end
  );

  with guardians as (
    select g.id, g.locale
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id and sg.receives_notifications and g.archived_at is null
  ),
  recipients as (
    select null::uuid as student_id, gu.id as guardian_id, coalesce(gu.locale, v_center.default_locale) as locale
    from guardians gu
    union all
    select p_student_id, null::uuid, v_center.default_locale
    where p_audience = 'student_and_guardians' or not exists (select 1 from guardians)
  )
  insert into public.notification_outbox as o (
    center_id, template_key, locale, payload, student_id, guardian_id, dedupe_key, send_after
  )
  select p_center_id, p_template_key, r.locale, p_payload, r.student_id, r.guardian_id,
         p_dedupe_base || ':' || coalesce(r.guardian_id, r.student_id), v_send_after
  from recipients r
  on conflict (center_id, dedupe_key) where dedupe_key is not null do update
  set status = 'pending',
      send_after = excluded.send_after,
      payload = excluded.payload,
      locale = excluded.locale,
      attempts = 0,
      last_error = null,
      locked_at = null
  where o.status = 'cancelled';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Cancels the still-pending rows whose dedupe key starts with p_key_prefix.
create function private.cancel_pending_notifications(p_center_id uuid, p_key_prefix text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notification_outbox o
  set status = 'cancelled'
  where o.center_id = p_center_id
    and o.status = 'pending'
    and o.dedupe_key like replace(replace(replace(p_key_prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Queues a lesson notification (13) to every student expected at the lesson and their guardians.
create function private.notify_lesson(
  p_lesson public.lessons,
  p_template_key text,
  p_dedupe_base text,
  p_extra jsonb default '{}'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := private.lesson_payload(p_lesson) || coalesce(p_extra, '{}');
  v_student uuid;
  v_count integer := 0;
begin
  for v_student in select x.student_id from private.expected_students(p_lesson.id) x loop
    v_count := v_count + private.enqueue_notification(
      p_lesson.center_id, p_template_key, v_student, v_payload, p_dedupe_base, now(), 'student_and_guardians'
    );
  end loop;
  return v_count;
end;
$$;

-- One audit_log row for an attendance change made after the teacher window (changed columns only).
create function private.audit_attendance(p_action text, p_before public.attendance, p_after public.attendance)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb := jsonb_build_object(
    'student_id', p_after.student_id, 'lesson_id', p_after.lesson_id,
    'status', p_after.status, 'late_minutes', p_after.late_minutes, 'note', p_after.note
  );
  v_key text;
begin
  if p_before.id is not null then
    v_before := jsonb_build_object(
      'student_id', p_before.student_id, 'lesson_id', p_before.lesson_id,
      'status', p_before.status, 'late_minutes', p_before.late_minutes, 'note', p_before.note
    );
    for v_key in select jsonb_object_keys(v_after) loop
      if v_after -> v_key is not distinct from v_before -> v_key then
        v_after := v_after - v_key;
        v_before := v_before - v_key;
      end if;
    end loop;
  end if;
  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, row_id, before, after)
  values (p_after.center_id, auth.uid(), 'user', p_action, 'attendance', p_after.id, v_before, v_after);
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.attendance enable row level security;
alter table public.telegram_links enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_outbox enable row level security;

-- Staff of the group's branch, the group's teachers, and whoever teaches the lesson. Writes: save_attendance only.
create policy attendance_select on public.attendance
  for select to authenticated
  using (
    private.is_branch_admin(center_id, private.group_branch(group_id))
    or private.teaches_group(group_id)
    or private.teaches_lesson(lesson_id)
  );

-- Admins see who is linked ("Telegram ✓"); only the worker writes (M4).
create policy telegram_links_select on public.telegram_links
  for select to authenticated
  using (private.is_staff_admin(center_id));

create policy notification_templates_select on public.notification_templates
  for select to authenticated
  using (center_id is null or private.is_member(center_id));

-- Owners only until M4's history screen scopes admins by the recipient's branch.
create policy notification_outbox_select on public.notification_outbox
  for select to authenticated
  using (private.is_owner(center_id));

revoke all on public.attendance, public.telegram_links, public.notification_templates, public.notification_outbox
  from anon, authenticated;
grant select on public.attendance, public.telegram_links, public.notification_templates, public.notification_outbox
  to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs: the sheet
-- ---------------------------------------------------------------------------
-- The lesson's header and what the caller may do with its sheet (names only, no contacts).
create function public.attendance_lesson(p_lesson_id uuid)
returns table (
  lesson_id uuid,
  group_id uuid,
  group_name text,
  branch_id uuid,
  timezone text,
  local_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  room_name text,
  teacher_name text,
  status public.lesson_status,
  topic text,
  is_substitute boolean,
  mode text,
  opens_at timestamptz,
  closes_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lesson public.lessons;
begin
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    private.is_branch_admin(v_lesson.center_id, v_lesson.branch_id)
    or private.teaches_group(v_lesson.group_id)
    or v_lesson.teacher_membership_id = private.my_membership_id(v_lesson.center_id)
  );
  return query
  select v_lesson.id, g.id, g.name, b.id, b.timezone, v_lesson.local_date, v_lesson.starts_at, v_lesson.ends_at,
         r.name, m.display_name, v_lesson.status, v_lesson.topic,
         v_lesson.original_teacher_membership_id is not null,
         private.attendance_mode(v_lesson),
         v_lesson.starts_at - interval '30 minutes',
         v_lesson.ends_at + make_interval(hours => c.attendance_edit_hours)
  from public.groups g
  join public.branches b on b.id = g.branch_id
  join public.centers c on c.id = g.center_id
  join public.memberships m on m.id = v_lesson.teacher_membership_id
  left join public.rooms r on r.id = v_lesson.room_id
  where g.id = v_lesson.group_id;
end;
$$;

-- The sheet's rows: expected students plus anyone already marked (e.g. after a backdated end).
create function public.attendance_sheet(p_lesson_id uuid)
returns table (
  student_id uuid,
  full_name text,
  enrollment_id uuid,
  is_expected boolean,
  status public.attendance_status,
  late_minutes smallint,
  note text,
  marked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lesson public.lessons;
begin
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    private.is_branch_admin(v_lesson.center_id, v_lesson.branch_id)
    or private.teaches_group(v_lesson.group_id)
    or v_lesson.teacher_membership_id = private.my_membership_id(v_lesson.center_id)
  );
  return query
  with ex as (
    select x.student_id, x.enrollment_id from private.expected_students(p_lesson_id) x
  ),
  mk as (
    select a.* from public.attendance a where a.lesson_id = p_lesson_id
  )
  select s.id, s.full_name, coalesce(ex.enrollment_id, mk.enrollment_id), ex.student_id is not null,
         mk.status, mk.late_minutes, mk.note, mk.marked_at
  from ex
  full join mk on mk.student_id = ex.student_id
  join public.students s on s.id = coalesce(ex.student_id, mk.student_id)
  order by private.normalize_name(s.full_name), s.id;
end;
$$;

-- Saves the sheet in one transaction (14): rows = [{studentId, status, lateMinutes?, note?}]; p_topic null
-- leaves the topic alone. The first save sets the lesson `held`. Inside the teacher window absent (and, if the
-- center wants it, late) marks queue alerts and changing them cancels the pending ones; after the window only
-- admins get here, their edits are audited and nobody is messaged. Returns {saved, alerts, held}.
create function public.save_attendance(p_lesson_id uuid, p_rows jsonb, p_topic text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_center public.centers;
  v_mode text;
  v_after_window boolean;
  v_expected jsonb;
  v_base jsonb;
  v_row jsonb;
  v_student uuid;
  v_status public.attendance_status;
  v_late smallint;
  v_note text;
  v_old public.attendance;
  v_new public.attendance;
  v_kind text;
  v_saved integer := 0;
  v_alerts integer := 0;
begin
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_lesson.center_id);
  v_mode := private.attendance_mode(v_lesson);
  if v_mode = 'none' then
    perform private.require(false);
  elsif v_mode = 'cancelled' then
    raise exception 'lesson_cancelled';
  elsif v_mode = 'too_early' then
    raise exception 'attendance_too_early';
  elsif v_mode = 'closed' then
    raise exception 'attendance_window_closed';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 300
     or length(p_topic) > 500 then
    raise exception 'invalid_attendance';
  end if;

  select c.* into v_center from public.centers c where c.id = v_lesson.center_id;
  v_after_window := now() >= v_lesson.ends_at + make_interval(hours => v_center.attendance_edit_hours);
  select coalesce(jsonb_object_agg(x.student_id, x.enrollment_id), '{}') into v_expected
  from private.expected_students(p_lesson_id) x;
  v_base := private.lesson_payload(v_lesson);

  for v_row in select value from jsonb_array_elements(p_rows) loop
    begin
      v_student := (v_row ->> 'studentId')::uuid;
      v_status := (v_row ->> 'status')::public.attendance_status;
      v_late := (v_row ->> 'lateMinutes')::smallint;
    exception when others then
      raise exception 'invalid_attendance';
    end;
    v_note := nullif(trim(v_row ->> 'note'), '');
    if v_student is null or v_status is null or length(v_note) > 500
       or (v_status = 'late' and v_late is not null and v_late not between 1 and 240) then
      raise exception 'invalid_attendance';
    end if;
    if v_status <> 'late' then
      v_late := null;
    end if;

    select a.* into v_old from public.attendance a
    where a.lesson_id = p_lesson_id and a.student_id = v_student
    for update;
    if v_old.id is null and not (v_expected ? v_student::text) then
      raise exception 'student_not_expected';
    end if;

    if v_old.id is null then
      insert into public.attendance (
        center_id, group_id, lesson_id, student_id, enrollment_id, status, late_minutes, note, marked_by
      )
      values (
        v_lesson.center_id, v_lesson.group_id, p_lesson_id, v_student, (v_expected ->> v_student::text)::uuid,
        v_status, v_late, v_note, auth.uid()
      )
      returning * into v_new;
      if v_after_window then
        perform private.audit_attendance('insert', null::public.attendance, v_new);
      end if;
    elsif (v_old.status, v_old.late_minutes, v_old.note) is distinct from (v_status, v_late, v_note) then
      update public.attendance
      set status = v_status, late_minutes = v_late, note = v_note, last_edited_by = auth.uid(), last_edited_at = now()
      where id = v_old.id
      returning * into v_new;
      if v_after_window then
        perform private.audit_attendance('update', v_old, v_new);
      end if;
    else
      continue;
    end if;
    v_saved := v_saved + 1;

    if not v_after_window and v_old.status is distinct from v_status then
      if v_old.status in ('absent', 'late') then
        perform private.cancel_pending_notifications(
          v_lesson.center_id,
          format('%s:%s:%s:', case v_old.status when 'absent' then 'absence' else 'late' end, p_lesson_id, v_student)
        );
      end if;
      if v_status = 'absent' or (v_status = 'late' and v_center.late_alert_enabled) then
        v_kind := case v_status when 'absent' then 'absence' else 'late' end;
        v_alerts := v_alerts + private.enqueue_notification(
          v_lesson.center_id,
          case v_kind when 'absence' then 'absence_alert' else 'late_alert' end,
          v_student,
          v_base
            || jsonb_build_object(
              'studentId', v_student,
              'student', (select s.full_name from public.students s where s.id = v_student)
            )
            || case when v_status = 'late' then jsonb_build_object('minutes', coalesce(v_late, 0)) else '{}' end,
          format('%s:%s:%s', v_kind, p_lesson_id, v_student),
          now() + make_interval(mins => v_center.absence_alert_delay_min),
          'guardians_or_student'
        );
      end if;
    end if;
  end loop;

  if p_topic is not null then
    update public.lessons set topic = nullif(trim(p_topic), '') where id = p_lesson_id;
  end if;
  if v_lesson.status = 'scheduled' and exists (select 1 from public.attendance a where a.lesson_id = p_lesson_id) then
    update public.lessons set status = 'held' where id = p_lesson_id;
    v_lesson.status := 'held';
  end if;
  return jsonb_build_object('saved', v_saved, 'alerts', v_alerts, 'held', v_lesson.status = 'held');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: matrix and per-lesson counts
-- ---------------------------------------------------------------------------
-- Students × lessons of a group between two days (at most ~2 months). day_state is 'expected', 'frozen'
-- or 'out'; status is null when not marked. Names only (teachers read it too).
create function public.attendance_matrix(p_group_id uuid, p_from date, p_to date)
returns table (
  student_id uuid,
  full_name text,
  lesson_id uuid,
  day_state text,
  status public.attendance_status,
  late_minutes smallint,
  note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
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
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'invalid_dates';
  end if;
  return query
  with ls as (
    select l.id, l.local_date, l.starts_at from public.lessons l
    where l.group_id = p_group_id and l.local_date between p_from and p_to
  ),
  st as (
    select e.student_id from public.enrollments e
    where e.group_id = p_group_id and e.start_date <= p_to and (e.end_date is null or e.end_date >= p_from)
    union
    select a.student_id from public.attendance a where a.lesson_id in (select ls.id from ls)
  )
  select s.id, s.full_name, ls.id, private.day_state(p_group_id, s.id, ls.local_date),
         a.status, a.late_minutes, a.note
  from st
  join public.students s on s.id = st.student_id
  cross join ls
  left join public.attendance a on a.lesson_id = ls.id and a.student_id = s.id
  order by private.normalize_name(s.full_name), s.id, ls.starts_at;
end;
$$;

-- Expected and marked counts for lesson lists (Today, Attendance, group Lessons). Lessons the caller can't
-- see are left out.
create function public.lesson_attendance_stats(p_lesson_ids uuid[])
returns table (
  lesson_id uuid,
  expected integer,
  marked integer,
  present integer,
  late integer,
  absent integer,
  excused integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         (select count(*)::int from private.expected_students(l.id)),
         count(a.id)::int,
         (count(a.id) filter (where a.status = 'present'))::int,
         (count(a.id) filter (where a.status = 'late'))::int,
         (count(a.id) filter (where a.status = 'absent'))::int,
         (count(a.id) filter (where a.status = 'excused'))::int
  from public.lessons l
  left join public.attendance a on a.lesson_id = l.id
  where l.id = any (p_lesson_ids)
    and (
      private.is_branch_admin(l.center_id, l.branch_id)
      or l.teacher_membership_id = private.my_membership_id(l.center_id)
      or private.teaches_group(l.group_id)
    )
  group by l.id;
$$;

-- ---------------------------------------------------------------------------
-- M1 lesson RPCs: "notify students?" (13) and the attendance guard
-- ---------------------------------------------------------------------------
-- Regeneration never touches a lesson with attendance (until M2 `status = 'scheduled'` stood in for that).
create or replace function private.clear_future_lessons(p_group_id uuid, p_rule_ids uuid[] default null)
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
    and l.starts_at > now()
    and not exists (select 1 from public.attendance a where a.lesson_id = l.id);
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

drop function public.move_lesson(uuid, timestamptz, uuid);
drop function public.cancel_lesson(uuid, text, boolean);
drop function public.create_makeup_lesson(uuid, timestamptz, integer, uuid, uuid, uuid, boolean);
drop function public.add_holiday(uuid, date, text, uuid);

-- One-off move (drag or the Move dialog). Keeps the duration; never changes the rule. A new date or time
-- notifies (unless p_notify is false) and cancels the lesson's still-pending earlier move messages.
create function public.move_lesson(
  p_lesson_id uuid,
  p_starts_at timestamptz,
  p_room_id uuid default null,
  p_notify boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_new public.lessons;
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
    where id = p_lesson_id
    returning * into v_new;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform private.raise_lesson_conflict(v_constraint);
  end;

  if v_new.starts_at <> v_lesson.starts_at then
    perform private.cancel_pending_notifications(v_lesson.center_id, format('lesson_moved:%s:', p_lesson_id));
    if coalesce(p_notify, true) then
      perform private.notify_lesson(
        v_new, 'lesson_moved',
        format('lesson_moved:%s:%s', p_lesson_id, extract(epoch from v_new.starts_at)::bigint),
        jsonb_build_object(
          'oldDate', to_char(v_lesson.local_date, 'YYYY-MM-DD'),
          'oldTime', to_char(v_lesson.starts_at at time zone v_tz, 'HH24:MI')
        )
      );
    end if;
  end if;
end;
$$;

-- Cancel: if it's the center's fault the lesson doesn't count (is_billable = false), so each student's
-- cycle extends by one lesson. Notifies students and guardians unless p_notify is false.
create function public.cancel_lesson(
  p_lesson_id uuid,
  p_reason text,
  p_center_fault boolean default true,
  p_notify boolean default true
)
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
  where id = p_lesson_id
  returning * into v_lesson;

  perform private.cancel_pending_notifications(v_lesson.center_id, format('lesson_moved:%s:', p_lesson_id));
  perform private.cancel_pending_notifications(v_lesson.center_id, format('lesson_added:%s:', p_lesson_id));
  if coalesce(p_notify, true) then
    perform private.notify_lesson(v_lesson, 'lesson_cancelled', format('lesson_cancelled:%s', p_lesson_id));
  end if;
end;
$$;

-- Makeup or extra lesson. Billable by default unless it replaces a cancelled lesson that still counted
-- (net zero for the students). A makeup notifies as `lesson_moved` (old → new time), an extra lesson as
-- `lesson_added`, unless p_notify is false.
create function public.create_makeup_lesson(
  p_group_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_for_lesson_id uuid default null,
  p_room_id uuid default null,
  p_teacher_membership_id uuid default null,
  p_is_billable boolean default null,
  p_notify boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_for public.lessons;
  v_new public.lessons;
  v_tz text;
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
    returning * into v_new;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform private.raise_lesson_conflict(v_constraint);
    when not_null_violation then
      raise exception 'rule_needs_teacher';
  end;

  if coalesce(p_notify, true) then
    if p_for_lesson_id is not null then
      perform private.notify_lesson(
        v_new, 'lesson_moved',
        format('lesson_moved:%s:%s', v_new.id, extract(epoch from v_new.starts_at)::bigint),
        jsonb_build_object(
          'oldDate', to_char(v_for.local_date, 'YYYY-MM-DD'),
          'oldTime', to_char(v_for.starts_at at time zone v_tz, 'HH24:MI')
        )
      );
    else
      perform private.notify_lesson(v_new, 'lesson_added', format('lesson_added:%s', v_new.id));
    end if;
  end if;
  return v_new.id;
end;
$$;

-- Adds a holiday and cancels that day's scheduled lessons without attendance (not billable, so cycles
-- extend). Notifying is opt-in (13). Returns the number of lessons cancelled.
create function public.add_holiday(
  p_center_id uuid,
  p_date date,
  p_name text,
  p_branch_id uuid default null,
  p_notify boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_count integer := 0;
begin
  perform private.require_writable(p_center_id);
  perform private.require(
    private.has_perm(p_center_id, 'academics')
    and (case when p_branch_id is null then private.is_owner(p_center_id)
              else private.has_branch(p_center_id, p_branch_id) end)
  );
  insert into public.holidays (center_id, branch_id, date, name) values (p_center_id, p_branch_id, p_date, trim(p_name));

  for v_lesson in
    update public.lessons l
    set status = 'cancelled', is_billable = false, cancel_reason = 'holiday'
    where l.center_id = p_center_id
      and (p_branch_id is null or l.branch_id = p_branch_id)
      and l.local_date = p_date
      and l.status = 'scheduled'
      and not exists (select 1 from public.attendance a where a.lesson_id = l.id)
    returning l.*
  loop
    v_count := v_count + 1;
    perform private.cancel_pending_notifications(p_center_id, format('lesson_moved:%s:', v_lesson.id));
    if coalesce(p_notify, false) then
      perform private.notify_lesson(v_lesson, 'lesson_cancelled', format('lesson_cancelled:%s', v_lesson.id));
    end if;
  end loop;
  return v_count;
exception
  when unique_violation then
    raise exception 'duplicate';
end;
$$;

-- ---------------------------------------------------------------------------
-- System templates (Telegram, uz/ru/en) for the keys M2 enqueues. ICU messages; payload keys in 14 and 13.
-- ---------------------------------------------------------------------------
insert into public.notification_templates (center_id, key, channel, locale, body) values
  (null, 'absence_alert', 'telegram', 'uz',
   '{student} {date} kuni soat {time}dagi {group} darsiga kelmadi. Agar bu xato boʻlsa, «{center}» oʻquv markaziga murojaat qiling.'),
  (null, 'absence_alert', 'telegram', 'ru',
   '{student}: пропуск занятия {group} {date} в {time}. Если это ошибка, свяжитесь с учебным центром «{center}».'),
  (null, 'absence_alert', 'telegram', 'en',
   '{student} missed the {group} lesson on {date} at {time}. If this is a mistake, please contact {center}.'),
  (null, 'late_alert', 'telegram', 'uz',
   '{minutes, plural, =0 {{student} {date} kuni soat {time}dagi {group} darsiga kechikdi.} other {{student} {date} kuni soat {time}dagi {group} darsiga # daqiqa kechikdi.}}'),
  (null, 'late_alert', 'telegram', 'ru',
   '{minutes, plural, =0 {{student}: опоздание на занятие {group} {date} в {time}.} other {{student}: опоздание на # мин на занятие {group} {date} в {time}.}}'),
  (null, 'late_alert', 'telegram', 'en',
   '{minutes, plural, =0 {{student} was late for the {group} lesson on {date} at {time}.} other {{student} was # min late for the {group} lesson on {date} at {time}.}}'),
  (null, 'lesson_cancelled', 'telegram', 'uz', '{date} kuni soat {time}dagi {group} darsi bekor qilindi.'),
  (null, 'lesson_cancelled', 'telegram', 'ru', 'Занятие {group} {date} в {time} отменено.'),
  (null, 'lesson_cancelled', 'telegram', 'en', 'The {group} lesson on {date} at {time} is cancelled.'),
  (null, 'lesson_moved', 'telegram', 'uz',
   '{oldDate} kuni soat {oldTime}dagi {group} darsi {date} kuni soat {time}ga koʻchirildi.'),
  (null, 'lesson_moved', 'telegram', 'ru', 'Занятие {group} {oldDate} в {oldTime} перенесено на {date} в {time}.'),
  (null, 'lesson_moved', 'telegram', 'en', 'The {group} lesson on {oldDate} at {oldTime} is moved to {date} at {time}.'),
  (null, 'lesson_added', 'telegram', 'uz', '{group} uchun qoʻshimcha dars: {date} kuni soat {time}.'),
  (null, 'lesson_added', 'telegram', 'ru', 'Дополнительное занятие {group}: {date} в {time}.'),
  (null, 'lesson_added', 'telegram', 'en', 'Extra {group} lesson: {date} at {time}.');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.attendance_lesson(uuid) from public, anon;
revoke all on function public.attendance_sheet(uuid) from public, anon;
revoke all on function public.save_attendance(uuid, jsonb, text) from public, anon;
revoke all on function public.attendance_matrix(uuid, date, date) from public, anon;
revoke all on function public.lesson_attendance_stats(uuid[]) from public, anon;
revoke all on function public.move_lesson(uuid, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.cancel_lesson(uuid, text, boolean, boolean) from public, anon;
revoke all on function public.create_makeup_lesson(uuid, timestamptz, integer, uuid, uuid, uuid, boolean, boolean)
  from public, anon;
revoke all on function public.add_holiday(uuid, date, text, uuid, boolean) from public, anon;

grant execute on function public.attendance_lesson(uuid) to authenticated;
grant execute on function public.attendance_sheet(uuid) to authenticated;
grant execute on function public.save_attendance(uuid, jsonb, text) to authenticated;
grant execute on function public.attendance_matrix(uuid, date, date) to authenticated;
grant execute on function public.lesson_attendance_stats(uuid[]) to authenticated;
grant execute on function public.move_lesson(uuid, timestamptz, uuid, boolean) to authenticated;
grant execute on function public.cancel_lesson(uuid, text, boolean, boolean) to authenticated;
grant execute on function public.create_makeup_lesson(uuid, timestamptz, integer, uuid, uuid, uuid, boolean, boolean)
  to authenticated;
grant execute on function public.add_holiday(uuid, date, text, uuid, boolean) to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
