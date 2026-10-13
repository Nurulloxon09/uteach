-- M5 · Leads CRM (data layer): leads, their timeline and follow-up tasks, trial lessons with guests on the
-- attendance sheet, lost reasons, and converting a lead into a student.
-- Spec: docs/spec/11-leads-crm.md, 02-data-model.md (Leads, attendance), 03-roles-permissions.md,
-- 14-attendance.md and the M5 plan in 30-milestones.md.

create type public.lead_status as enum ('new', 'contacted', 'trial_scheduled', 'trial_done', 'won', 'lost');
create type public.lead_source as enum
  ('instagram', 'telegram', 'walk_in', 'call', 'referral', 'web_form', 'meta_ads', 'other');
create type public.lead_activity_kind as enum ('note', 'call', 'status_change', 'task', 'message', 'system');
create type public.trial_status as enum ('scheduled', 'attended', 'no_show', 'cancelled');

-- ---------------------------------------------------------------------------
-- lost_reasons (seeded per center; system rows are translated by the UI through `system_key`)
-- ---------------------------------------------------------------------------
create table public.lost_reasons (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  system_key text check (system_key in ('price', 'schedule', 'location', 'competitor', 'no_response', 'other')),
  label text check (label is null or length(trim(label)) between 1 and 80),
  sort_order smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  unique (center_id, system_key),
  check (label is not null or system_key is not null)
);

create trigger lost_reasons_updated_at before update on public.lost_reasons
  for each row execute function private.set_updated_at();

create function private.seed_lost_reasons(p_center_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.lost_reasons (center_id, system_key, sort_order)
  select p_center_id, k, o::smallint
  from unnest(array['price', 'schedule', 'location', 'competitor', 'no_response', 'other']) with ordinality u (k, o)
  on conflict (center_id, system_key) do nothing;
$$;

create function private.center_lost_reasons()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_lost_reasons(new.id);
  return null;
end;
$$;

create trigger centers_lost_reasons after insert on public.centers
  for each row execute function private.center_lost_reasons();

select private.seed_lost_reasons(c.id) from public.centers c;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  telegram_username text check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),
  source public.lead_source not null default 'other',
  source_detail text check (source_detail is null or length(source_detail) <= 200),
  status public.lead_status not null default 'new',
  goal text check (goal is null or length(goal) <= 200),
  target_score numeric(5, 1) check (target_score is null or target_score between 0 and 9999),
  current_level text check (current_level is null or length(current_level) <= 80),
  interested_course_id uuid,
  preferred_schedule text check (preferred_schedule is null or length(preferred_schedule) <= 200),
  assigned_membership_id uuid,
  next_follow_up_at timestamptz,
  lost_reason_id uuid,
  lost_note text check (lost_note is null or length(lost_note) <= 500),
  converted_student_id uuid,
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  foreign key (center_id, branch_id) references public.branches (center_id, id),
  foreign key (center_id, interested_course_id) references public.courses (center_id, id),
  foreign key (center_id, assigned_membership_id) references public.memberships (center_id, id),
  foreign key (center_id, lost_reason_id) references public.lost_reasons (center_id, id),
  foreign key (center_id, converted_student_id) references public.students (center_id, id),
  check (status <> 'lost' or lost_reason_id is not null),
  check (status <> 'won' or converted_student_id is not null)
);

create index leads_phone on public.leads (center_id, phone);
create index leads_status on public.leads (center_id, status) where archived_at is null;
create index leads_name on public.leads (center_id, private.normalize_name(full_name));

create trigger leads_updated_at before update on public.leads
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- lead_activities (the timeline; tasks are follow-ups)
-- ---------------------------------------------------------------------------
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  lead_id uuid not null,
  kind public.lead_activity_kind not null,
  body text check (body is null or length(body) <= 2000),
  call_outcome text check (call_outcome in ('reached', 'no_answer', 'call_back')),
  from_status public.lead_status,
  to_status public.lead_status,
  due_at timestamptz,
  done_at timestamptz,
  assigned_membership_id uuid,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (center_id, lead_id) references public.leads (center_id, id),
  foreign key (center_id, assigned_membership_id) references public.memberships (center_id, id),
  check ((kind = 'task') = (due_at is not null)),
  check (done_at is null or kind = 'task'),
  check (call_outcome is null or kind = 'call'),
  check ((kind = 'status_change') = (to_status is not null))
);

create index lead_activities_lead on public.lead_activities (lead_id, created_at desc);
create index lead_activities_open_tasks on public.lead_activities (center_id, assigned_membership_id, due_at)
  where kind = 'task' and done_at is null;

