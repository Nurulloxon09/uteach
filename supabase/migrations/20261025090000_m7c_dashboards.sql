-- M7c (30-milestones, PROPOSED (M7c plan)): role dashboards. One function per role, security invoker, so RLS
-- decides what each person sees (an admin only their branches, a teacher only their lessons and groups).
-- "Today" and "this month" are taken in each branch's timezone (lessons, payments, charges, enrollments) or the
-- center's (leads).

-- Distinct students with an enrollment covering each branch's "day", where the day is computed per branch.
-- p_month_offset 0 = today; -1 = the last day of the previous month.
create function private.dashboard_active_students(p_center_id uuid, p_branch_ids uuid[], p_month_offset integer)
returns table (branch_id uuid, student_id uuid)
language sql
stable
set search_path = ''
as $$
  select distinct g.branch_id, e.student_id
  from public.branches b
  cross join lateral (
    select case when p_month_offset = 0 then private.today_in(b.timezone)
                else (date_trunc('month', private.today_in(b.timezone)) - interval '1 day')::date end as day
  ) d
  join public.groups g on g.center_id = b.center_id and g.branch_id = b.id
  join public.enrollments e on e.group_id = g.id
  where b.center_id = p_center_id and b.id = any (p_branch_ids)
    and e.start_date <= d.day and (e.end_date is null or e.end_date >= d.day);
$$;

