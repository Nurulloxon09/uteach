-- M4a · Telegram & SMS data layer: what the worker needs to send the outbox, link Telegram users and answer the
-- bot menu, plus broadcasts, payment reminders, charge_created and staff alerts.
-- Spec: docs/spec/17-telegram-notifications.md, 15-payments-debts.md (reminders), 02-data-model.md
-- (Notifications), 01-tech-stack.md (apps/worker) and 30-milestones.md (M4 plan).
-- The worker connects as `uteach_worker` and can only execute functions in the `worker` schema (03 §5).

-- ---------------------------------------------------------------------------
-- centers: reminder and SMS settings
-- ---------------------------------------------------------------------------
alter table public.centers
  add column reminder_every_days smallint not null default 3 check (reminder_every_days between 1 and 30),
  add column due_soon_reminder_enabled boolean not null default true,
  add column sms_enabled boolean not null default false,
  add column sms_monthly_cap integer not null default 0 check (sms_monthly_cap between 0 and 1000000);

grant update (reminder_every_days, due_soon_reminder_enabled, sms_enabled, sms_monthly_cap)
  on public.centers to authenticated;

-- ---------------------------------------------------------------------------
-- broadcasts (created and queued only by create_broadcast)
-- ---------------------------------------------------------------------------
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  -- {"branch_ids":[],"group_ids":[],"course_ids":[],"student_ids":[],"debtors":false,"recipients":"guardians"}
  audience jsonb not null,
  -- The branches of the students it reached: admins see broadcasts that stay inside their branches.
  branch_ids uuid[] not null default '{}',
  body text not null check (length(trim(body)) between 1 and 2000),
  body_by_locale jsonb not null default '{}',
  channel public.notification_channel not null default 'telegram' check (channel in ('telegram', 'sms')),
  scheduled_at timestamptz,
  status text not null default 'queued' check (status in ('queued', 'cancelled')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create index broadcasts_center on public.broadcasts (center_id, created_at desc);

create trigger broadcasts_updated_at before update on public.broadcasts
  for each row execute function private.set_updated_at();

alter table public.notification_outbox
  add column broadcast_id uuid,
  add foreign key (center_id, broadcast_id) references public.broadcasts (center_id, id);

create index notification_outbox_broadcast on public.notification_outbox (broadcast_id) where broadcast_id is not null;
-- "Last reminder" per student (Debtors) and the reminder cadence look rows up by key and student.
create index notification_outbox_reminders on public.notification_outbox (center_id, ((payload ->> 'studentId')))
  where template_key = 'payment_reminder';

-- ---------------------------------------------------------------------------
-- bot_sessions and system_heartbeats (worker only: RLS on, no policies)
-- ---------------------------------------------------------------------------
create table public.bot_sessions (
  telegram_user_id bigint primary key,
  state jsonb not null default '{}',
  active_center_id uuid references public.centers (id),
  updated_at timestamptz not null default now()
);

create table public.system_heartbeats (
  service text primary key check (service ~ '^[a-z][a-z0-9_-]{1,39}$'),
  last_beat_at timestamptz not null default now(),
  info jsonb not null default '{}'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Retry delay after a failed attempt (17): 30 s, 2 min, 10 min, 1 h; null after the 5th attempt (give up).
-- Mirrors outboxBackoffSeconds() in packages/core/notifications (parity-tested).
create function private.outbox_backoff(p_attempts integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case
    when p_attempts <= 1 then interval '30 seconds'
    when p_attempts = 2 then interval '2 minutes'
    when p_attempts = 3 then interval '10 minutes'
    when p_attempts = 4 then interval '1 hour'
    else null
  end;
$$;

-- The template for a key, channel and locale: the center's override, else the system row.
create function private.template_for(p_center_id uuid, p_key text, p_channel public.notification_channel, p_locale text)
returns public.notification_templates
language sql
stable
security definer
set search_path = ''
as $$
  select t.*
  from public.notification_templates t
  where t.key = p_key and t.channel = p_channel and t.locale = p_locale
    and (t.center_id = p_center_id or t.center_id is null)
  order by t.center_id nulls last
  limit 1;
$$;

-- SMS sent by a center this calendar month (center timezone), for the monthly cap.
create function private.sms_sent_this_month(p_center_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notification_outbox o
  join public.centers c on c.id = o.center_id
  where o.center_id = p_center_id and o.channel = 'sms' and o.status = 'sent'
    and o.sent_at >= (date_trunc('month', now() at time zone c.timezone) at time zone c.timezone);
$$;

-- Queues a notification to staff (memberships): one row per active member, in their profile's language.
-- Dedupe key = '{p_dedupe_base}:{membership id}'. Quiet hours apply. Returns rows queued.
create function private.enqueue_staff_notification(
  p_center_id uuid,
  p_template_key text,
  p_membership_ids uuid[],
  p_payload jsonb,
  p_dedupe_base text,
  p_send_after timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_count integer;
begin
  select c.* into v_center from public.centers c where c.id = p_center_id;
  insert into public.notification_outbox (
    center_id, template_key, locale, payload, membership_id, dedupe_key, send_after
  )
  select p_center_id, p_template_key, p.locale, p_payload, m.id, p_dedupe_base || ':' || m.id,
         private.apply_quiet_hours(
           coalesce(p_send_after, now()), v_center.timezone, v_center.quiet_hours_start, v_center.quiet_hours_end
         )
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where m.center_id = p_center_id and m.id = any (p_membership_ids) and m.status = 'active'
  on conflict (center_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Who an outbox row is about, for branch-scoped reads: the student, or any student of the guardian.
create function private.outbox_visible(p_center_id uuid, p_student_id uuid, p_guardian_id uuid, p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner(p_center_id)
    or (
      p_membership_id is null
      and private.is_staff_admin(p_center_id)
      and exists (
        select 1 from public.students s
        where s.center_id = p_center_id
          and (
            s.id = p_student_id
            or s.id in (select sg.student_id from public.student_guardians sg where sg.guardian_id = p_guardian_id)
          )
          and private.has_branch(p_center_id, s.branch_id)
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- charge_created: create_next_charge (M3) now also tells parents about a new cycle charge (15)
-- ---------------------------------------------------------------------------
create or replace function private.create_next_charge(p_enrollment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments;
  v_center public.centers;
  v_today date;
  v_last record;
  v_offset integer;
  v_next date;
  v_price record;
  v_calc jsonb;
  v_cycle integer;
  v_id uuid;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id for update;
  if not found or v_e.status <> 'active' then
    return null;
  end if;
  select c.* into v_center from public.centers c where c.id = v_e.center_id;
  select private.today_in(b.timezone) into v_today
  from public.groups g join public.branches b on b.id = g.branch_id where g.id = v_e.group_id;

  select w.* into v_last from private.charge_windows(p_enrollment_id) w order by w.cycle_no desc limit 1;
  if v_last.charge_id is not null
     and (v_last.in_window < v_last.cycle_lessons or v_last.last_date > v_today) then
    return null;
  end if;
  select coalesce(sum(w.cycle_lessons), 0)::integer, coalesce(max(w.cycle_no), 0)
  into v_offset, v_cycle
  from private.charge_windows(p_enrollment_id) w;

  select b.local_date into v_next from private.billable_lessons(p_enrollment_id) b where b.seq = v_offset + 1;
  if v_next is null then
    return null;
  end if;
  select p.* into v_price from private.cycle_price(p_enrollment_id, v_next) p;
  if v_price.price is null then
    return null;
  end if;

  v_calc := private.compute_cycle_charge(
    v_price.price, v_e.discount_bp, v_e.discount_amount, v_center.rounding_unit_amount
  ) || jsonb_build_object(
    'cycleLessons', v_price.cycle_lessons,
    'priceOverride', v_e.price_override_amount is not null
  );
  insert into public.charges (
    center_id, student_id, enrollment_id, cycle_no, cycle_start_date, cycle_lessons, due_date,
    price_amount, discount_amount, amount, calc, created_by
  )
  values (
    v_e.center_id, v_e.student_id, v_e.id, v_cycle + 1, v_next, v_price.cycle_lessons,
    v_next + v_center.payment_due_days, v_price.price, (v_calc ->> 'discount')::bigint,
    (v_calc ->> 'amount')::bigint, v_calc, null
  )
  on conflict (enrollment_id, cycle_no) where status = 'open' and not is_manual do nothing
  returning id into v_id;

  -- Only charges still ahead of their due date: catching up an old enrollment doesn't message history.
  if v_id is not null and v_next + v_center.payment_due_days >= v_today and (v_calc ->> 'amount')::bigint > 0 then
    perform private.enqueue_notification(
      v_e.center_id, 'charge_created', v_e.student_id,
      jsonb_build_object(
        'chargeId', v_id, 'studentId', v_e.student_id,
        'student', (select s.full_name from public.students s where s.id = v_e.student_id),
        'group', (select g.name from public.groups g where g.id = v_e.group_id),
        'center', v_center.name, 'cycle', v_cycle + 1, 'lessons', v_price.cycle_lessons,
        'amount', (v_calc ->> 'amount'), 'currency', v_center.currency,
        'startDate', to_char(v_next, 'YYYY-MM-DD'),
        'dueDate', to_char(v_next + v_center.payment_due_days, 'YYYY-MM-DD')
      ),
      format('charge:%s', v_id), now(), 'billing'
    );
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment reminders (15): overdue every `reminder_every_days`, and "due soon" 2 days ahead
-- ---------------------------------------------------------------------------
-- The last day a payment reminder was queued for a student (job or manual), whatever its outcome except
-- cancelled/skipped (e.g. skipped because the debt was paid before sending).
create function private.last_reminder_date(p_center_id uuid, p_student_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max((o.payload ->> 'reminderDate')::date)
  from public.notification_outbox o
  where o.center_id = p_center_id and o.template_key = 'payment_reminder'
    and o.payload ->> 'studentId' = p_student_id::text
    and o.status not in ('cancelled', 'skipped');
$$;

-- Queues one student's overdue reminder for p_day. p_manual = the Debtors "Send reminder" button.
create function private.enqueue_payment_reminder(p_student_id uuid, p_day date, p_manual boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_center public.centers;
  v_debt bigint;
  v_oldest date;
  v_days integer;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  select c.* into v_center from public.centers c where c.id = v_student.center_id;
  v_debt := -private.student_balance(p_student_id);
  if v_debt <= 0 then
    return 0;
  end if;
  select min(d.due_date) filter (where d.outstanding > 0), coalesce(max(d.days_overdue), 0)
  into v_oldest, v_days
  from private.debt_items(p_student_id) d;
  return private.enqueue_notification(
    v_student.center_id, 'payment_reminder', p_student_id,
    jsonb_build_object(
      'studentId', p_student_id, 'student', v_student.full_name, 'center', v_center.name,
      'debt', v_debt::text, 'currency', v_center.currency,
      'oldestDueDate', to_char(v_oldest, 'YYYY-MM-DD'), 'daysOverdue', v_days,
      'reminderDate', to_char(p_day, 'YYYY-MM-DD'), 'manual', p_manual
    ),
    format('reminder:%s:%s', p_student_id, to_char(p_day, 'YYYY-MM-DD')) || case when p_manual then ':manual' else '' end,
    now(), 'billing'
  );
end;
$$;

-- One center's reminders for today (center timezone). Idempotent (dedupe keys). Returns rows queued.
create function private.enqueue_payment_reminders_for(p_center_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_today date;
  v_student uuid;
  v_last date;
  v_item record;
  v_count integer := 0;
begin
  select c.* into v_center from public.centers c where c.id = p_center_id;
  v_today := private.today_in(v_center.timezone);

  -- Students that may owe something: open charges or negative adjustments.
  for v_student in
    select x.student_id from public.charges x
    where x.center_id = p_center_id and x.status = 'open' and x.due_date <= v_today + 2
    union
    select a.student_id from public.balance_adjustments a
    where a.center_id = p_center_id and a.voided_at is null and a.amount < 0
  loop
    if private.student_balance(v_student) >= 0 then
      continue;
    end if;

    -- Overdue: the first reminder once a debt is past due, then every reminder_every_days.
    if exists (select 1 from private.debt_items(v_student) d where d.outstanding > 0 and d.days_overdue > 0) then
      v_last := private.last_reminder_date(p_center_id, v_student);
      if v_last is null or v_today - v_last >= v_center.reminder_every_days then
        v_count := v_count + private.enqueue_payment_reminder(v_student, v_today, false);
      end if;
    end if;

    -- Due soon: unpaid cycle charges due in 1–2 days (two days ahead; a missed run still catches up).
    if v_center.due_soon_reminder_enabled then
      for v_item in
        select d.charge_id, d.outstanding, d.due_date from private.debt_items(v_student) d
        where d.charge_id is not null and d.outstanding > 0 and d.due_date between v_today + 1 and v_today + 2
      loop
        v_count := v_count + private.enqueue_notification(
          p_center_id, 'payment_due_soon', v_student,
          jsonb_build_object(
            'chargeId', v_item.charge_id, 'studentId', v_student,
            'student', (select s.full_name from public.students s where s.id = v_student),
            'center', v_center.name, 'amount', v_item.outstanding::text, 'currency', v_center.currency,
            'dueDate', to_char(v_item.due_date, 'YYYY-MM-DD')
          ),
          format('due_soon:%s', v_item.charge_id), now(), 'billing'
        );
      end loop;
    end if;
  end loop;
  return v_count;
end;
$$;

-- pg_cron `enqueue_payment_reminders` (hourly): centers whose local time is 10:xx get today's reminders.
create function private.enqueue_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center uuid;
  v_count integer := 0;
begin
  for v_center in
    select c.id from public.centers c
    where c.status <> 'cancelled' and extract(hour from now() at time zone c.timezone) = 10
  loop
    v_count := v_count + private.enqueue_payment_reminders_for(v_center);
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff alerts (17): substitute assigned, schedule conflicts detected
-- ---------------------------------------------------------------------------
create function private.on_lesson_teacher_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.teacher_membership_id is distinct from old.teacher_membership_id then
    -- A substitution that is undone or changed again takes back the previous substitute's message.
    if old.original_teacher_membership_id is not null then
      perform private.cancel_pending_notifications(
        new.center_id, format('substitute:%s:%s', new.id, old.teacher_membership_id)
      );
    end if;
    if new.original_teacher_membership_id is not null and new.status = 'scheduled' and new.starts_at > now() then
      perform private.enqueue_staff_notification(
        new.center_id, 'substitute_assigned', array[new.teacher_membership_id], private.lesson_payload(new),
        format('substitute:%s', new.id)
      );
    end if;
  end if;
  return null;
end;
$$;

create trigger lessons_teacher_alert after update of teacher_membership_id on public.lessons
  for each row execute function private.on_lesson_teacher_change();

-- New conflicts of a group are reported once a day per admin (generation may find many dates at once).
create function private.on_schedule_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  select b.timezone into v_tz from public.branches b where b.id = new.branch_id;
  perform private.enqueue_staff_notification(
    new.center_id, 'schedule_conflict',
    array(
      select m.id from public.memberships m
      where m.center_id = new.center_id and m.status = 'active'
        and (m.role = 'owner' or (m.role = 'admin' and 'academics' = any (m.permissions)
                                  and new.branch_id = any (m.branch_ids)))
    ),
    jsonb_build_object(
      'groupId', new.group_id,
      'group', (select g.name from public.groups g where g.id = new.group_id),
      'center', (select c.name from public.centers c where c.id = new.center_id),
      'date', to_char(new.local_date, 'YYYY-MM-DD'),
      'kind', new.conflict_kind
    ),
    format('conflict:%s:%s', new.group_id, to_char(private.today_in(v_tz), 'YYYY-MM-DD'))
  );
  return null;
end;
$$;

create trigger schedule_conflicts_alert after insert on public.schedule_conflicts
  for each row when (new.resolved_at is null) execute function private.on_schedule_conflict();

-- ---------------------------------------------------------------------------
-- Broadcasts (17): audience → students → recipients
-- ---------------------------------------------------------------------------
-- The students an audience reaches inside the caller's branches. Filter kinds combine with AND, values in a
-- list with OR. Groups and courses count students with an active or frozen enrollment.
create function private.broadcast_students(p_center_id uuid, p_audience jsonb)
returns table (student_id uuid, branch_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select
      coalesce(array(select jsonb_array_elements_text(p_audience -> 'branch_ids')::uuid), '{}') as branches,
      coalesce(array(select jsonb_array_elements_text(p_audience -> 'group_ids')::uuid), '{}') as groups,
      coalesce(array(select jsonb_array_elements_text(p_audience -> 'course_ids')::uuid), '{}') as courses,
      coalesce(array(select jsonb_array_elements_text(p_audience -> 'student_ids')::uuid), '{}') as students,
      coalesce((p_audience ->> 'debtors')::boolean, false) as debtors
  )
  select s.id, s.branch_id
  from public.students s, a
  where s.center_id = p_center_id and s.archived_at is null
    and s.branch_id = any (private.my_branch_ids(p_center_id))
    and (cardinality(a.branches) = 0 or s.branch_id = any (a.branches))
    and (cardinality(a.students) = 0 or s.id = any (a.students))
    and (cardinality(a.groups) = 0 or exists (
      select 1 from public.enrollments e
      where e.student_id = s.id and e.status in ('active', 'frozen') and e.group_id = any (a.groups)
    ))
    and (cardinality(a.courses) = 0 or exists (
      select 1 from public.enrollments e join public.groups g on g.id = e.group_id
      where e.student_id = s.id and e.status in ('active', 'frozen') and g.course_id = any (a.courses)
    ))
    and (not a.debtors or private.student_balance(s.id) < 0);
$$;

-- Recipient subjects: 'guardians' (who receive notifications; a student without one gets it directly),
-- 'students', or 'both'. A guardian of two siblings is one recipient.
create function private.broadcast_recipients(p_center_id uuid, p_audience jsonb)
returns table (student_id uuid, guardian_id uuid, locale text, branch_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with st as (
    select x.student_id, x.branch_id from private.broadcast_students(p_center_id, p_audience) x
  ),
  mode as (
    select coalesce(p_audience ->> 'recipients', 'guardians') as recipients
  ),
  center as (
    select c.default_locale from public.centers c where c.id = p_center_id
  ),
  gu as (
    select distinct on (g.id) g.id as guardian_id, coalesce(g.locale, center.default_locale) as locale, st.branch_id
    from st
    join public.student_guardians sg on sg.student_id = st.student_id and sg.receives_notifications
    join public.guardians g on g.id = sg.guardian_id and g.archived_at is null
    cross join center
    where (select recipients from mode) in ('guardians', 'both')
    order by g.id, st.branch_id
  )
  select null::uuid, gu.guardian_id, gu.locale, gu.branch_id from gu
  union all
  select st.student_id, null::uuid, center.default_locale, st.branch_id
  from st cross join center
  where (select recipients from mode) in ('students', 'both')
     or ((select recipients from mode) = 'guardians' and not exists (
       select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
       where sg.student_id = st.student_id and sg.receives_notifications and g.archived_at is null
     ));
$$;

-- An active Telegram link exists for the subject.
create function private.has_telegram(p_student_id uuid, p_guardian_id uuid, p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.telegram_links l
    where l.unlinked_at is null
      and (l.student_id = p_student_id or l.guardian_id = p_guardian_id or l.membership_id = p_membership_id)
  );
$$;

create function private.check_audience(p_audience jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_audience is null or jsonb_typeof(p_audience) <> 'object'
     or coalesce(p_audience ->> 'recipients', 'guardians') not in ('guardians', 'students', 'both') then
    raise exception 'invalid_audience';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.broadcasts enable row level security;
alter table public.bot_sessions enable row level security;
alter table public.system_heartbeats enable row level security;

create policy broadcasts_select on public.broadcasts
  for select to authenticated
  using (
    private.has_perm(center_id, 'broadcasts')
    and (private.is_owner(center_id) or branch_ids <@ private.my_branch_ids(center_id))
  );

-- Owners see everything; admins see rows about students of their branches; staff alerts stay owner-only.
drop policy notification_outbox_select on public.notification_outbox;
create policy notification_outbox_select on public.notification_outbox
  for select to authenticated
  using (private.outbox_visible(center_id, student_id, guardian_id, membership_id));

-- Centers write their own template overrides (settings); system rows stay read-only.
create policy notification_templates_insert on public.notification_templates
  for insert to authenticated
  with check (
    center_id is not null and private.has_perm(center_id, 'settings') and private.center_writable(center_id)
  );
create policy notification_templates_update on public.notification_templates
  for update to authenticated
  using (center_id is not null and private.has_perm(center_id, 'settings'))
  with check (
    center_id is not null and private.has_perm(center_id, 'settings') and private.center_writable(center_id)
  );
create policy notification_templates_delete on public.notification_templates
  for delete to authenticated
  using (center_id is not null and private.has_perm(center_id, 'settings') and private.center_writable(center_id));

revoke all on public.broadcasts, public.bot_sessions, public.system_heartbeats from anon, authenticated;
grant select on public.broadcasts to authenticated;
-- The Eskiz template id is set by the owner after approval; the key/channel/locale of a row never change.
grant insert (center_id, key, channel, locale, body, sms_provider_template_id, is_enabled),
      update (body, sms_provider_template_id, is_enabled),
      delete
  on public.notification_templates to authenticated;

-- "Last reminder" per student for Debtors (outbox RLS applies).
create view public.last_payment_reminders with (security_invoker = true) as
select o.center_id, (o.payload ->> 'studentId')::uuid as student_id,
       max(o.created_at) as last_queued_at,
       max(o.sent_at) as last_sent_at
from public.notification_outbox o
where o.template_key = 'payment_reminder' and o.status not in ('cancelled', 'skipped')
group by o.center_id, (o.payload ->> 'studentId');

revoke all on public.last_payment_reminders from anon, authenticated;
grant select on public.last_payment_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs for staff
-- ---------------------------------------------------------------------------
-- What a broadcast would reach: {students, recipients, withoutTelegram}.
create function public.preview_broadcast(p_center_id uuid, p_audience jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require(private.has_perm(p_center_id, 'broadcasts'));
  perform private.check_audience(p_audience);
  return (
    select jsonb_build_object(
      'students', (select count(*) from private.broadcast_students(p_center_id, p_audience)),
      'recipients', count(*),
      'withoutTelegram', count(*) filter (where not private.has_telegram(r.student_id, r.guardian_id, null))
    )
    from private.broadcast_recipients(p_center_id, p_audience) r
  );
end;
$$;

-- Creates a broadcast and queues one outbox row per recipient (dedupe `broadcast:{id}:{recipient}`).
-- p_body_by_locale: optional {"uz": …, "ru": …, "en": …}; p_body is the fallback. p_scheduled_at null = now.
-- SMS only when the center has an approved `broadcast` SMS template. Returns {broadcastId, recipients}.
create function public.create_broadcast(
  p_center_id uuid,
  p_audience jsonb,
  p_body text,
  p_body_by_locale jsonb default '{}',
  p_channel public.notification_channel default 'telegram',
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_bodies jsonb;
  v_id uuid;
  v_count integer;
begin
  perform private.require_writable(p_center_id);
  perform private.require(private.has_perm(p_center_id, 'broadcasts'));
  perform private.check_audience(p_audience);
  select c.* into v_center from public.centers c where c.id = p_center_id;
  if p_body is null or length(trim(p_body)) not between 1 and 2000 then
    raise exception 'invalid_body';
  end if;
  -- Keep only non-empty texts for known locales.
  select coalesce(jsonb_object_agg(k, trim(v)), '{}') into v_bodies
  from jsonb_each_text(coalesce(p_body_by_locale, '{}')) as e(k, v)
  where k in ('uz', 'ru', 'en') and length(trim(v)) between 1 and 2000;
  if p_channel not in ('telegram', 'sms') then
    raise exception 'invalid_channel';
  end if;
  if p_channel = 'sms' and not exists (
    select 1 from public.notification_templates t
    where t.key = 'broadcast' and t.channel = 'sms' and t.sms_provider_template_id is not null and t.is_enabled
      and (t.center_id = p_center_id or t.center_id is null)
  ) then
    raise exception 'sms_not_available';
  end if;
  if p_scheduled_at is not null
     and (p_scheduled_at < now() - interval '5 minutes' or p_scheduled_at > now() + interval '60 days') then
    raise exception 'invalid_dates';
  end if;

  insert into public.broadcasts (center_id, audience, body, body_by_locale, channel, scheduled_at, created_by)
  values (p_center_id, p_audience, trim(p_body), v_bodies, p_channel, p_scheduled_at, auth.uid())
  returning id into v_id;

  insert into public.notification_outbox (
    center_id, channel, template_key, locale, payload, student_id, guardian_id, dedupe_key, send_after, broadcast_id
  )
  select p_center_id, case when p_channel = 'sms' then 'sms'::public.notification_channel end, 'broadcast',
         r.locale,
         jsonb_build_object('broadcastId', v_id, 'center', v_center.name, 'body', trim(p_body), 'bodies', v_bodies),
         r.student_id, r.guardian_id, format('broadcast:%s:%s', v_id, coalesce(r.guardian_id, r.student_id)),
         private.apply_quiet_hours(
           coalesce(p_scheduled_at, now()), v_center.timezone, v_center.quiet_hours_start, v_center.quiet_hours_end
         ),
         v_id
  from private.broadcast_recipients(p_center_id, p_audience) r;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'empty_audience';
  end if;

  update public.broadcasts
  set recipient_count = v_count,
      branch_ids = array(select distinct r.branch_id from private.broadcast_recipients(p_center_id, p_audience) r)
  where id = v_id;
  return jsonb_build_object('broadcastId', v_id, 'recipients', v_count);
end;
$$;

-- Cancels a broadcast's messages that haven't gone out yet. Returns how many were cancelled.
create function public.cancel_broadcast(p_broadcast_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.broadcasts;
  v_count integer;
begin
  select b.* into v_b from public.broadcasts b where b.id = p_broadcast_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_b.center_id);
  perform private.require(
    private.has_perm(v_b.center_id, 'broadcasts')
    and (private.is_owner(v_b.center_id) or v_b.branch_ids <@ private.my_branch_ids(v_b.center_id))
  );
  if v_b.status = 'cancelled' then
    return 0;
  end if;
  update public.notification_outbox o set status = 'cancelled'
  where o.broadcast_id = p_broadcast_id and o.status = 'pending';
  get diagnostics v_count = row_count;
  update public.broadcasts set status = 'cancelled', cancelled_at = now() where id = p_broadcast_id;
  return v_count;
end;
$$;

-- Delivery counts per broadcast for the history table.
create function public.broadcast_stats(p_broadcast_ids uuid[])
returns table (broadcast_id uuid, pending integer, sent integer, failed integer, skipped integer, cancelled integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.broadcast_id,
         (count(*) filter (where o.status in ('pending', 'sending')))::integer,
         (count(*) filter (where o.status = 'sent'))::integer,
         (count(*) filter (where o.status = 'failed'))::integer,
         (count(*) filter (where o.status = 'skipped'))::integer,
         (count(*) filter (where o.status = 'cancelled'))::integer
  from public.notification_outbox o
  join public.broadcasts b on b.id = o.broadcast_id
  where o.broadcast_id = any (p_broadcast_ids)
    and private.has_perm(b.center_id, 'broadcasts')
    and (private.is_owner(b.center_id) or b.branch_ids <@ private.my_branch_ids(b.center_id))
  group by o.broadcast_id;
$$;

-- Debtors → "Send reminder": queues the payment reminder now, at most once a day per student. Returns rows
-- queued (0 = already sent today).
create function public.send_payment_reminder(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_tz text;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_student.center_id);
  perform private.require(
    private.has_perm(v_student.center_id, 'billing') and private.has_branch(v_student.center_id, v_student.branch_id)
  );
  if private.student_balance(p_student_id) >= 0 then
    raise exception 'no_debt';
  end if;
  select c.timezone into v_tz from public.centers c where c.id = v_student.center_id;
  return private.enqueue_payment_reminder(p_student_id, private.today_in(v_tz), true);
end;
$$;

-- The worker's heartbeat for owners (temporary health page until super-admin exists).
create function public.worker_health()
returns table (service text, last_beat_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require(exists (
    select 1 from public.memberships m
    where m.profile_id = (select auth.uid()) and m.status = 'active' and m.role = 'owner'
  ));
  return query select h.service, h.last_beat_at from public.system_heartbeats h order by h.service;
end;
$$;

-- ---------------------------------------------------------------------------
-- The worker: role and schema (01, 03 §5). Functions run as their owner; the role can only call them.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'uteach_worker') then
    create role uteach_worker nologin noinherit;
  end if;
end;
$$;

create schema worker;
revoke all on schema worker from public;
grant usage on schema worker to uteach_worker;

-- A claimed outbox row with everything the sender needs to pick the channel and render the text.
create type worker.outbox_job as (
  id uuid,
  center_id uuid,
  template_key text,
  locale text,
  payload jsonb,
  channel public.notification_channel,
  attempts smallint,
  student_id uuid,
  guardian_id uuid,
  membership_id uuid,
  broadcast_id uuid,
  fallback_of_id uuid,
  telegram_chat_id bigint,
  phone text,
  telegram_body text,
  telegram_enabled boolean,
  sms_body text,
  sms_template_id text,
  sms_enabled boolean,
  center_name text,
  center_timezone text,
  center_currency text,
  center_sms_enabled boolean,
  sms_left integer
);

-- Claims up to p_limit due rows (17): `sending`, attempts + 1, locked now; concurrent workers skip each other's
-- rows. Reminders about a debt that has since been paid are skipped instead of claimed.
create function worker.claim_outbox(p_limit integer default 50)
returns setof worker.outbox_job
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox o
  set status = 'skipped', last_error = 'settled'
  where o.id in (
    select x.id from public.notification_outbox x
    where x.status = 'pending' and x.send_after <= now()
      and x.template_key in ('payment_reminder', 'payment_due_soon')
      and (
        (x.template_key = 'payment_reminder' and private.student_balance((x.payload ->> 'studentId')::uuid) >= 0)
        or (x.template_key = 'payment_due_soon' and not exists (
          select 1 from private.debt_items((x.payload ->> 'studentId')::uuid) d
          where d.charge_id = (x.payload ->> 'chargeId')::uuid and d.outstanding > 0
        ))
      )
    for update skip locked
  );

  return query
  with claimed as (
    update public.notification_outbox o
    set status = 'sending', locked_at = now(), attempts = o.attempts + 1
    where o.id in (
      select x.id from public.notification_outbox x
      where x.status = 'pending' and x.send_after <= now()
      order by x.send_after
      limit greatest(1, least(coalesce(p_limit, 50), 500))
      for update skip locked
    )
    returning o.*
  )
  select c.id, c.center_id, c.template_key, coalesce(lk.locale, c.locale), c.payload, c.channel, c.attempts,
         c.student_id, c.guardian_id, c.membership_id, c.broadcast_id, c.fallback_of_id,
         lk.chat_id,
         coalesce(c.phone, s.phone, g.phone, p.phone),
         tt.body, coalesce(tt.is_enabled, false),
         st.body, st.sms_provider_template_id, coalesce(st.is_enabled, false),
         ce.name, ce.timezone, ce.currency::text, ce.sms_enabled,
         greatest(0, ce.sms_monthly_cap - private.sms_sent_this_month(ce.id))
  from claimed c
  join public.centers ce on ce.id = c.center_id
  left join lateral (
    select l.chat_id, l.locale from public.telegram_links l
    where l.center_id = c.center_id and l.unlinked_at is null
      and (l.student_id = c.student_id or l.guardian_id = c.guardian_id or l.membership_id = c.membership_id)
    order by l.linked_at desc
    limit 1
  ) lk on true
  left join public.students s on s.id = c.student_id
  left join public.guardians g on g.id = c.guardian_id
  left join public.memberships m on m.id = c.membership_id
  left join public.profiles p on p.id = m.profile_id
  left join lateral private.template_for(c.center_id, c.template_key, 'telegram', coalesce(lk.locale, c.locale)) tt
    on tt.id is not null
  left join lateral private.template_for(c.center_id, c.template_key, 'sms', c.locale) st on st.id is not null
  order by c.send_after;
end;
$$;

-- Delivered. Returns false if the row wasn't being sent (e.g. recovered as stale meanwhile).
create function worker.mark_sent(
  p_id uuid,
  p_channel public.notification_channel,
  p_chat_id bigint default null,
  p_phone text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox o
  set status = 'sent', channel = p_channel, sent_at = now(), locked_at = null, last_error = null,
      telegram_chat_id = coalesce(p_chat_id, o.telegram_chat_id),
      phone = coalesce(p_phone, o.phone),
      provider_message_id = p_provider_message_id
  where o.id = p_id and o.status = 'sending';
  return found;
end;
$$;

-- A retryable error: back to `pending` after the backoff (or p_min_delay_seconds, e.g. Telegram's retry_after,
-- if longer); `failed` after the 5th attempt. Returns the new status.
create function worker.mark_retry(p_id uuid, p_error text, p_min_delay_seconds integer default 0)
returns public.outbox_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox;
  v_delay interval;
begin
  select o.* into v_row from public.notification_outbox o where o.id = p_id and o.status = 'sending' for update;
  if not found then
    return null;
  end if;
  v_delay := private.outbox_backoff(v_row.attempts);
  if v_delay is null then
    update public.notification_outbox
    set status = 'failed', locked_at = null, last_error = left(p_error, 1000)
    where id = p_id;
    return 'failed';
  end if;
  update public.notification_outbox
  set status = 'pending', locked_at = null, last_error = left(p_error, 1000),
      send_after = now() + greatest(v_delay, make_interval(secs => greatest(coalesce(p_min_delay_seconds, 0), 0)))
  where id = p_id;
  return 'pending';
end;
$$;

-- A permanent error. With p_telegram_blocked (bot blocked, chat not found) the chat's links are unlinked and,
-- for critical templates (17), an SMS fallback row is queued when the center sends SMS and the template has an
-- approved SMS version. Returns the fallback row's id, if any.
create function worker.mark_failed(p_id uuid, p_error text, p_telegram_blocked boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox;
  v_center public.centers;
  v_chat bigint;
  v_id uuid;
begin
  select o.* into v_row from public.notification_outbox o where o.id = p_id and o.status = 'sending' for update;
  if not found then
    return null;
  end if;
  update public.notification_outbox
  set status = 'failed', locked_at = null, last_error = left(p_error, 1000)
  where id = p_id;
  if not p_telegram_blocked then
    return null;
  end if;

  select l.chat_id into v_chat from public.telegram_links l
  where l.center_id = v_row.center_id and l.unlinked_at is null
    and (l.student_id = v_row.student_id or l.guardian_id = v_row.guardian_id
         or l.membership_id = v_row.membership_id)
  order by l.linked_at desc limit 1;
  update public.telegram_links set unlinked_at = now()
  where chat_id = coalesce(v_chat, v_row.telegram_chat_id) and unlinked_at is null;

  select c.* into v_center from public.centers c where c.id = v_row.center_id;
  if v_row.fallback_of_id is not null or v_row.channel = 'sms' or not v_center.sms_enabled
     or v_row.template_key not in ('absence_alert', 'payment_reminder', 'lesson_cancelled')
     or (private.template_for(v_row.center_id, v_row.template_key, 'sms', v_row.locale)).sms_provider_template_id is null
  then
    return null;
  end if;
  insert into public.notification_outbox (
    center_id, channel, template_key, locale, payload, student_id, guardian_id, membership_id, dedupe_key,
    send_after, fallback_of_id, broadcast_id
  )
  values (
    v_row.center_id, 'sms', v_row.template_key, v_row.locale, v_row.payload, v_row.student_id, v_row.guardian_id,
    v_row.membership_id, format('fallback:%s', v_row.id),
    private.apply_quiet_hours(now(), v_center.timezone, v_center.quiet_hours_start, v_center.quiet_hours_end),
    v_row.id, v_row.broadcast_id
  )
  on conflict (center_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Nothing to send (template off, no channel, over the SMS cap, …).
create function worker.mark_skipped(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox o
  set status = 'skipped', locked_at = null, last_error = left(p_reason, 1000)
  where o.id = p_id and o.status = 'sending';
  return found;
end;
$$;

-- Crash recovery (17): rows stuck in `sending` for longer than p_seconds go back to `pending`.
create function worker.recover_stale(p_seconds integer default 120)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notification_outbox o
  set status = 'pending', locked_at = null, send_after = now(), last_error = 'stale lock recovered'
  where o.status = 'sending' and o.locked_at < now() - make_interval(secs => greatest(p_seconds, 10));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function worker.beat(p_service text, p_info jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.system_heartbeats (service, last_beat_at, info)
  values (p_service, now(), coalesce(p_info, '{}'))
  on conflict (service) do update set last_beat_at = excluded.last_beat_at, info = excluded.info;
$$;

-- A shared contact (17): links the Telegram user to every student, guardian and active staff member with that
-- phone, in every center. The bot has already checked contact.user_id = from.id. Returns the live links.
create function worker.link_contact(p_telegram_user_id bigint, p_chat_id bigint, p_phone text, p_locale text)
returns table (link_id uuid, center_id uuid, center_name text, subject text, subject_id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_locale text := case when p_locale in ('uz', 'ru', 'en') then p_locale else 'uz' end;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_phone';
  end if;

  insert into public.telegram_links as l (center_id, telegram_user_id, chat_id, phone, student_id, guardian_id,
                                          membership_id, locale)
  select x.center_id, p_telegram_user_id, p_chat_id, p_phone, x.student_id, x.guardian_id, x.membership_id, v_locale
  from (
    select s.center_id, s.id as student_id, null::uuid as guardian_id, null::uuid as membership_id
    from public.students s where s.phone = p_phone and s.archived_at is null
    union all
    select g.center_id, null, g.id, null from public.guardians g where g.phone = p_phone and g.archived_at is null
    union all
    select m.center_id, null, null, m.id
    from public.memberships m join public.profiles p on p.id = m.profile_id
    where p.phone = p_phone and m.status = 'active'
  ) x
  on conflict (center_id, telegram_user_id, coalesce(student_id, guardian_id, membership_id))
    where unlinked_at is null
  do update set chat_id = excluded.chat_id, phone = excluded.phone, locale = excluded.locale;

  return query
  select l.id, l.center_id, c.name,
         case when l.student_id is not null then 'student' when l.guardian_id is not null then 'guardian'
              else 'staff' end,
         coalesce(l.student_id, l.guardian_id, l.membership_id),
         coalesce(s.full_name, g.full_name, m.display_name)
  from public.telegram_links l
  join public.centers c on c.id = l.center_id
  left join public.students s on s.id = l.student_id
  left join public.guardians g on g.id = l.guardian_id
  left join public.memberships m on m.id = l.membership_id
  where l.telegram_user_id = p_telegram_user_id and l.unlinked_at is null
  order by c.name, 6;
end;
$$;

-- Blocking the bot or Settings → Unlink: every live link of the Telegram user ends. Returns how many.
create function worker.unlink(p_telegram_user_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.telegram_links set unlinked_at = now()
  where telegram_user_id = p_telegram_user_id and unlinked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The bot's language for a user: their links' locale, else what they picked before linking.
create function worker.set_locale(p_telegram_user_id bigint, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_locale not in ('uz', 'ru', 'en') then
    raise exception 'invalid_locale';
  end if;
  update public.telegram_links set locale = p_locale
  where telegram_user_id = p_telegram_user_id and unlinked_at is null;
end;
$$;

-- grammY session storage (bot_sessions).
create function worker.get_session(p_telegram_user_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.state || jsonb_build_object('activeCenterId', s.active_center_id)
  from public.bot_sessions s where s.telegram_user_id = p_telegram_user_id;
$$;

create function worker.set_session(p_telegram_user_id bigint, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center uuid;
begin
  -- The active center must be one the user is linked to.
  select l.center_id into v_center from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id and l.unlinked_at is null
    and l.center_id::text = p_state ->> 'activeCenterId'
  limit 1;
  insert into public.bot_sessions (telegram_user_id, state, active_center_id, updated_at)
  values (p_telegram_user_id, coalesce(p_state, '{}') - 'activeCenterId', v_center, now())
  on conflict (telegram_user_id) do update
  set state = excluded.state, active_center_id = excluded.active_center_id, updated_at = now();
end;
$$;

create function worker.delete_session(p_telegram_user_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.bot_sessions where telegram_user_id = p_telegram_user_id;
$$;

-- The students a Telegram user may ask about: themselves (student links) and their children (guardian links).
create function worker.bot_subjects(p_telegram_user_id bigint)
returns table (center_id uuid, center_name text, student_id uuid, student_name text, relation text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (s.id) s.center_id, c.name, s.id, s.full_name,
         case when l.student_id is not null then 'self' else 'child' end
  from public.telegram_links l
  left join public.student_guardians sg on sg.guardian_id = l.guardian_id
  join public.students s on s.id = coalesce(l.student_id, sg.student_id)
  join public.centers c on c.id = s.center_id
  where l.telegram_user_id = p_telegram_user_id and l.unlinked_at is null
    and l.membership_id is null and s.archived_at is null
  order by s.id, (l.student_id is null);
$$;

create function worker.require_subject(p_telegram_user_id bigint, p_student_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from worker.bot_subjects(p_telegram_user_id) x where x.student_id = p_student_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- The student's lessons between two days (branch timezone), cancellations included.
create function worker.bot_schedule(p_telegram_user_id bigint, p_student_id uuid, p_from date, p_to date)
returns table (
  lesson_id uuid,
  local_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  group_name text,
  room_name text,
  teacher_name text,
  status public.lesson_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform worker.require_subject(p_telegram_user_id, p_student_id);
  return query
  select l.id, l.local_date, l.starts_at, l.ends_at, b.timezone, g.name, r.name, m.display_name, l.status
  from public.enrollments e
  join public.lessons l on l.group_id = e.group_id
  join public.groups g on g.id = l.group_id
  join public.branches b on b.id = l.branch_id
  left join public.rooms r on r.id = l.room_id
  left join public.memberships m on m.id = l.teacher_membership_id
  where e.student_id = p_student_id and e.status in ('active', 'frozen')
    and l.local_date between greatest(p_from, e.start_date) and least(p_to, coalesce(e.end_date, p_to))
    and l.local_date between p_from and p_from + 62
  order by l.starts_at;
end;
$$;

-- The student's attendance marks between two days.
create function worker.bot_attendance(p_telegram_user_id bigint, p_student_id uuid, p_from date, p_to date)
returns table (local_date date, group_name text, status public.attendance_status, late_minutes smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform worker.require_subject(p_telegram_user_id, p_student_id);
  return query
  select l.local_date, g.name, a.status, a.late_minutes
  from public.attendance a
  join public.lessons l on l.id = a.lesson_id
  join public.groups g on g.id = a.group_id
  where a.student_id = p_student_id and l.local_date between p_from and least(p_to, p_from + 62)
  order by l.starts_at;
end;
$$;

-- Balance, open debts (FIFO) and the last 5 payments: {balance, currency, debts: […], payments: […]}.
create function worker.bot_payments(p_telegram_user_id bigint, p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
begin
  perform worker.require_subject(p_telegram_user_id, p_student_id);
  select c.* into v_center from public.centers c join public.students s on s.center_id = c.id
  where s.id = p_student_id;
  return jsonb_build_object(
    'balance', private.student_balance(p_student_id)::text,
    'currency', v_center.currency,
    'debts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dueDate', to_char(d.due_date, 'YYYY-MM-DD'), 'outstanding', d.outstanding::text,
        'daysOverdue', d.days_overdue
      ) order by d.due_date)
      from private.debt_items(p_student_id) d where d.outstanding > 0
    ), '[]'),
    'payments', coalesce((
      select jsonb_agg(x.j order by x.paid_at desc) from (
        select p.paid_at, jsonb_build_object(
          'paymentId', p.id, 'paidAt', p.paid_at, 'amount', p.amount::text, 'receiptNo', p.receipt_no
        ) as j
        from public.payments p
        where p.student_id = p_student_id and p.voided_at is null
        order by p.paid_at desc limit 5
      ) x
    ), '[]')
  );
end;
$$;

revoke all on all functions in schema worker from public;
grant execute on all functions in schema worker to uteach_worker;

-- ---------------------------------------------------------------------------
-- System templates (uz/ru/en). Telegram for the new keys; SMS for the critical ones, without an Eskiz id
-- until the owner gets them approved (nothing goes by SMS before that).
-- ---------------------------------------------------------------------------
insert into public.notification_templates (center_id, key, channel, locale, body) values
  (null, 'charge_created', 'telegram', 'uz',
   '{student}: {group} guruhida {cycle}-davr ({lessons} dars, {startDate} dan). Toʻlov: {amount}, muddati {dueDate}.'),
  (null, 'charge_created', 'telegram', 'ru',
   '{student}: {group}, период {cycle} ({lessons} занятий с {startDate}). К оплате {amount} до {dueDate}.'),
  (null, 'charge_created', 'telegram', 'en',
   '{student}: {group}, cycle {cycle} ({lessons} lessons from {startDate}). {amount} is due by {dueDate}.'),
  (null, 'payment_reminder', 'telegram', 'uz',
   '{student} boʻyicha qarzdorlik: {debt} ({oldestDueDate} dan). Iltimos, «{center}» ga toʻlovni amalga oshiring.'),
  (null, 'payment_reminder', 'telegram', 'ru',
   'Задолженность за {student}: {debt} (с {oldestDueDate}). Пожалуйста, оплатите в «{center}».'),
  (null, 'payment_reminder', 'telegram', 'en',
   '{student} has an outstanding balance of {debt} (since {oldestDueDate}). Please pay at {center}.'),
  (null, 'payment_due_soon', 'telegram', 'uz', '{student}: {amount} toʻlov muddati {dueDate}. «{center}»'),
  (null, 'payment_due_soon', 'telegram', 'ru', '{student}: оплата {amount} до {dueDate}. «{center}»'),
  (null, 'payment_due_soon', 'telegram', 'en', '{student}: {amount} is due on {dueDate}. {center}'),
  (null, 'broadcast', 'telegram', 'uz', '«{center}»: {body}'),
  (null, 'broadcast', 'telegram', 'ru', '«{center}»: {body}'),
  (null, 'broadcast', 'telegram', 'en', '{center}: {body}'),
  (null, 'substitute_assigned', 'telegram', 'uz', 'Siz {date} kuni soat {time}da {group} darsiga oʻrinbosar etib tayinlandingiz.'),
  (null, 'substitute_assigned', 'telegram', 'ru', 'Вы заменяете преподавателя: {group}, {date} в {time}.'),
  (null, 'substitute_assigned', 'telegram', 'en', 'You are substituting the {group} lesson on {date} at {time}.'),
  (null, 'schedule_conflict', 'telegram', 'uz',
   '{group} jadvalida toʻqnashuv bor ({date} dan). Uni uteach’da hal qiling.'),
  (null, 'schedule_conflict', 'telegram', 'ru', 'Конфликт в расписании {group} (с {date}). Решите его в uteach.'),
  (null, 'schedule_conflict', 'telegram', 'en', 'Schedule conflict in {group} (from {date}). Resolve it in uteach.'),
  (null, 'absence_alert', 'sms', 'uz', '{student} {date} {time} {group} darsiga kelmadi. {center}'),
  (null, 'absence_alert', 'sms', 'ru', '{student} пропустил(а) занятие {group} {date} {time}. {center}'),
  (null, 'absence_alert', 'sms', 'en', '{student} missed {group} on {date} {time}. {center}'),
  (null, 'payment_reminder', 'sms', 'uz', '{student} qarzdorligi {debt}. Iltimos, toʻlang. {center}'),
  (null, 'payment_reminder', 'sms', 'ru', 'Задолженность {student}: {debt}. Просим оплатить. {center}'),
  (null, 'payment_reminder', 'sms', 'en', '{student} owes {debt}. Please pay. {center}'),
  (null, 'lesson_cancelled', 'sms', 'uz', '{group} {date} {time} darsi bekor qilindi. {center}'),
  (null, 'lesson_cancelled', 'sms', 'ru', 'Занятие {group} {date} {time} отменено. {center}'),
  (null, 'lesson_cancelled', 'sms', 'en', '{group} lesson on {date} {time} is cancelled. {center}');

-- ---------------------------------------------------------------------------
-- Grants and the scheduled job
-- ---------------------------------------------------------------------------
revoke all on function public.preview_broadcast(uuid, jsonb) from public, anon;
revoke all on function public.create_broadcast(uuid, jsonb, text, jsonb, public.notification_channel, timestamptz)
  from public, anon;
revoke all on function public.cancel_broadcast(uuid) from public, anon;
revoke all on function public.broadcast_stats(uuid[]) from public, anon;
revoke all on function public.send_payment_reminder(uuid) from public, anon;
revoke all on function public.worker_health() from public, anon;

grant execute on function public.preview_broadcast(uuid, jsonb) to authenticated;
grant execute on function public.create_broadcast(uuid, jsonb, text, jsonb, public.notification_channel, timestamptz)
  to authenticated;
grant execute on function public.cancel_broadcast(uuid) to authenticated;
grant execute on function public.broadcast_stats(uuid[]) to authenticated;
grant execute on function public.send_payment_reminder(uuid) to authenticated;
grant execute on function public.worker_health() to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('enqueue_payment_reminders', '0 * * * *', 'select private.enqueue_payment_reminders()');
  end if;
end;
$$;