-- ---------------------------------------------------------------------------
-- lead_trials (a lead as a guest on one lesson)
-- ---------------------------------------------------------------------------
create table public.lead_trials (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  lead_id uuid not null,
  lesson_id uuid not null,
  status public.trial_status not null default 'scheduled',
  feedback text check (feedback is null or length(feedback) <= 1000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, lesson_id),
  unique (center_id, lesson_id, id),
  foreign key (center_id, lead_id) references public.leads (center_id, id),
  -- Regeneration deletes only lessons without live trials; cancelled ones go with the lesson.
  foreign key (center_id, lesson_id) references public.lessons (center_id, id) on delete cascade
);

-- One open trial per lead.
create unique index lead_trials_open on public.lead_trials (lead_id) where status = 'scheduled';
create index lead_trials_lesson on public.lead_trials (lesson_id);

create trigger lead_trials_updated_at before update on public.lead_trials
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- attendance: trial guests (the M2 note in 02)
-- ---------------------------------------------------------------------------
alter table public.attendance
  alter column student_id drop not null,
  alter column enrollment_id drop not null,
  add column lead_trial_id uuid,
  add constraint attendance_lesson_trial_key unique (lesson_id, lead_trial_id),
  add constraint attendance_trial_fkey foreign key (center_id, lesson_id, lead_trial_id)
    references public.lead_trials (center_id, lesson_id, id),
  add constraint attendance_student_or_guest check (num_nonnulls(student_id, lead_trial_id) = 1),
  add constraint attendance_student_enrollment check ((student_id is null) = (enrollment_id is null));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Owner, or an admin of the branch with the `leads` flag (02: PERM(leads) and ADM(branch)).
