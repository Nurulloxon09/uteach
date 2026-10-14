-- M7a (30-milestones M7 plan): uteach plans and invoices, the center status machine (trial → past_due → read_only),
-- the read-only guard on every tenant table, and the student and branch limits.

-- ---------------------------------------------------------------------------
-- Who is writing: a signed-in person (end user) or the platform (pg_cron, the worker, the service role).
-- ---------------------------------------------------------------------------
create function private.is_end_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         in ('authenticated', 'anon');
$$;

-- ---------------------------------------------------------------------------
-- platform_settings: uteach-wide texts (payment instructions on the Subscription page).
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function private.set_updated_at();

alter table public.platform_settings enable row level security;
create policy platform_settings_select on public.platform_settings for select to authenticated using (true);
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;

-- {uz, ru, en}: how to pay a uteach invoice (bank details, Payme). Empty until the owner of uteach fills it in.
insert into public.platform_settings (key, value) values ('payment_instructions', '{}');

-- ---------------------------------------------------------------------------
-- plans (global). `trial` holds the trial limits (✅ 50 students); centers without a plan use it.
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  student_limit integer check (student_limit is null or student_limit > 0),
  branch_limit integer check (branch_limit is null or branch_limit > 0),
  price_amount bigint not null check (price_amount >= 0),
  currency char(3) not null default 'UZS',
  features jsonb not null default '{}',
  is_public boolean not null default true,
  sort_order smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

alter table public.plans enable row level security;
create policy plans_select on public.plans for select to authenticated using (true);
revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;

-- Prices are placeholders until the owner of uteach sets them in /admin (M7 plan).
insert into public.plans (code, name, student_limit, branch_limit, price_amount, is_public, sort_order) values
  ('trial', 'Trial', 50, null, 0, false, 0),
  ('starter', 'Starter', 50, 1, 30000000, true, 1),
  ('growth', 'Growth', 200, 3, 70000000, true, 2),
  ('pro', 'Pro', null, null, 150000000, true, 3);

-- ---------------------------------------------------------------------------
-- centers: plan and paid period (service role only, like status and trial_ends_at).
-- ---------------------------------------------------------------------------
alter table public.centers
  add column plan_id uuid references public.plans (id),
  add column past_due_since timestamptz,
  add column paid_until date;