-- ---------------------------------------------------------------------------
-- Owner: all branches, or one (p_branch_id).
-- ---------------------------------------------------------------------------
create function public.dashboard_owner(p_center_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_branches uuid[];
  v_lessons uuid[];
  v_result jsonb;
begin
  if not private.is_owner(p_center_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(array_agg(b.id), '{}') into v_branches
  from public.branches b
  where b.center_id = p_center_id and b.archived_at is null and (p_branch_id is null or b.id = p_branch_id);

  select coalesce(array_agg(l.id), '{}') into v_lessons
  from public.lessons l join public.branches b on b.id = l.branch_id
  where l.center_id = p_center_id and l.branch_id = any (v_branches) and l.status <> 'cancelled'
    and l.local_date = private.today_in(b.timezone);

  with
  stats as (select * from public.lesson_attendance_stats(v_lessons)),
  pay as (
    select p.branch_id, p.amount,
           (p.paid_at at time zone b.timezone)::date = private.today_in(b.timezone) as is_today,
           date_trunc('month', p.paid_at at time zone b.timezone) = date_trunc('month', private.today_in(b.timezone))
             as is_month
    from public.payments p join public.branches b on b.id = p.branch_id
    where p.center_id = p_center_id and p.branch_id = any (v_branches) and p.voided_at is null
      and p.paid_at > now() - interval '32 days'
  ),
  charged as (
    select coalesce(sum(c.amount), 0)::bigint as amount
    from public.charges c
    join public.students s on s.id = c.student_id
    join public.branches b on b.id = s.branch_id
    where c.center_id = p_center_id and s.branch_id = any (v_branches) and c.voided_at is null
      and date_trunc('month', c.due_date) = date_trunc('month', private.today_in(b.timezone))
  ),
  debt as (
    select d.branch_id, d.debt, d.aging_bucket
    from public.debtors d where d.center_id = p_center_id and d.branch_id = any (v_branches)
  ),
  active_now as (select * from private.dashboard_active_students(p_center_id, v_branches, 0)),
  active_then as (select * from private.dashboard_active_students(p_center_id, v_branches, -1)),
  center as (select c.timezone from public.centers c where c.id = p_center_id)
  select jsonb_build_object(
    'today', jsonb_build_object(
      'lessons', cardinality(v_lessons),
      'marked_lessons', (select count(*) from stats where marked >= expected),
      'present', (select coalesce(sum(present), 0) from stats),
      'late', (select coalesce(sum(late), 0) from stats),
      'absent', (select coalesce(sum(absent), 0) from stats),
      'payments_amount', (select coalesce(sum(amount), 0) from pay where is_today),
      'payments_count', (select count(*) from pay where is_today)),
    'month', jsonb_build_object(
      'charged', (select amount from charged),
      'collected', (select coalesce(sum(amount), 0) from pay where is_month)),
    'debt', jsonb_build_object(
      'total', (select coalesce(sum(debt), 0) from debt),
      'students', (select count(*) from debt),
      'buckets', jsonb_build_object(
        '0-30', (select coalesce(sum(debt), 0) from debt where aging_bucket = '0-30'),
        '31-60', (select coalesce(sum(debt), 0) from debt where aging_bucket = '31-60'),
        '61-90', (select coalesce(sum(debt), 0) from debt where aging_bucket = '61-90'),
        '90+', (select coalesce(sum(debt), 0) from debt where aging_bucket = '90+'))),
    'students', jsonb_build_object(
      'active', (select count(distinct student_id) from active_now),
      'active_last_month', (select count(distinct student_id) from active_then)),
    'leads', jsonb_build_object(
      'new', (select count(*) from public.leads ld, center
              where ld.center_id = p_center_id and ld.branch_id = any (v_branches)
                and date_trunc('month', ld.created_at at time zone center.timezone)
                    = date_trunc('month', now() at time zone center.timezone)),
      'won', (select count(distinct a.lead_id) from public.lead_activities a
              join public.leads ld on ld.id = a.lead_id, center
              where a.center_id = p_center_id and ld.branch_id = any (v_branches)
                and a.kind = 'status_change' and a.to_status = 'won'
                and date_trunc('month', a.created_at at time zone center.timezone)
                    = date_trunc('month', now() at time zone center.timezone))),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name,
               'lessons_today', (select count(*) from public.lessons l
                                 where l.id = any (v_lessons) and l.branch_id = b.id),
               'active_students', (select count(distinct student_id) from active_now a where a.branch_id = b.id),
               'collected_month', (select coalesce(sum(amount), 0) from pay where pay.branch_id = b.id and is_month),
               'debt', (select coalesce(sum(debt), 0) from debt where debt.branch_id = b.id))
             order by b.created_at)
      from public.branches b where b.id = any (v_branches)), '[]')
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: their branches (RLS). Money parts only with the `billing` permission.
-- ---------------------------------------------------------------------------
create function public.dashboard_admin(p_center_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_lessons uuid[];
  v_end_of_today timestamptz;
  v_result jsonb;
begin
  if not private.is_staff_admin(p_center_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select ((private.today_in(c.timezone) + 1)::timestamp at time zone c.timezone) into v_end_of_today
  from public.centers c where c.id = p_center_id;

  select coalesce(array_agg(l.id), '{}') into v_lessons
  from public.lessons l join public.branches b on b.id = l.branch_id
  where l.center_id = p_center_id and l.status <> 'cancelled' and l.local_date = private.today_in(b.timezone)
    and private.is_branch_admin(l.center_id, l.branch_id);

  with stats as (select * from public.lesson_attendance_stats(v_lessons))
  select jsonb_build_object(
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'group', g.name, 'starts_at', l.starts_at, 'ends_at', l.ends_at,
               'timezone', b.timezone, 'teacher', m.display_name,
               'expected', s.expected, 'marked', s.marked)
             order by l.starts_at)
      from public.lessons l
      join public.groups g on g.id = l.group_id
      join public.branches b on b.id = l.branch_id
      left join public.memberships m on m.id = l.teacher_membership_id
      left join stats s on s.lesson_id = l.id
      where l.id = any (v_lessons)), '[]'),
    'debtors', case when private.has_perm(p_center_id, 'billing') then coalesce((
      select jsonb_agg(jsonb_build_object('student_id', x.student_id, 'name', x.full_name, 'debt', x.debt,
                                          'days_overdue', x.max_days_overdue) order by x.debt desc)
      from (select d.student_id, s.full_name, d.debt, d.max_days_overdue
            from public.debtors d join public.students s on s.id = d.student_id
            where d.center_id = p_center_id and private.has_branch(p_center_id, d.branch_id)
            order by d.debt desc limit 10) x), '[]') end,
    'follow_ups', coalesce((
      select jsonb_agg(jsonb_build_object('lead_id', x.lead_id, 'name', x.full_name, 'body', x.body,
                                          'due_at', x.due_at, 'assignee', x.display_name) order by x.due_at)
      from (select a.lead_id, ld.full_name, a.body, a.due_at, m.display_name
            from public.lead_activities a
            join public.leads ld on ld.id = a.lead_id
            left join public.memberships m on m.id = a.assigned_membership_id
            where a.center_id = p_center_id and a.kind = 'task' and a.done_at is null
              and a.due_at < v_end_of_today and ld.archived_at is null
            order by a.due_at limit 20) x), '[]'),
    'follow_ups_overdue', (
      select count(*) from public.lead_activities a join public.leads ld on ld.id = a.lead_id
      where a.center_id = p_center_id and a.kind = 'task' and a.done_at is null and a.due_at < now()
        and ld.archived_at is null),
    'trials', coalesce((
      select jsonb_agg(jsonb_build_object('lead_id', ld.id, 'name', ld.full_name, 'group', g.name,
                                          'starts_at', l.starts_at, 'timezone', b.timezone) order by l.starts_at)
      from public.lead_trials t
      join public.leads ld on ld.id = t.lead_id
      join public.lessons l on l.id = t.lesson_id
      join public.groups g on g.id = l.group_id
      join public.branches b on b.id = l.branch_id
      where t.center_id = p_center_id and t.status = 'scheduled' and l.id = any (v_lessons)), '[]'),
    'no_telegram', (
      select count(distinct s.id) from public.students s
      join public.enrollments e on e.student_id = s.id and e.status = 'active'
      where s.center_id = p_center_id and s.archived_at is null
        and not exists (select 1 from public.telegram_links t
                        where t.center_id = p_center_id and t.unlinked_at is null
                          and (t.student_id = s.id
                               or t.guardian_id in (select sg.guardian_id from public.student_guardians sg
                                                    where sg.student_id = s.id)))),
    'conflicts', (
      select count(*) from public.schedule_conflicts sc
      where sc.center_id = p_center_id and sc.resolved_at is null)
  ) into v_result;
  return v_result;
