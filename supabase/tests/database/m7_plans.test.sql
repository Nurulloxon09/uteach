-- M7a · Plans and the center status machine: seeded plans, trial → past_due → read_only (the job and its edges),
-- the read-only guard on every tenant table, invoices (paid → active), student and branch limits, and RLS.
-- Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.new_user(p_phone text, p_name text)
returns uuid
language sql
as $$
  insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          ltrim(p_phone, '+'), now(), jsonb_build_object('full_name', p_name), now(), now())
  returning id;
$$;

create function pg_temp.login(p_uid uuid)
returns void
language sql
as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_admin()
returns void
language sql
as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

-- The /admin server code: the service role through PostgREST.
create function pg_temp.as_service()
returns void
language sql
as $$
  select set_config('role', 'service_role', true);
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
$$;

create function pg_temp.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, true); $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid; $$;

create function pg_temp.status(p_center text) returns text language sql as $$
  select status::text from public.centers where id = pg_temp.id(p_center);
$$;

create function pg_temp.next(p_status text, p_trial_ends_at timestamptz, p_paid_until date,
                             p_past_due_since timestamptz, p_now timestamptz)
returns text language sql as $$
  select format('%s %s', x.status, coalesce(to_char(x.past_due_since at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), '-'))
  from private.center_status_next(p_status::public.center_status, p_trial_ends_at, p_paid_until, p_past_due_since,
                                  'Asia/Tashkent', p_now) x;
$$;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(code || ':' || coalesce(student_limit::text, '∞') || ':' || is_public::text, ' ' order by sort_order)
   from public.plans),
  'trial:50:false starter:50:true growth:200:true pro:∞:true',
  'four plans are seeded; the trial (50 students) is not public'
);

-- ---------------------------------------------------------------------------
-- The status machine (pure)
-- ---------------------------------------------------------------------------
select is(pg_temp.next('trial', '2026-11-01 10:00+00', null, null, '2026-11-01 09:59+00'), 'trial -',
  'a trial before its end stays a trial');
select is(pg_temp.next('trial', '2026-11-01 10:00+00', null, null, '2026-11-01 10:00+00'),
  'past_due 2026-11-01 10:00', 'at the trial end it becomes past_due, counted from the trial end');
select is(pg_temp.next('past_due', null, null, '2026-11-01 10:00+00', '2026-11-08 09:59+00'),
  'past_due 2026-11-01 10:00', '6 days 23:59 of grace: still past_due');
select is(pg_temp.next('past_due', null, null, '2026-11-01 10:00+00', '2026-11-08 10:00+00'),
  'read_only 2026-11-01 10:00', 'after 7 days it becomes read_only');
select is(pg_temp.next('trial', '2026-11-01 10:00+00', null, null, '2026-11-12 00:00+00'),
  'read_only 2026-11-01 10:00', 'a late job goes straight from trial to read_only');
-- paid_until 2026-11-30 in Tashkent (UTC+5): covered until 2026-11-30 19:00 UTC.
select is(pg_temp.next('active', null, '2026-11-30', null, '2026-11-30 18:59+00'), 'active -',
  'active through the last paid day (center timezone)');
select is(pg_temp.next('active', null, '2026-11-30', null, '2026-11-30 19:00+00'),
  'past_due 2026-11-30 19:00', 'the next local midnight it becomes past_due');
select is(pg_temp.next('active', null, null, null, '2030-01-01 00:00+00'), 'active -',
  'active without paid_until (set by hand) never expires');
select is(pg_temp.next('read_only', null, null, '2026-11-01 10:00+00', '2030-01-01 00:00+00'),
  'read_only 2026-11-01 10:00', 'read_only stays until someone pays');
select is(pg_temp.next('cancelled', '2026-11-01 10:00+00', null, null, '2030-01-01 00:00+00'), 'cancelled -',
  'cancelled never moves');

-- ---------------------------------------------------------------------------
-- Fixtures: two centers, a student in a group
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998950000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998950000002', 'Owner B')::text);
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Plans A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Plans B', 'Asia/Tashkent', 'ru', 'Main')::text);

select pg_temp.as_admin();
insert into public.courses (center_id, name) values (pg_temp.id('center_a'), 'English');
select pg_temp.put('course', (select id from public.courses where center_id = pg_temp.id('center_a'))::text);
insert into public.students (center_id, branch_id, full_name)
select pg_temp.id('center_a'), pg_temp.id('a1'), 'Student ' || n from generate_series(1, 4) n;
select pg_temp.put('s1', (select id from public.students where full_name = 'Student 1' and center_id = pg_temp.id('center_a'))::text);
select pg_temp.put('s2', (select id from public.students where full_name = 'Student 2' and center_id = pg_temp.id('center_a'))::text);
select pg_temp.put('s3', (select id from public.students where full_name = 'Student 3' and center_id = pg_temp.id('center_a'))::text);
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g1', public.create_group(pg_temp.id('a1'), pg_temp.id('course'), 'G1', current_date - 7)::text);
select pg_temp.put('g2', public.create_group(pg_temp.id('a1'), pg_temp.id('course'), 'G2', current_date - 7)::text);
select lives_ok(format('select public.enroll(%L, %L, current_date)', pg_temp.id('s1'), pg_temp.id('g1')),
  'a trial center enrolls');