-- The plan whose limits apply: the center's, else the trial limits.
create function private.center_plan(p_center_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.centers c
  join public.plans p on p.id = coalesce(c.plan_id, (select t.id from public.plans t where t.code = 'trial'))
  where c.id = p_center_id;
$$;

-- ---------------------------------------------------------------------------
-- platform_invoices: uteach billing a center (manual at launch).
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void');
create sequence public.platform_invoice_seq;

create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  plan_id uuid not null references public.plans (id),
  number text not null unique,
  period_start date not null,
  period_end date not null,
  amount bigint not null check (amount >= 0),
  currency char(3) not null,
  status public.invoice_status not null default 'issued',
  issued_at timestamptz,
  paid_at timestamptz,
  payment_note text check (payment_note is null or length(payment_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end),
  check ((status = 'paid') = (paid_at is not null))
);

create index platform_invoices_center on public.platform_invoices (center_id, period_start desc);

create trigger platform_invoices_updated_at before update on public.platform_invoices
  for each row execute function private.set_updated_at();
create trigger platform_invoices_audit after insert or update or delete on public.platform_invoices
  for each row execute function private.audit_row();

alter table public.platform_invoices enable row level security;
create policy platform_invoices_select on public.platform_invoices for select to authenticated
  using (private.is_owner(center_id));
revoke all on public.platform_invoices from anon, authenticated;
grant select on public.platform_invoices to authenticated;

-- ---------------------------------------------------------------------------
-- The status machine (10, M7 plan), mirrored by `centerStatusNext` in packages/core/subscription:
-- trial past its end → past_due (since the trial end); active past `paid_until` (center timezone) → past_due (since
-- the next midnight); past_due for 7 days → read_only. Other statuses don't move by themselves.
-- ---------------------------------------------------------------------------
create function private.center_status_next(
  p_status public.center_status,
  p_trial_ends_at timestamptz,
  p_paid_until date,
  p_past_due_since timestamptz,
  p_timezone text,
  p_now timestamptz
)
returns table (status public.center_status, past_due_since timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.center_status := p_status;
  v_since timestamptz := p_past_due_since;
begin
  if v_status = 'trial' and p_trial_ends_at is not null and p_trial_ends_at <= p_now then
    v_status := 'past_due';
    v_since := p_trial_ends_at;
  elsif v_status = 'active' and p_paid_until is not null
        and p_paid_until < (p_now at time zone p_timezone)::date then
    v_status := 'past_due';
    v_since := ((p_paid_until + 1)::timestamp at time zone p_timezone);
  end if;
  if v_status = 'past_due' then
    v_since := coalesce(v_since, p_now);
    if v_since + interval '7 days' <= p_now then
      v_status := 'read_only';
    end if;
  end if;
  return query select v_status, v_since;
end;
$$;

-- Hourly (pg_cron `expire_centers`): applies the machine to every center. Returns how many changed.
create function private.expire_centers(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with next as (
    select c.id, x.status, x.past_due_since
    from public.centers c
    cross join lateral private.center_status_next(c.status, c.trial_ends_at, c.paid_until, c.past_due_since,
                                                  c.timezone, p_now) x
    where c.status in ('trial', 'active', 'past_due') and c.archived_at is null
  )
  update public.centers c
  set status = next.status, past_due_since = next.past_due_since
  from next
  where c.id = next.id
    and (c.status is distinct from next.status or c.past_due_since is distinct from next.past_due_since);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoices (service role only; the /admin screens in M7b call them).
-- ---------------------------------------------------------------------------
create function public.issue_platform_invoice(
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
declare
  v_plan public.plans;
  v_id uuid;
begin
  select p.* into v_plan from public.plans p where p.id = p_plan_id and p.code <> 'trial';
  if not found or not exists (select 1 from public.centers c where c.id = p_center_id) then
    raise exception 'not_found';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start
     or coalesce(p_amount, 0) < 0 then
    raise exception 'invalid_invoice';
  end if;
  insert into public.platform_invoices (center_id, plan_id, number, period_start, period_end, amount, currency,
                                        status, issued_at)
  values (p_center_id, p_plan_id,
          format('UT-%s-%s', to_char(now(), 'YYYY'), lpad(nextval('public.platform_invoice_seq')::text, 6, '0')),
          p_period_start, p_period_end, coalesce(p_amount, v_plan.price_amount), v_plan.currency, 'issued', now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Paid → the center is `active` on the invoice's plan, paid through the period end.
create function public.mark_platform_invoice_paid(p_invoice_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.platform_invoices;
begin
  select i.* into v_invoice from public.platform_invoices i where i.id = p_invoice_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'invalid_invoice';
  end if;
  update public.platform_invoices
  set status = 'paid', paid_at = now(), payment_note = nullif(trim(p_note), '')
  where id = p_invoice_id;
  update public.centers
  set status = 'active', plan_id = v_invoice.plan_id, past_due_since = null,
      paid_until = greatest(coalesce(paid_until, v_invoice.period_end), v_invoice.period_end)
  where id = v_invoice.center_id;
end;
$$;

create function public.void_platform_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.platform_invoices set status = 'void' where id = p_invoice_id and status in ('draft', 'issued');
  if not found then
    raise exception 'invalid_invoice';
  end if;
end;
$$;

revoke all on function public.issue_platform_invoice(uuid, uuid, date, date, bigint),
                       public.mark_platform_invoice_paid(uuid, text),
                       public.void_platform_invoice(uuid) from public, anon, authenticated;
grant execute on function public.issue_platform_invoice(uuid, uuid, date, date, bigint),
                          public.mark_platform_invoice_paid(uuid, text),
                          public.void_platform_invoice(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Read-only guard (02, M7 plan): before any end-user write on a tenant row of a `read_only` / `cancelled`
-- center. Security definer RPCs bypass RLS, so the check lives on the tables. Platform writers pass.
-- ---------------------------------------------------------------------------
create function private.guard_center_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_center uuid;
begin
  -- A new center (create_center) has nothing to guard yet.
  if not private.is_end_user() or (tg_table_name = 'centers' and tg_op = 'INSERT') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_center := (v_row ->> case when tg_table_name = 'centers' then 'id' else 'center_id' end)::uuid;
  if v_center is not null and not private.center_writable(v_center) then
    raise exception 'center_read_only' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Every table with a center_id, plus centers. Named so it runs before the tables' other before-triggers.
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'center_id' and x.table_type = 'BASE TABLE'
    union select 'centers'
  loop
    execute format(
      'create trigger a_center_writable before insert or update or delete on public.%I
         for each row execute function private.guard_center_writes()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Limits (10): active students = students with an active enrollment. An end user can't add the student who
-- would be one over the plan's limit; a student who is already active can join more groups. Branch limit
-- counts live branches.
-- ---------------------------------------------------------------------------
create function private.active_student_count(p_center_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct e.student_id)::integer from public.enrollments e
  where e.center_id = p_center_id and e.status = 'active';
$$;

create function private.check_student_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  if not private.is_end_user() or new.status <> 'active' then
    return new;
  end if;
  v_limit := (private.center_plan(new.center_id)).student_limit;
  if v_limit is null then
    return new;
  end if;
  -- One enrollment at a time per center, so two people can't both take the last place.
  perform pg_advisory_xact_lock(hashtextextended('student_limit:' || new.center_id::text, 0));
  if exists (select 1 from public.enrollments e where e.student_id = new.student_id and e.status = 'active') then
    return new;
  end if;
  if private.active_student_count(new.center_id) >= v_limit then
    raise exception 'student_limit_reached';
  end if;
  return new;
end;
$$;

create trigger enrollments_student_limit before insert on public.enrollments
  for each row execute function private.check_student_limit();

create function private.check_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  if not private.is_end_user() then
    return new;
  end if;
  v_limit := (private.center_plan(new.center_id)).branch_limit;
  if v_limit is not null and (
    select count(*) from public.branches b where b.center_id = new.center_id and b.archived_at is null
  ) >= v_limit then
    raise exception 'branch_limit_reached';
  end if;
  return new;
end;
$$;

create trigger branches_limit before insert on public.branches
  for each row execute function private.check_branch_limit();

-- The Subscription page: usage against the limits, for members of the center.
create function public.center_usage(p_center_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  perform private.require(private.is_member(p_center_id));
  v_plan := private.center_plan(p_center_id);
  return jsonb_build_object(
    'activeStudents', private.active_student_count(p_center_id),
    'studentLimit', v_plan.student_limit,
    'branches', (select count(*) from public.branches b where b.center_id = p_center_id and b.archived_at is null),
    'branchLimit', v_plan.branch_limit,
    'planCode', v_plan.code,
    'planName', v_plan.name
  );
end;
$$;

revoke all on function public.center_usage(uuid) from public, anon;
grant execute on function public.center_usage(uuid) to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled job. Guarded: PGlite (pnpm db:test:lite) has no pg_cron.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire_centers', '7 * * * *', 'select private.expire_centers()');
  end if;
end;
$$;