end;
$$;

-- Active students of a group, for its teacher (teachers can't read enrollments; 03).
create function private.group_active_students(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.enrollments e
  where e.group_id = p_group_id and e.status = 'active'
    and (private.teaches_group(p_group_id)
         or private.is_branch_admin(e.center_id, private.group_branch(p_group_id)));
$$;

-- ---------------------------------------------------------------------------
-- Teacher (on Today): lessons still to mark, their groups, groups with no score in 30 days. No money.
-- ---------------------------------------------------------------------------
create function public.dashboard_teacher(p_center_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_me uuid := private.my_membership_id(p_center_id);
  v_hours integer;
  v_today date;
  v_open uuid[];
  v_result jsonb;
begin
  if v_me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.attendance_edit_hours, private.today_in(c.timezone) into v_hours, v_today
  from public.centers c where c.id = p_center_id;

  -- Their lessons that have ended and are still inside the edit window.
  select coalesce(array_agg(l.id), '{}') into v_open
  from public.lessons l
  where l.center_id = p_center_id and l.teacher_membership_id = v_me and l.status <> 'cancelled'
    and l.ends_at < now() and l.ends_at + make_interval(hours => v_hours) > now();

  with stats as (select * from public.lesson_attendance_stats(v_open)),
  my_groups as (
    select g.id, g.name,
           private.group_active_students(g.id) as students,
           (select max(r.taken_on) from public.exam_results r where r.group_id = g.id) as last_score
    from public.groups g
    where g.center_id = p_center_id and g.teacher_membership_id = v_me and g.archived_at is null
      and g.status <> 'finished'
  )
  select jsonb_build_object(
    'to_mark', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'group', g.name, 'starts_at', l.starts_at, 'timezone', b.timezone,
               'closes_at', l.ends_at + make_interval(hours => v_hours),
               'expected', s.expected, 'marked', s.marked)
             order by l.starts_at)
      from stats s
      join public.lessons l on l.id = s.lesson_id
      join public.groups g on g.id = l.group_id
      join public.branches b on b.id = l.branch_id
      where s.marked < s.expected), '[]'),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'students', students, 'last_score', last_score)
                       order by name)
      from my_groups), '[]'),
    'scores_to_enter', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'last_score', last_score) order by name)
      from my_groups
      where students > 0 and (last_score is null or last_score < v_today - 30)), '[]')
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function private.dashboard_active_students(uuid, uuid[], integer), private.group_active_students(uuid) from public;
grant execute on function private.dashboard_active_students(uuid, uuid[], integer), private.group_active_students(uuid)
  to authenticated;
revoke all on function public.dashboard_owner(uuid, uuid),
                       public.dashboard_admin(uuid),
                       public.dashboard_teacher(uuid) from public, anon;
grant execute on function public.dashboard_owner(uuid, uuid),
                          public.dashboard_admin(uuid),
                          public.dashboard_teacher(uuid) to authenticated;