select is(pg_temp.status('center_a'), 'trial', 'a new center is a trial');
select is((public.center_usage(pg_temp.id('center_a')) ->> 'studentLimit')::int, 50, 'trial limits: 50 students');
select is((public.center_usage(pg_temp.id('center_a')) ->> 'activeStudents')::int, 1, 'usage counts active students');
select pg_temp.login(pg_temp.id('owner_b'));
select throws_ok(format('select public.center_usage(%L)', pg_temp.id('center_a')), '42501', null,
  'another center''s owner can''t read the usage');

-- ---------------------------------------------------------------------------
-- The guard is on every tenant table
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
select is(
  (select coalesce(string_agg(t.table_name::text, ', '), '') from (
     select c.table_name from information_schema.columns c
     join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'center_id' and x.table_type = 'BASE TABLE'
     union select 'centers'
   ) t
   where not exists (select 1 from pg_trigger g
                     where g.tgrelid = format('public.%I', t.table_name)::regclass
                       and g.tgname = 'a_center_writable')),
  '', 'every table with center_id (and centers) has the read-only guard'
);

-- ---------------------------------------------------------------------------
-- The job: trial end → past_due → 7 days → read_only
-- ---------------------------------------------------------------------------
update public.centers set trial_ends_at = now() - interval '1 hour' where id = pg_temp.id('center_a');
select ok(private.expire_centers() >= 1, 'the job changes the expired center');
select is(pg_temp.status('center_a'), 'past_due', 'trial end → past_due');
select is(pg_temp.status('center_b'), 'trial', 'a center still in its trial is left alone');
select ok(
  exists (select 1 from public.audit_log where center_id = pg_temp.id('center_a') and table_name = 'centers'
          and actor_kind = 'system' and after ->> 'status' = 'past_due'),
  'the change is in the audit log as a system action'
);
select pg_temp.login(pg_temp.id('owner_a'));
select lives_ok(format('select public.enroll(%L, %L, current_date)', pg_temp.id('s2'), pg_temp.id('g1')),
  'past_due: everything still works (grace)');

select pg_temp.as_admin();
update public.centers set past_due_since = now() - interval '7 days 1 minute' where id = pg_temp.id('center_a');
select private.expire_centers();
select is(pg_temp.status('center_a'), 'read_only', '7 days later → read_only');

-- ---------------------------------------------------------------------------
-- read_only: every write rejected, every read works, the platform still writes
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  format($$insert into public.rooms (center_id, branch_id, name) values (%L, %L, 'Room 9')$$,
         pg_temp.id('center_a'), pg_temp.id('a1')),
  '42501', null, 'read_only: a direct insert is rejected');
select throws_ok(format('select public.enroll(%L, %L, current_date)', pg_temp.id('s3'), pg_temp.id('g1')),
  'center_read_only', 'read_only: an RPC (security definer) is rejected too');
-- Direct updates: RLS (center_writable) hides the rows, so nothing changes.
update public.students set full_name = 'X' where id = pg_temp.id('s1');
update public.centers set name = 'X' where id = pg_temp.id('center_a');
select is((select full_name from public.students where id = pg_temp.id('s1')), 'Student 1',
  'read_only: a direct update changes nothing');
select is((select name from public.centers where id = pg_temp.id('center_a')), 'Plans A',
  'read_only: the center''s own settings are locked');
select is((select count(*)::int from public.students where center_id = pg_temp.id('center_a')), 4,
  'read_only: reads still work');
select is((select count(*)::int from public.enrollments where center_id = pg_temp.id('center_a')), 2,
  'read_only: enrollments are still readable');
select pg_temp.login(pg_temp.id('owner_b'));
select lives_ok(
  format($$insert into public.rooms (center_id, branch_id, name)
           values (%L, (select id from public.branches where center_id = %L), 'Room B')$$,
         pg_temp.id('center_b'), pg_temp.id('center_b')),
  'another center is not affected');
select pg_temp.as_admin();
select lives_ok(
  format($$update public.students set full_name = 'Student 1' where id = %L$$, pg_temp.id('s1')),
  'read_only: platform writes (jobs, worker) still pass');

-- ---------------------------------------------------------------------------
-- Invoices: only the service role writes; paid → active
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  format($$select public.issue_platform_invoice(%L, (select id from public.plans where code = 'growth'),
                  current_date, current_date + 30)$$, pg_temp.id('center_a')),
  '42501', null, 'an owner can''t issue an invoice');