create function private.can_lead(p_center_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_branch_admin(p_center_id, p_branch_id) and private.has_perm(p_center_id, 'leads');
$$;

create function private.lead_branch(p_lead_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.branch_id from public.leads l where l.id = p_lead_id;
$$;

-- The pipeline's moves (11, M5 plan). Mirrors `canMoveLead` in packages/core/leads (parity-tested).
-- Open statuses move freely between themselves (trial_scheduled only through schedule_trial) and to lost;
-- lost reopens to new or contacted; won comes only from convert_lead and is final.
create function private.lead_move_allowed(p_from public.lead_status, p_to public.lead_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then false
    when p_to in ('won', 'trial_scheduled') then false
    when p_from = 'won' then false
    when p_from = 'lost' then p_to in ('new', 'contacted')
    else true
  end;
$$;

-- An assignee is an active or invited owner/admin of the center.
create function private.check_lead_assignee(p_center_id uuid, p_membership_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_membership_id is not null and not exists (
    select 1 from public.memberships m
    where m.id = p_membership_id and m.center_id = p_center_id
      and m.role in ('owner', 'admin') and m.status in ('active', 'invited')
  ) then
    raise exception 'invalid_assignee';
  end if;
end;
$$;

create function private.leads_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.assigned_membership_id is distinct from old.assigned_membership_id then
    perform private.check_lead_assignee(new.center_id, new.assigned_membership_id);
  end if;
  return new;
end;
$$;

create trigger leads_check_assignee before insert or update of assigned_membership_id on public.leads
  for each row execute function private.leads_check_assignee();

-- Writes one timeline row (security definer callers only).
create function private.lead_log(
  p_lead public.leads,
  p_kind public.lead_activity_kind,
  p_body text default null,
  p_from public.lead_status default null,
  p_to public.lead_status default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.lead_activities (center_id, lead_id, kind, body, from_status, to_status, created_by)
  values (p_lead.center_id, p_lead.id, p_kind, p_body, p_from, p_to, auth.uid());
$$;

-- Sets the status and logs the move. Leaving trial_scheduled settles the open trial: attended when the lead
-- goes to trial_done, cancelled otherwise. Callers check permissions and the transition.
create function private.set_lead_status(
  p_lead public.leads,
  p_to public.lead_status,
  p_lost_reason_id uuid default null,
  p_lost_note text default null,
  p_student_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lead.status = 'trial_scheduled' and p_to <> 'trial_scheduled' then
    update public.lead_trials t
    set status = case when p_to = 'trial_done' then 'attended'::public.trial_status else 'cancelled' end
    where t.lead_id = p_lead.id and t.status = 'scheduled';
  end if;
  update public.leads
  set status = p_to,
      lost_reason_id = case when p_to = 'lost' then p_lost_reason_id end,
      lost_note = case when p_to = 'lost' then nullif(trim(p_lost_note), '') end,
      converted_student_id = case when p_to = 'won' then p_student_id else converted_student_id end
  where id = p_lead.id;
  perform private.lead_log(p_lead, 'status_change', null, p_lead.status, p_to);
end;
$$;

-- A lead the caller may change: visible, not archived, center writable.
create function private.lead_for_edit(p_lead_id uuid)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select l.* into v_lead from public.leads l where l.id = p_lead_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(private.can_lead(v_lead.center_id, v_lead.branch_id));
  perform private.require_writable(v_lead.center_id);
  if v_lead.archived_at is not null then
    raise exception 'lead_archived';
  end if;
  return v_lead;
end;
$$;

-- leads.next_follow_up_at = the earliest open task (11).
create function private.refresh_follow_up(p_lead_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.leads l
  set next_follow_up_at = (
    select min(a.due_at) from public.lead_activities a
    where a.lead_id = l.id and a.kind = 'task' and a.done_at is null
  )
  where l.id = p_lead_id;
$$;

create function private.lead_activities_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.kind = 'task' then
    perform private.refresh_follow_up(old.lead_id);
  end if;
  if tg_op <> 'DELETE' and new.kind = 'task' and (tg_op = 'INSERT' or new.lead_id <> old.lead_id
     or new.done_at is distinct from old.done_at or new.due_at is distinct from old.due_at) then
    perform private.refresh_follow_up(new.lead_id);
  end if;
  return null;
end;
$$;

create trigger lead_activities_follow_up after insert or update or delete on public.lead_activities
  for each row execute function private.lead_activities_follow_up();

-- A cancelled lesson cancels its open trials; a lead left without one goes back to contacted.
create function private.lessons_cancel_trials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.lead_trials;
  v_lead public.leads;
begin
  for v_trial in
    update public.lead_trials t set status = 'cancelled'
    where t.lesson_id = new.id and t.status = 'scheduled'
    returning t.*
  loop
    select l.* into v_lead from public.leads l where l.id = v_trial.lead_id;
    perform private.lead_log(v_lead, 'system', format('lesson_cancelled:%s', new.id));
    if v_lead.status = 'trial_scheduled' then
      perform private.set_lead_status(v_lead, 'contacted');
    end if;
  end loop;
  return null;
end;
$$;

create trigger lessons_cancel_trials after update of status on public.lessons
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.lessons_cancel_trials();

-- Regeneration never deletes a lesson with attendance or a live (not cancelled) trial.
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
    and not exists (select 1 from public.attendance a where a.lesson_id = l.id)
    and not exists (select 1 from public.lead_trials t where t.lesson_id = l.id and t.status <> 'cancelled');
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lost_reasons enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.lead_trials enable row level security;

create policy lost_reasons_select on public.lost_reasons
  for select to authenticated using (private.is_member(center_id));
create policy lost_reasons_insert on public.lost_reasons
  for insert to authenticated
  with check (private.has_perm(center_id, 'settings') and private.center_writable(center_id));
create policy lost_reasons_update on public.lost_reasons
  for update to authenticated
  using (private.has_perm(center_id, 'settings') and private.center_writable(center_id))
  with check (private.has_perm(center_id, 'settings') and private.center_writable(center_id));

-- Leads: owners and branch admins with `leads`. Teachers: none (guests reach them through the sheet).
-- Inserts and status changes go through RPCs; plain fields are updated directly.
create policy leads_select on public.leads
  for select to authenticated using (private.can_lead(center_id, branch_id));
create policy leads_update on public.leads
  for update to authenticated
  using (private.can_lead(center_id, branch_id) and private.center_writable(center_id))
  with check (private.can_lead(center_id, branch_id) and private.center_writable(center_id));

create policy lead_activities_select on public.lead_activities
  for select to authenticated using (private.can_lead(center_id, private.lead_branch(lead_id)));

create policy lead_trials_select on public.lead_trials
  for select to authenticated using (private.can_lead(center_id, private.lead_branch(lead_id)));

revoke all on public.lost_reasons, public.leads, public.lead_activities, public.lead_trials from anon, authenticated;
grant select on public.lost_reasons, public.leads, public.lead_activities, public.lead_trials to authenticated;
grant insert (center_id, label, sort_order) on public.lost_reasons to authenticated;
grant update (label, sort_order, archived_at) on public.lost_reasons to authenticated;
grant update (
  branch_id, full_name, phone, telegram_username, source, source_detail, goal, target_score, current_level,
  interested_course_id, preferred_schedule, assigned_membership_id, archived_at
) on public.leads to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs: leads and the timeline
-- ---------------------------------------------------------------------------
-- New lead (status new) with a `system` "created" row and an optional first note. The assignee defaults
-- to the caller.
create function public.create_lead(
  p_branch_id uuid,
  p_full_name text,
  p_phone text default null,
  p_source public.lead_source default 'other',
  p_source_detail text default null,
  p_goal text default null,
  p_target_score numeric default null,
  p_current_level text default null,
  p_interested_course_id uuid default null,
  p_preferred_schedule text default null,
  p_assigned_membership_id uuid default null,
  p_telegram_username text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center uuid;
  v_lead public.leads;
begin
  select b.center_id into v_center from public.branches b where b.id = p_branch_id and b.archived_at is null;
  if not found then
    raise exception 'invalid_branch';
  end if;
  perform private.require(private.can_lead(v_center, p_branch_id));
  perform private.require_writable(v_center);
  if length(p_note) > 2000 then
    raise exception 'invalid_lead';
  end if;

  begin
    insert into public.leads (
      center_id, branch_id, full_name, phone, telegram_username, source, source_detail, goal, target_score,
      current_level, interested_course_id, preferred_schedule, assigned_membership_id, created_by
    )
    values (
      v_center, p_branch_id, trim(p_full_name), nullif(trim(p_phone), ''),
      nullif(ltrim(trim(p_telegram_username), '@'), ''), coalesce(p_source, 'other'),
      nullif(trim(p_source_detail), ''), nullif(trim(p_goal), ''), p_target_score, nullif(trim(p_current_level), ''),
      p_interested_course_id, nullif(trim(p_preferred_schedule), ''),
      coalesce(p_assigned_membership_id, private.my_membership_id(v_center)), auth.uid()
    )
    returning * into v_lead;
  exception
    when check_violation or foreign_key_violation or not_null_violation then
      raise exception 'invalid_lead';
  end;

  perform private.lead_log(v_lead, 'system', 'created');
  if nullif(trim(p_note), '') is not null then
    perform private.lead_log(v_lead, 'note', trim(p_note));
  end if;
  return v_lead.id;
end;
$$;

-- Moves a lead along the pipeline (11). `lost` needs a reason of the center; `won` and `trial_scheduled`
-- have their own RPCs.
create function public.move_lead(
  p_lead_id uuid,
  p_to public.lead_status,
  p_lost_reason_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  v_lead := private.lead_for_edit(p_lead_id);
  if p_to = 'trial_scheduled' and v_lead.status <> 'trial_scheduled' then
    raise exception 'trial_required';
  end if;
  if not private.lead_move_allowed(v_lead.status, p_to) then
    raise exception 'invalid_lead_move';
  end if;
  if p_to = 'lost' then
    if p_lost_reason_id is null then
      raise exception 'lost_reason_required';
    end if;
    if not exists (
      select 1 from public.lost_reasons r
      where r.id = p_lost_reason_id and r.center_id = v_lead.center_id and r.archived_at is null
    ) then
      raise exception 'lost_reason_required';
    end if;
    if length(p_note) > 500 then
      raise exception 'invalid_lead';
    end if;
  end if;
  perform private.set_lead_status(v_lead, p_to, p_lost_reason_id, p_note);
end;
$$;

-- A note, a call (with outcome) or a follow-up task (due date, assignee: the caller by default).
create function public.add_lead_activity(
  p_lead_id uuid,
  p_kind public.lead_activity_kind,
  p_body text default null,
  p_call_outcome text default null,
  p_due_at timestamptz default null,
  p_assigned_membership_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_assignee uuid;
  v_id uuid;
begin
  v_lead := private.lead_for_edit(p_lead_id);
  if p_kind not in ('note', 'call', 'task')
     or (p_kind = 'note' and nullif(trim(p_body), '') is null)
     or (p_kind = 'call' and p_call_outcome is null)
     or (p_kind = 'task' and p_due_at is null)
     or (p_kind <> 'call' and p_call_outcome is not null)
     or (p_kind <> 'task' and (p_due_at is not null or p_assigned_membership_id is not null)) then
    raise exception 'invalid_activity';
  end if;
  if p_kind = 'task' then
    v_assignee := coalesce(p_assigned_membership_id, private.my_membership_id(v_lead.center_id));
    perform private.check_lead_assignee(v_lead.center_id, v_assignee);
  end if;
  begin
    insert into public.lead_activities (
      center_id, lead_id, kind, body, call_outcome, due_at, assigned_membership_id, created_by
    )
    values (
      v_lead.center_id, v_lead.id, p_kind, nullif(trim(p_body), ''), p_call_outcome, p_due_at, v_assignee, auth.uid()
    )
    returning id into v_id;
  exception
    when check_violation then
      raise exception 'invalid_activity';
  end;
  return v_id;
end;
$$;

-- Ticks a follow-up task done (or open again).
create function public.complete_lead_task(p_activity_id uuid, p_done boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.lead_activities;
begin
  select a.* into v_task from public.lead_activities a where a.id = p_activity_id;
  if not found or v_task.kind <> 'task' then
    raise exception 'not_found';
  end if;
  perform private.lead_for_edit(v_task.lead_id);
  update public.lead_activities
  set done_at = case when coalesce(p_done, true) then coalesce(done_at, now()) end
  where id = p_activity_id;
end;
$$;

-- Possible duplicates of a phone in the caller's branches (11): leads, students, and the students of a
-- guardian with that phone. Warns only; never blocks.
create function public.lead_duplicates(p_center_id uuid, p_phone text, p_exclude_lead_id uuid default null)
returns table (
  kind text,
  lead_id uuid,
  student_id uuid,
  full_name text,
  lead_status public.lead_status,
  is_archived boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_branches uuid[];
begin
  perform private.require(private.is_staff_admin(p_center_id) and private.has_perm(p_center_id, 'leads'));
  if nullif(trim(p_phone), '') is null then
    return;
  end if;
  v_branches := private.my_branch_ids(p_center_id);
  return query
  select 'lead', l.id, l.converted_student_id, l.full_name, l.status, l.archived_at is not null
  from public.leads l
  where l.center_id = p_center_id and l.phone = trim(p_phone) and l.branch_id = any (v_branches)
    and l.id is distinct from p_exclude_lead_id
  union all
  select 'student', null, s.id, s.full_name, null, s.archived_at is not null
  from public.students s
  where s.center_id = p_center_id and s.phone = trim(p_phone) and s.branch_id = any (v_branches)
  union all
  select 'guardian', null, s.id, s.full_name, null, s.archived_at is not null
  from public.guardians g
  join public.student_guardians sg on sg.guardian_id = g.id
  join public.students s on s.id = sg.student_id
  where g.center_id = p_center_id and g.phone = trim(p_phone) and s.branch_id = any (v_branches)
    and s.phone is distinct from trim(p_phone)
  order by 1, 4;
end;
$$;

-- Merges p_source into p_target (11): the timeline and trials move, the target's empty fields are filled
-- from the source, and the source is archived. A won lead can't be merged away.
create function public.merge_leads(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.leads;
  v_target public.leads;
begin
  if p_source_id = p_target_id then
    raise exception 'merge_same_lead';
  end if;
  v_source := private.lead_for_edit(p_source_id);
  v_target := private.lead_for_edit(p_target_id);
  if v_source.center_id <> v_target.center_id then
    raise exception 'not_found';
  end if;
  if v_source.status = 'won' then
    raise exception 'lead_closed';
  end if;

  -- The target keeps its own open trial; the source's one is cancelled. Trials on the same lesson stay put.
  if exists (select 1 from public.lead_trials t where t.lead_id = p_target_id and t.status = 'scheduled') then
    update public.lead_trials set status = 'cancelled' where lead_id = p_source_id and status = 'scheduled';
  end if;
  update public.lead_trials t set lead_id = p_target_id
  where t.lead_id = p_source_id
    and not exists (select 1 from public.lead_trials x where x.lead_id = p_target_id and x.lesson_id = t.lesson_id);
  update public.lead_activities set lead_id = p_target_id where lead_id = p_source_id;

  update public.leads t
  set phone = coalesce(t.phone, v_source.phone),
      telegram_username = coalesce(t.telegram_username, v_source.telegram_username),
      source_detail = coalesce(t.source_detail, v_source.source_detail),
      goal = coalesce(t.goal, v_source.goal),
      target_score = coalesce(t.target_score, v_source.target_score),
      current_level = coalesce(t.current_level, v_source.current_level),
      interested_course_id = coalesce(t.interested_course_id, v_source.interested_course_id),
      preferred_schedule = coalesce(t.preferred_schedule, v_source.preferred_schedule),
      assigned_membership_id = coalesce(t.assigned_membership_id, v_source.assigned_membership_id)
  where t.id = p_target_id;
  update public.leads set archived_at = now() where id = p_source_id;
  perform private.lead_log(v_target, 'system', format('merged:%s', p_source_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: trials
-- ---------------------------------------------------------------------------
-- Puts the lead on an upcoming lesson as a guest and moves it to trial_scheduled. An open trial elsewhere is
-- cancelled first (reschedule).
create function public.schedule_trial(p_lead_id uuid, p_lesson_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_lesson public.lessons;
  v_id uuid;
begin
  v_lead := private.lead_for_edit(p_lead_id);
  if v_lead.status in ('won', 'lost') then
    raise exception 'lead_closed';
  end if;
  select l.* into v_lesson from public.lessons l where l.id = p_lesson_id and l.center_id = v_lead.center_id;
  if not found or not private.has_branch(v_lesson.center_id, v_lesson.branch_id) then
    raise exception 'not_found';
  end if;
  if v_lesson.status <> 'scheduled' or v_lesson.starts_at <= now() then
    raise exception 'lesson_not_upcoming';
  end if;

  update public.lead_trials set status = 'cancelled'
  where lead_id = p_lead_id and status = 'scheduled' and lesson_id <> p_lesson_id;
  insert into public.lead_trials (center_id, lead_id, lesson_id, created_by)
  values (v_lead.center_id, p_lead_id, p_lesson_id, auth.uid())
  on conflict (lead_id, lesson_id) do update set status = 'scheduled', feedback = null
  returning id into v_id;

  perform private.lead_log(v_lead, 'system', format('trial_scheduled:%s', p_lesson_id));
  if v_lead.status <> 'trial_scheduled' then
    update public.leads set status = 'trial_scheduled' where id = p_lead_id;
    perform private.lead_log(v_lead, 'status_change', null, v_lead.status, 'trial_scheduled');
  end if;
  return v_id;
end;
$$;

-- Cancels an open trial; a lead left without one goes back to contacted.
create function public.cancel_trial(p_trial_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.lead_trials;
  v_lead public.leads;
begin
  select t.* into v_trial from public.lead_trials t where t.id = p_trial_id;
  if not found then
    raise exception 'not_found';
  end if;
  v_lead := private.lead_for_edit(v_trial.lead_id);
  if v_trial.status <> 'scheduled' then
    raise exception 'trial_not_open';
  end if;
  update public.lead_trials set status = 'cancelled' where id = p_trial_id;
  perform private.lead_log(v_lead, 'system', format('trial_cancelled:%s', v_trial.lesson_id));
  if v_lead.status = 'trial_scheduled' then
    perform private.set_lead_status(v_lead, 'contacted');
  end if;
end;
$$;

-- The teacher's (or an admin's) note about a trial guest. The lesson's teacher inside the edit window, or an
-- admin who may mark the lesson or has `leads`.
create function public.save_trial_feedback(p_trial_id uuid, p_feedback text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.lead_trials;
  v_lesson public.lessons;
  v_mode text;
begin
  select t.* into v_trial from public.lead_trials t where t.id = p_trial_id;
  if not found then
    raise exception 'not_found';
  end if;
  select l.* into v_lesson from public.lessons l where l.id = v_trial.lesson_id;
  perform private.require_writable(v_lesson.center_id);
  v_mode := private.attendance_mode(v_lesson);
  if not (v_mode in ('admin', 'teacher') or private.can_lead(v_lesson.center_id, v_lesson.branch_id)) then
    if v_mode = 'closed' then
      raise exception 'attendance_window_closed';
    elsif v_mode = 'too_early' then
      raise exception 'attendance_too_early';
    end if;
    perform private.require(false);
  end if;
  if length(p_feedback) > 1000 then
    raise exception 'invalid_attendance';
  end if;
  update public.lead_trials set feedback = nullif(trim(p_feedback), '') where id = p_trial_id;
end;
$$;

-- Records a guest's mark from save_attendance (14, M5 plan): present/late → trial attended and the lead
-- moves to trial_done; absent/excused → no_show (and a lead already in trial_done goes back).
create function private.mark_trial(p_trial_id uuid, p_status public.attendance_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.lead_trials;
  v_lead public.leads;
  v_to public.trial_status := case when p_status in ('present', 'late') then 'attended' else 'no_show' end;
begin
  select t.* into v_trial from public.lead_trials t where t.id = p_trial_id for update;
  if v_trial.status = v_to then
    return;
  end if;
  update public.lead_trials set status = v_to where id = p_trial_id;
  select l.* into v_lead from public.leads l where l.id = v_trial.lead_id for update;
  perform private.lead_log(
    v_lead, 'system',
    format('%s:%s', case v_to when 'attended' then 'trial_attended' else 'trial_no_show' end, v_trial.lesson_id)
  );
  if v_to = 'attended' and v_lead.status = 'trial_scheduled' then
    update public.leads set status = 'trial_done' where id = v_lead.id;
    perform private.lead_log(v_lead, 'status_change', null, 'trial_scheduled', 'trial_done');
  elsif v_to = 'no_show' and v_lead.status = 'trial_done' and v_trial.status = 'attended' then
    update public.leads set status = 'trial_scheduled' where id = v_lead.id;
    perform private.lead_log(v_lead, 'status_change', null, 'trial_done', 'trial_scheduled');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: convert
-- ---------------------------------------------------------------------------
-- Converts a lead in one transaction (11): creates the student (or re-uses p_student_id), links the
-- guardian by phone when given, enrolls into the group (the first cycle charge comes with it), and sets the
-- lead `won`. Returns {studentId, enrollmentId, guardianId, linkedExistingGuardian}.
create function public.convert_lead(
  p_lead_id uuid,
  p_group_id uuid,
  p_start_date date default null,
  p_student_id uuid default null,
  p_student_name text default null,
  p_student_phone text default null,
  p_guardian_name text default null,
  p_guardian_phone text default null,
  p_guardian_relation text default 'parent',
  p_discount_bp integer default 0,
  p_discount_amount bigint default 0,
  p_discount_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_student public.students;
  v_enrollment uuid;
  v_guardian jsonb;
begin
  v_lead := private.lead_for_edit(p_lead_id);
  if v_lead.status in ('won', 'lost') then
    raise exception 'lead_closed';
  end if;
  perform private.require(
    private.has_perm(v_lead.center_id, 'students') and private.has_branch(v_lead.center_id, v_lead.branch_id)
  );

  if p_student_id is not null then
    select s.* into v_student from public.students s
    where s.id = p_student_id and s.center_id = v_lead.center_id and s.archived_at is null;
    if not found or not private.has_branch(v_student.center_id, v_student.branch_id) then
      raise exception 'not_found';
    end if;
  else
    begin
      insert into public.students (center_id, branch_id, full_name, phone)
      values (
        v_lead.center_id, v_lead.branch_id, trim(coalesce(nullif(trim(p_student_name), ''), v_lead.full_name)),
        nullif(trim(p_student_phone), '')
      )
      returning * into v_student;
    exception
      when check_violation then
        raise exception 'invalid_lead';
    end;
  end if;

  if nullif(trim(p_guardian_phone), '') is not null then
    if nullif(trim(p_guardian_name), '') is null then
      raise exception 'invalid_lead';
    end if;
    begin
      v_guardian := public.upsert_guardian(
        v_student.id, p_guardian_name, trim(p_guardian_phone), coalesce(p_guardian_relation, 'parent'),
        not exists (select 1 from public.student_guardians sg where sg.student_id = v_student.id and sg.is_primary)
      );
    exception
      when check_violation then
        raise exception 'invalid_lead';
    end;
  end if;

  v_enrollment := public.enroll(
    v_student.id, p_group_id, p_start_date, p_discount_bp, p_discount_amount, p_discount_reason
  );

  perform private.set_lead_status(v_lead, 'won', null, null, v_student.id);
  perform private.lead_log(v_lead, 'system', format('converted:%s', v_student.id));
  return jsonb_build_object(
    'studentId', v_student.id,
    'enrollmentId', v_enrollment,
    'guardianId', v_guardian ->> 'guardianId',
    'linkedExistingGuardian', coalesce((v_guardian ->> 'linkedExisting')::boolean, false)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Home "My follow-ups"
-- ---------------------------------------------------------------------------
-- The caller's open tasks due by the end of today (center timezone), oldest first.
create function public.my_follow_ups(p_center_id uuid)
returns table (
  activity_id uuid,
  lead_id uuid,
  lead_name text,
  phone text,
  lead_status public.lead_status,
  body text,
  due_at timestamptz,
  is_overdue boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_until timestamptz;
begin
  perform private.require(private.is_staff_admin(p_center_id) and private.has_perm(p_center_id, 'leads'));
  select c.timezone into v_tz from public.centers c where c.id = p_center_id;
  v_until := ((private.today_in(v_tz) + 1)::timestamp) at time zone v_tz;
  return query
  select a.id, l.id, l.full_name, l.phone, l.status, a.body, a.due_at, a.due_at < now()
  from public.lead_activities a
  join public.leads l on l.id = a.lead_id
  where a.center_id = p_center_id and a.kind = 'task' and a.done_at is null
    and a.assigned_membership_id = private.my_membership_id(p_center_id)
    and a.due_at < v_until
    and l.archived_at is null
    and private.can_lead(l.center_id, l.branch_id)
  order by a.due_at
  limit 50;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance: guests on the sheet
-- ---------------------------------------------------------------------------
drop function public.attendance_sheet(uuid);

-- The sheet's rows: expected students plus anyone already marked (e.g. after a backdated end), then trial
-- guests (name only) whose trial isn't cancelled or who already have a mark.
create function public.attendance_sheet(p_lesson_id uuid)
returns table (
  student_id uuid,
  full_name text,
  enrollment_id uuid,
  is_expected boolean,
  status public.attendance_status,
  late_minutes smallint,
  note text,
  marked_at timestamptz,
  lead_trial_id uuid,
  trial_feedback text
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
    select a.* from public.attendance a where a.lesson_id = p_lesson_id and a.student_id is not null
  ),
  rows as (
    select s.id as sid, s.full_name as name, coalesce(ex.enrollment_id, mk.enrollment_id) as eid,
           ex.student_id is not null as expected, mk.status as st, mk.late_minutes as late, mk.note as nt,
           mk.marked_at as at, null::uuid as tid, null::text as fb
    from ex
    full join mk on mk.student_id = ex.student_id
    join public.students s on s.id = coalesce(ex.student_id, mk.student_id)
    union all
    select null::uuid, ld.full_name, null::uuid, t.status <> 'cancelled', a.status, a.late_minutes, a.note,
           a.marked_at, t.id, t.feedback
    from public.lead_trials t
    join public.leads ld on ld.id = t.lead_id
    left join public.attendance a on a.lesson_id = p_lesson_id and a.lead_trial_id = t.id
    where t.lesson_id = p_lesson_id and (t.status <> 'cancelled' or a.id is not null)
  )
  select r.sid, r.name, r.eid, r.expected, r.st, r.late, r.nt, r.at, r.tid, r.fb
  from rows r
  order by r.tid is not null, private.normalize_name(r.name), coalesce(r.sid, r.tid);
end;
$$;

-- Saves the sheet in one transaction (14): rows = [{studentId | leadTrialId, status, lateMinutes?, note?}];
-- p_topic null leaves the topic alone. The first save sets the lesson `held`. Inside the teacher window
-- absent (and, if the center wants it, late) marks queue alerts and changing them cancels the pending ones;
-- after the window only admins get here, their edits are audited and nobody is messaged. Guest rows move
-- the trial and the lead (mark_trial) and never alert. Returns {saved, alerts, held}.
create or replace function public.save_attendance(p_lesson_id uuid, p_rows jsonb, p_topic text default null)
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
  v_trial uuid;
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
      v_trial := (v_row ->> 'leadTrialId')::uuid;
      v_status := (v_row ->> 'status')::public.attendance_status;
      v_late := (v_row ->> 'lateMinutes')::smallint;
    exception when others then
      raise exception 'invalid_attendance';
    end;
    v_note := nullif(trim(v_row ->> 'note'), '');
    if num_nonnulls(v_student, v_trial) <> 1 or v_status is null or length(v_note) > 500
       or (v_status = 'late' and v_late is not null and v_late not between 1 and 240) then
      raise exception 'invalid_attendance';
    end if;
    if v_status <> 'late' then
      v_late := null;
    end if;

    if v_trial is not null then
      select a.* into v_old from public.attendance a
      where a.lesson_id = p_lesson_id and a.lead_trial_id = v_trial
      for update;
      if v_old.id is null and not exists (
        select 1 from public.lead_trials t where t.id = v_trial and t.lesson_id = p_lesson_id and t.status <> 'cancelled'
      ) then
        raise exception 'student_not_expected';
      end if;
    else
      select a.* into v_old from public.attendance a
      where a.lesson_id = p_lesson_id and a.student_id = v_student
      for update;
      if v_old.id is null and not (v_expected ? v_student::text) then
        raise exception 'student_not_expected';
      end if;
    end if;

    if v_old.id is null then
      insert into public.attendance (
        center_id, group_id, lesson_id, student_id, enrollment_id, lead_trial_id, status, late_minutes, note,
        marked_by
      )
      values (
        v_lesson.center_id, v_lesson.group_id, p_lesson_id, v_student, (v_expected ->> v_student::text)::uuid,
        v_trial, v_status, v_late, v_note, auth.uid()
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

    if v_trial is not null then
      perform private.mark_trial(v_trial, v_status);
      continue;
    end if;

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

-- Per-lesson counts leave guests out.
create or replace function public.lesson_attendance_stats(p_lesson_ids uuid[])
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
  left join public.attendance a on a.lesson_id = l.id and a.student_id is not null
  where l.id = any (p_lesson_ids)
    and (
      private.is_branch_admin(l.center_id, l.branch_id)
      or l.teacher_membership_id = private.my_membership_id(l.center_id)
      or private.teaches_group(l.group_id)
    )
  group by l.id;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function
  public.create_lead(uuid, text, text, public.lead_source, text, text, numeric, text, uuid, text, uuid, text, text),
  public.move_lead(uuid, public.lead_status, uuid, text),
  public.add_lead_activity(uuid, public.lead_activity_kind, text, text, timestamptz, uuid),
  public.complete_lead_task(uuid, boolean),
  public.lead_duplicates(uuid, text, uuid),
  public.merge_leads(uuid, uuid),
  public.schedule_trial(uuid, uuid),
  public.cancel_trial(uuid),
  public.save_trial_feedback(uuid, text),
  public.convert_lead(uuid, uuid, date, uuid, text, text, text, text, text, integer, bigint, text),
  public.my_follow_ups(uuid),
  public.attendance_sheet(uuid)
from public, anon;

grant execute on function
  public.create_lead(uuid, text, text, public.lead_source, text, text, numeric, text, uuid, text, uuid, text, text),
  public.move_lead(uuid, public.lead_status, uuid, text),
  public.add_lead_activity(uuid, public.lead_activity_kind, text, text, timestamptz, uuid),
  public.complete_lead_task(uuid, boolean),
  public.lead_duplicates(uuid, text, uuid),
  public.merge_leads(uuid, uuid),
  public.schedule_trial(uuid, uuid),
  public.cancel_trial(uuid),
  public.save_trial_feedback(uuid, text),
  public.convert_lead(uuid, uuid, date, uuid, text, text, text, text, text, integer, bigint, text),
  public.my_follow_ups(uuid),
  public.attendance_sheet(uuid)
to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
