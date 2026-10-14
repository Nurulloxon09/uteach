-- M7b (30-milestones M7 plan): super-admin. /admin server code uses the service role (01) and calls only the
-- `admin_*` functions below, each with the acting super-admin's profile id. They check `profiles.is_super_admin`,
-- then mark the transaction so the audit trigger writes `actor_kind = 'super_admin'` with that person.

-- ---------------------------------------------------------------------------
-- Who is acting: a super-admin (marked by private.act_as_super_admin for this transaction), a signed-in person,
-- or the system (pg_cron, the worker).
-- ---------------------------------------------------------------------------
create function private.act_as_super_admin(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null
     or not exists (select 1 from public.profiles p where p.id = p_actor and p.is_super_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('uteach.super_admin', p_actor::text, true);
end;
$$;

create function private.acting_super_admin()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('uteach.super_admin', true), '')::uuid;
$$;

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full jsonb := to_jsonb(coalesce(new, old));
  v_before jsonb;
  v_after jsonb;
  v_key text;
  v_uid uuid := auth.uid();
  v_admin uuid := private.acting_super_admin();
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - 'updated_at' - 'invite_token_hash';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - 'updated_at' - 'invite_token_hash';
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_after) loop
      if v_after -> v_key is not distinct from v_before -> v_key then
        v_after := v_after - v_key;
        v_before := v_before - v_key;
      end if;
    end loop;
    if v_after = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, row_id, before, after)
  values (
    case when tg_table_name = 'centers' then (v_full ->> 'id')::uuid else (v_full ->> 'center_id')::uuid end,
    coalesce(v_admin, v_uid),
    case when v_admin is not null then 'super_admin' when v_uid is null then 'system' else 'user' end,
    lower(tg_op),
    tg_table_name,
    (v_full ->> 'id')::uuid,
    v_before,
    v_after
  );
  return null;
end;
$$;