select throws_ok(format($$update public.centers set status = 'active' where id = %L$$, pg_temp.id('center_a')),
  '42501', null, 'an owner can''t change the status');
select throws_ok(format($$update public.centers set paid_until = '2099-01-01' where id = %L$$, pg_temp.id('center_a')),
  '42501', null, 'an owner can''t change paid_until');

select pg_temp.as_service();
select pg_temp.put('inv', public.issue_platform_invoice(pg_temp.id('center_a'),
  (select id from public.plans where code = 'growth'), current_date, current_date + 30)::text);
select pg_temp.as_admin();
select matches((select number from public.platform_invoices where id = pg_temp.id('inv')), '^UT-\d{4}-\d{6}$',
  'invoice numbers look like UT-2026-000123');
select is((select amount from public.platform_invoices where id = pg_temp.id('inv')),
  (select price_amount from public.plans where code = 'growth'), 'the amount defaults to the plan price');

select pg_temp.login(pg_temp.id('owner_a'));
select is((select count(*)::int from public.platform_invoices), 1, 'the owner sees their invoice');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.platform_invoices), 0, 'another center''s owner sees none');
select throws_ok(format($$select public.mark_platform_invoice_paid(%L)$$, pg_temp.id('inv')),
  '42501', null, 'an owner can''t mark an invoice paid');

select pg_temp.as_service();
select lives_ok(format($$select public.mark_platform_invoice_paid(%L, 'Bank transfer 123')$$, pg_temp.id('inv')),
  'the service role marks it paid');
select pg_temp.as_admin();
select is(pg_temp.status('center_a'), 'active', 'paid → active');
select is((select paid_until from public.centers where id = pg_temp.id('center_a')), current_date + 30,
  'paid_until = the period end');
select is((select p.code from public.centers c join public.plans p on p.id = c.plan_id where c.id = pg_temp.id('center_a')),
  'growth', 'the center is on the invoice''s plan');
select is((select past_due_since from public.centers where id = pg_temp.id('center_a')), null,
  'past_due_since is cleared');
select throws_ok(format($$select public.mark_platform_invoice_paid(%L)$$, pg_temp.id('inv')), 'invalid_invoice',
  'an invoice is paid once');
select private.expire_centers();
select is(pg_temp.status('center_a'), 'active', 'the job leaves a paid center alone');
select pg_temp.login(pg_temp.id('owner_a'));
select lives_ok(format('select public.enroll(%L, %L, current_date)', pg_temp.id('s3'), pg_temp.id('g1')),
  'active again: writes work');

-- ---------------------------------------------------------------------------
-- Student limit: a plan with 3 students
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
insert into public.plans (code, name, student_limit, branch_limit, price_amount) values ('tiny', 'Tiny', 3, 1, 1);
update public.centers set plan_id = (select id from public.plans where code = 'tiny') where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('owner_a'));
select is((public.center_usage(pg_temp.id('center_a')) ->> 'activeStudents')::int, 3, '3 active students');
select throws_ok(
  format('select public.enroll((select id from public.students where full_name = %L and center_id = %L), %L, current_date)',
         'Student 4', pg_temp.id('center_a'), pg_temp.id('g1')),
  'student_limit_reached', 'a 4th student is blocked at the limit');
select lives_ok(format('select public.enroll(%L, %L, current_date)', pg_temp.id('s1'), pg_temp.id('g2')),
  'a student who is already active can join another group');
select pg_temp.as_admin();
select lives_ok(
  format($$insert into public.enrollments (center_id, student_id, group_id, start_date)
           values (%L, (select id from public.students where full_name = 'Student 4' and center_id = %L), %L, current_date)$$,
         pg_temp.id('center_a'), pg_temp.id('center_a'), pg_temp.id('g2')),
  'the platform is not limited');

-- Branch limit: Tiny allows one branch.
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  format($$insert into public.branches (center_id, name, timezone) values (%L, 'Second', 'Asia/Tashkent')$$,
         pg_temp.id('center_a')),
  'branch_limit_reached', 'a second branch is blocked by the plan');

-- ---------------------------------------------------------------------------
-- RLS on the new tables
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.plans), 5, 'signed-in people read the plans');
select throws_ok($$insert into public.plans (code, name, price_amount) values ('mine', 'Mine', 0)$$, '42501', null,
  'nobody signed in writes plans');
select is((select count(*)::int from public.platform_settings where key = 'payment_instructions'), 1,
  'signed-in people read the payment instructions');
select throws_ok($$update public.platform_settings set value = '{}' where key = 'payment_instructions'$$, '42501', null,
  'nobody signed in writes platform settings');

select * from finish();
rollback;