-- Plans are platform rows (center_id null): every change is audited too.
create trigger plans_audit after insert or update or delete on public.plans
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Centers list
-- ---------------------------------------------------------------------------
create function public.admin_centers(p_actor uuid)
returns table (
  id uuid,
  name text,
  status public.center_status,
  plan_id uuid,
  plan_name text,
  active_students integer,
  student_limit integer,
  trial_ends_at timestamptz,
  paid_until date,
  past_due_since timestamptz,
  created_at timestamptz,
  last_activity_at timestamptz,
  owner_name text,
  owner_phone text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  return query
  select c.id, c.name, c.status, c.plan_id, pl.name, private.active_student_count(c.id), pl.student_limit,
         c.trial_ends_at, c.paid_until, c.past_due_since, c.created_at,
         -- Last activity: the latest staff sign-in or staff change in the audit log.
         greatest(
           (select max(u.last_sign_in_at) from public.memberships m join auth.users u on u.id = m.profile_id
            where m.center_id = c.id and m.status = 'active'),
           (select max(a.at) from public.audit_log a where a.center_id = c.id and a.actor_kind = 'user')
         ),
         o.display_name, op.phone
  from public.centers c
  join public.plans pl on pl.id = (private.center_plan(c.id)).id
  left join lateral (
    select m.display_name, m.profile_id from public.memberships m
    where m.center_id = c.id and m.role = 'owner' and m.status = 'active'
    order by m.created_at limit 1
  ) o on true
  left join public.profiles op on op.id = o.profile_id
  where c.archived_at is null
  order by c.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Center actions
-- ---------------------------------------------------------------------------

-- Extend a trial by N days from its end (or from now, if it has ended): the center is back on `trial`.
-- Only for centers that never paid; a paying center gets an invoice instead.
create function public.admin_extend_trial(p_actor uuid, p_center_id uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_ends timestamptz;
begin
  perform private.act_as_super_admin(p_actor);
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'invalid_days';
  end if;
  select c.* into v_center from public.centers c where c.id = p_center_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_center.status not in ('trial', 'past_due', 'read_only') or v_center.paid_until is not null then
    raise exception 'invalid_status';
  end if;
  v_ends := greatest(coalesce(v_center.trial_ends_at, now()), now()) + make_interval(days => p_days);
  update public.centers
  set status = 'trial', trial_ends_at = v_ends, past_due_since = null
  where id = p_center_id;
  return v_ends;
end;
$$;

-- Change the plan whose limits apply. Prices and paid periods come from invoices.
create function public.admin_set_center_plan(p_actor uuid, p_center_id uuid, p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  if not exists (select 1 from public.plans p where p.id = p_plan_id and p.archived_at is null) then
    raise exception 'invalid_plan';
  end if;
  update public.centers set plan_id = p_plan_id where id = p_center_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Set the status by hand. The hourly machine (expire_centers) would undo a status whose dates have run out,
-- so `trial` needs a trial end in the future and `active` a paid period that hasn't ended.
create function public.admin_set_center_status(p_actor uuid, p_center_id uuid, p_status public.center_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
begin
  perform private.act_as_super_admin(p_actor);
  select c.* into v_center from public.centers c where c.id = p_center_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_center.status = p_status then
    return;
  end if;
  if (p_status = 'trial' and (v_center.trial_ends_at is null or v_center.trial_ends_at <= now()))
     or (p_status = 'active' and v_center.paid_until is not null
         and v_center.paid_until < (now() at time zone v_center.timezone)::date) then
    raise exception 'invalid_status';
  end if;
  update public.centers
  set status = p_status,
      past_due_since = case
        when p_status = 'past_due' then now()
        when p_status = 'read_only' then coalesce(v_center.past_due_since, now())
        else null
      end
  where id = p_center_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

-- New plan (p_plan_id null) or an edit. The code is fixed once created; the trial plan stays hidden.
create function public.admin_save_plan(
  p_actor uuid,
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_student_limit integer,
  p_branch_limit integer,
  p_price_amount bigint,
  p_is_public boolean,
  p_sort_order smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.act_as_super_admin(p_actor);
  if coalesce(p_price_amount, -1) < 0 or coalesce(p_student_limit, 1) < 1 or coalesce(p_branch_limit, 1) < 1
     or length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'invalid_plan';
  end if;
  if p_plan_id is null then
    if coalesce(p_code, '') !~ '^[a-z][a-z0-9_]{1,39}$' then
      raise exception 'invalid_plan';
    end if;
    insert into public.plans (code, name, student_limit, branch_limit, price_amount, is_public, sort_order)
    values (p_code, trim(p_name), p_student_limit, p_branch_limit, p_price_amount, coalesce(p_is_public, true),
            coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.plans
    set name = trim(p_name), student_limit = p_student_limit, branch_limit = p_branch_limit,
        price_amount = p_price_amount, is_public = coalesce(p_is_public, true) and code <> 'trial',
        sort_order = coalesce(p_sort_order, sort_order)
    where id = p_plan_id
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
  end if;
  return v_id;
end;
$$;

-- Hide (or bring back) a plan: it leaves the price list and the plan pickers; centers on it keep it.
create function public.admin_archive_plan(p_actor uuid, p_plan_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  if exists (select 1 from public.plans p where p.id = p_plan_id and p.code = 'trial') then
    raise exception 'plan_in_use';
  end if;
  update public.plans
  set archived_at = case when p_archived then coalesce(archived_at, now()) end
  where id = p_plan_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Delete a plan nobody has used (no center, no invoice). A plan in use can only be hidden.
create function public.admin_delete_plan(p_actor uuid, p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  if exists (select 1 from public.plans p where p.id = p_plan_id and p.code = 'trial')
     or exists (select 1 from public.centers c where c.plan_id = p_plan_id)
     or exists (select 1 from public.platform_invoices i where i.plan_id = p_plan_id) then
    raise exception 'plan_in_use';
  end if;
  delete from public.plans where id = p_plan_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- "How to pay" on owners' Subscription page: {uz, ru, en} text. Audited by hand (the key isn't a uuid).
create function public.admin_set_payment_instructions(p_actor uuid, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform private.act_as_super_admin(p_actor);
  if jsonb_typeof(p_value) <> 'object'
     or exists (select 1 from jsonb_each(p_value) e
                where e.key not in ('uz', 'ru', 'en') or jsonb_typeof(e.value) <> 'string'
                   or length(e.value #>> '{}') > 2000) then
    raise exception 'invalid_body';
  end if;
  select s.value into v_before from public.platform_settings s where s.key = 'payment_instructions';
  insert into public.platform_settings (key, value) values ('payment_instructions', p_value)
  on conflict (key) do update set value = excluded.value;
  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, before, after)
  values (null, p_actor, 'super_admin', 'update', 'platform_settings',
          jsonb_build_object('payment_instructions', v_before),
          jsonb_build_object('payment_instructions', p_value));
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoices: the list, and the M7a functions run as the super-admin so the audit log names them.
-- ---------------------------------------------------------------------------
create function public.admin_invoices(p_actor uuid)
returns table (
  id uuid,
  number text,
  center_id uuid,
  center_name text,
  plan_name text,
  period_start date,
  period_end date,
  amount bigint,
  currency char(3),
  status public.invoice_status,
  issued_at timestamptz,
  paid_at timestamptz,
  payment_note text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  return query
  select i.id, i.number, i.center_id, c.name, p.name, i.period_start, i.period_end, i.amount, i.currency, i.status,
         i.issued_at, i.paid_at, i.payment_note
  from public.platform_invoices i
  join public.centers c on c.id = i.center_id
  join public.plans p on p.id = i.plan_id
  order by i.issued_at desc nulls last, i.number desc
  limit 500;
end;
$$;

create function public.admin_issue_invoice(
  p_actor uuid,
  p_center_id uuid,
  p_plan_id uuid,
  p_period_start date,
  p_period_end date,
  p_amount bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  return public.issue_platform_invoice(p_center_id, p_plan_id, p_period_start, p_period_end, p_amount);
end;
$$;

create function public.admin_mark_invoice_paid(p_actor uuid, p_invoice_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  perform public.mark_platform_invoice_paid(p_invoice_id, p_note);
end;
$$;

create function public.admin_void_invoice(p_actor uuid, p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  perform public.void_platform_invoice(p_invoice_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Support view (03): a read-only summary of one center. Every open is written to the audit log, which the
-- center's owner can read. No student names, phones or payment details beyond amounts.
-- ---------------------------------------------------------------------------
create function public.admin_support_view(p_actor uuid, p_center_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.act_as_super_admin(p_actor);
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'not_found';
  end if;
  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, row_id)
  values (p_center_id, p_actor, 'super_admin', 'support_view', 'centers', p_center_id);

  select jsonb_build_object(
    'center', (select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'timezone', c.timezone,
                                         'default_locale', c.default_locale, 'currency', c.currency,
                                         'created_at', c.created_at)
               from public.centers c where c.id = p_center_id),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'archived', b.archived_at is not null)
                                           order by b.created_at)
                          from public.branches b where b.center_id = p_center_id), '[]'),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'role', m.role,
                                                           'status', m.status, 'last_sign_in_at', u.last_sign_in_at)
                                        order by m.role, m.display_name)
                       from public.memberships m left join auth.users u on u.id = m.profile_id
                       where m.center_id = p_center_id), '[]'),
    'students', (select jsonb_build_object(
                   'total', count(*) filter (where s.archived_at is null),
                   'active', private.active_student_count(p_center_id),
                   'archived', count(*) filter (where s.archived_at is not null))
                 from public.students s where s.center_id = p_center_id),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
                                 'name', g.name, 'status', g.status,
                                 'students', (select count(*) from public.enrollments e
                                              where e.group_id = g.id and e.status = 'active'))
                               order by g.name)
                        from public.groups g where g.center_id = p_center_id and g.archived_at is null), '[]'),
    'payments', coalesce((select jsonb_agg(x order by x ->> 'paid_at' desc) from (
                            select jsonb_build_object('paid_at', p.paid_at, 'amount', p.amount, 'method', p.method,
                                                      'voided', p.voided_at is not null) x
                            from public.payments p where p.center_id = p_center_id
                            order by p.paid_at desc limit 10) t), '[]'),
    'failed_messages', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
                                   select jsonb_build_object('at', o.updated_at, 'template', o.template_key,
                                                             'channel', o.channel, 'error', o.last_error) x
                                   from public.notification_outbox o
                                   where o.center_id = p_center_id and o.status = 'failed'
                                   order by o.updated_at desc limit 10) t), '[]'),
    'imports', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
                           select jsonb_build_object('at', j.created_at, 'kind', j.kind, 'status', j.status,
                                                     'rows', j.row_count, 'errors', j.error_count) x
                           from public.import_jobs j where j.center_id = p_center_id
                           order by j.created_at desc limit 10) t), '[]')
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Health: worker heartbeats, the outbox, SMS failures and the pg_cron jobs' last runs.
-- ---------------------------------------------------------------------------
create function public.admin_health(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := '[]';
begin
  perform private.act_as_super_admin(p_actor);
  -- pg_cron is missing in PGlite (pnpm db:test:lite); plpgsql plans this only when it runs.
  if to_regclass('cron.job') is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'job', j.jobname, 'schedule', j.schedule, 'active', j.active,
             'last_start', r.start_time, 'last_status', r.status,
             'last_message', left(r.return_message, 200))
           order by j.jobname), '[]')
    into v_cron
    from cron.job j
    left join lateral (
      select d.start_time, d.status, d.return_message from cron.job_run_details d
      where d.jobid = j.jobid order by d.start_time desc limit 1
    ) r on true;
  end if;
  return jsonb_build_object(
    'heartbeats', coalesce((select jsonb_agg(jsonb_build_object('service', h.service, 'last_beat_at', h.last_beat_at)
                                             order by h.service)
                            from public.system_heartbeats h), '[]'),
    'outbox', (select jsonb_build_object(
                 'pending', count(*) filter (where o.status in ('pending', 'sending')),
                 'due', count(*) filter (where o.status = 'pending' and o.send_after <= now()),
                 'oldest_due_at', min(o.send_after) filter (where o.status = 'pending' and o.send_after <= now()),
                 'sent_24h', count(*) filter (where o.status = 'sent' and o.sent_at > now() - interval '24 hours'),
                 'failed_24h', count(*) filter (where o.status = 'failed'
                                                  and o.updated_at > now() - interval '24 hours'),
                 'sms_failed_24h', count(*) filter (where o.status = 'failed' and o.channel = 'sms'
                                                      and o.updated_at > now() - interval '24 hours'))
               from public.notification_outbox o
               where o.status in ('pending', 'sending')
                  or o.updated_at > now() - interval '24 hours'),
    'cron', v_cron
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_centers(uuid),
                       public.admin_invoices(uuid),
                       public.admin_extend_trial(uuid, uuid, integer),
                       public.admin_set_center_plan(uuid, uuid, uuid),
                       public.admin_set_center_status(uuid, uuid, public.center_status),
                       public.admin_save_plan(uuid, uuid, text, text, integer, integer, bigint, boolean, smallint),
                       public.admin_archive_plan(uuid, uuid, boolean),
                       public.admin_delete_plan(uuid, uuid),
                       public.admin_set_payment_instructions(uuid, jsonb),
                       public.admin_issue_invoice(uuid, uuid, uuid, date, date, bigint),
                       public.admin_mark_invoice_paid(uuid, uuid, text),
                       public.admin_void_invoice(uuid, uuid),
                       public.admin_support_view(uuid, uuid),
                       public.admin_health(uuid) from public, anon, authenticated;
grant execute on function public.admin_centers(uuid),
                          public.admin_invoices(uuid),
                          public.admin_extend_trial(uuid, uuid, integer),
                          public.admin_set_center_plan(uuid, uuid, uuid),
                          public.admin_set_center_status(uuid, uuid, public.center_status),
                          public.admin_save_plan(uuid, uuid, text, text, integer, integer, bigint, boolean, smallint),
                          public.admin_archive_plan(uuid, uuid, boolean),
                          public.admin_delete_plan(uuid, uuid),
                          public.admin_set_payment_instructions(uuid, jsonb),
                          public.admin_issue_invoice(uuid, uuid, uuid, date, date, bigint),
                          public.admin_mark_invoice_paid(uuid, uuid, text),
                          public.admin_void_invoice(uuid, uuid),
                          public.admin_support_view(uuid, uuid),
                          public.admin_health(uuid) to service_role;

-- act_as_super_admin marks the transaction; nobody signed in may call it.
revoke all on function private.act_as_super_admin(uuid) from public, anon, authenticated;
grant execute on function private.act_as_super_admin(uuid) to service_role;
grant execute on function private.acting_super_admin() to authenticated, service_role;
