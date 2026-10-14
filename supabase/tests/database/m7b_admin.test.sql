-- M7b · Super-admin: the admin_* functions are for the service role only and check profiles.is_super_admin;
-- centers list, extend trial, plan and status changes, plans CRUD, invoices, the support view (audited) and
-- health; every action is in audit_log as `super_admin`. Owners read their own log, nobody else's.
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

-- Each helper also clears the super-admin mark: in PostgREST every request is its own transaction.
create function pg_temp.login(p_uid uuid)
returns void
language sql
as $$
  select set_config('uteach.super_admin', '', true);
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_admin()
returns void
language sql
as $$
  select set_config('uteach.super_admin', '', true);
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

-- The /admin server code: the service role through PostgREST.
create function pg_temp.as_service()
returns void
language sql
as $$
  select set_config('uteach.super_admin', '', true);
  select set_config('role', 'service_role', true);
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
$$;

create function pg_temp.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, true); $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid; $$;

create function pg_temp.status(p_center text) returns text language sql as $$
  select status::text from public.centers where id = pg_temp.id(p_center);
$$;

-- People and centers
select pg_temp.put('sa', pg_temp.new_user('+998977000001', 'Platform Admin')::text);
select pg_temp.put('o1', pg_temp.new_user('+998977000002', 'Owner One')::text);
select pg_temp.put('o2', pg_temp.new_user('+998977000003', 'Owner Two')::text);
update public.profiles set is_super_admin = true where id = pg_temp.id('sa');

select pg_temp.login(pg_temp.id('o1'));
select pg_temp.put('c1', public.create_center('Admin A', 'Asia/Tashkent', 'uz', 'Main')::text);
select pg_temp.login(pg_temp.id('o2'));
select pg_temp.put('c2', public.create_center('Admin B', 'Asia/Tashkent', 'ru', 'Main')::text);
select pg_temp.as_admin();
select pg_temp.put('growth', (select id from public.plans where code = 'growth')::text);
select pg_temp.put('starter', (select id from public.plans where code = 'starter')::text);
select pg_temp.put('trial_plan', (select id from public.plans where code = 'trial')::text);

-- ---------------------------------------------------------------------------
-- Who may call
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('sa'));
select throws_ok(format($$ select * from public.admin_centers(%L) $$, pg_temp.id('sa')), '42501', null,
  'a super-admin signed in to the app can''t call admin functions (service role only)');
select throws_ok(format($$ select public.admin_extend_trial(%L, %L, 7) $$, pg_temp.id('sa'), pg_temp.id('c1')),
  '42501', null, '... nor change a center');
select pg_temp.as_service();
select throws_ok(format($$ select * from public.admin_centers(%L) $$, pg_temp.id('o1')), '42501', 'forbidden',
  'the service role acting for someone who isn''t a super-admin is refused');
select throws_ok($$ select * from public.admin_centers(null) $$, '42501', 'forbidden', '... and for nobody');
select pg_temp.login(pg_temp.id('o1'));
select throws_ok(format($$ select private.act_as_super_admin(%L) $$, pg_temp.id('sa')), '42501', null,
  'nobody signed in can mark themselves a super-admin');
select pg_temp.as_admin();
select is((select is_super_admin from public.profiles where id = pg_temp.id('sa')), true,
  'the first super-admin is set by SQL');

-- ---------------------------------------------------------------------------
-- Centers list
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select is(
  (select format('%s|%s|%s|%s|%s', status, plan_name, active_students, student_limit, owner_name)
   from public.admin_centers(pg_temp.id('sa')) where id = pg_temp.id('c1')),
  'trial|Trial|0|50|Owner One', 'the list has status, plan, active students / limit and the owner');
select ok(
  (select trial_ends_at > now() + interval '13 days' from public.admin_centers(pg_temp.id('sa'))
   where id = pg_temp.id('c1')), '... and the trial end');
select ok(
  (select count(*) >= 2 from public.admin_centers(pg_temp.id('sa'))), 'every center is listed');

-- ---------------------------------------------------------------------------
-- Extend trial
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
update public.centers set status = 'read_only', trial_ends_at = now() - interval '8 days',
                          past_due_since = now() - interval '8 days' where id = pg_temp.id('c1');
select pg_temp.as_service();
select throws_ok(format($$ select public.admin_extend_trial(%L, %L, 0) $$, pg_temp.id('sa'), pg_temp.id('c1')),
  'P0001', 'invalid_days', 'extending by 0 days is refused');
select throws_ok(format($$ select public.admin_extend_trial(%L, %L, 91) $$, pg_temp.id('sa'), pg_temp.id('c1')),
  'P0001', 'invalid_days', '... and by more than 90');
select lives_ok(format($$ select public.admin_extend_trial(%L, %L, 7) $$, pg_temp.id('sa'), pg_temp.id('c1')),
  'a read-only center that never paid gets 7 more trial days');
select is(pg_temp.status('c1'), 'trial', '... and is back on trial');
select ok(
  (select trial_ends_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days'
          and past_due_since is null from public.centers where id = pg_temp.id('c1')),
  '... counted from now, since the old trial had ended; the grace is cleared');
select lives_ok(format($$ select public.admin_extend_trial(%L, %L, 3) $$, pg_temp.id('sa'), pg_temp.id('c1')),
  'extending a running trial');
select ok(
  (select trial_ends_at between now() + interval '10 days' - interval '1 minute' and now() + interval '10 days'
   from public.centers where id = pg_temp.id('c1')), '... adds to its end');
select is(
  (select format('%s|%s|%s', actor_kind, actor_profile_id = pg_temp.id('sa'), after ->> 'status')
   from public.audit_log where center_id = pg_temp.id('c1') and table_name = 'centers'
     and after ? 'status' order by id desc limit 1),
  'super_admin|t|trial', 'the change is in the audit log as the super-admin');
select pg_temp.as_admin();
select is(private.acting_super_admin(), null, 'the mark is gone for the next request');

-- ---------------------------------------------------------------------------
-- Plan and status
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select lives_ok(format($$ select public.admin_set_center_plan(%L, %L, %L) $$, pg_temp.id('sa'), pg_temp.id('c2'),
  pg_temp.id('growth')), 'super-admin moves a center to Growth');
select is((select plan_id from public.centers where id = pg_temp.id('c2')), pg_temp.id('growth'), '... it is on Growth');
select is((select student_limit from public.admin_centers(pg_temp.id('sa')) where id = pg_temp.id('c2')), 200,
  '... with Growth''s limit');
select lives_ok(format($$ select public.admin_set_center_status(%L, %L, 'past_due') $$, pg_temp.id('sa'),
  pg_temp.id('c2')), 'super-admin sets past_due');
select ok(
  (select status = 'past_due' and past_due_since > now() - interval '1 minute' from public.centers
   where id = pg_temp.id('c2')), '... the grace starts now');
select lives_ok(format($$ select public.admin_set_center_status(%L, %L, 'read_only') $$, pg_temp.id('sa'),
  pg_temp.id('c2')), '... then read_only');
select lives_ok(format($$ select public.admin_set_center_status(%L, %L, 'active') $$, pg_temp.id('sa'),
  pg_temp.id('c2')), '... then active (no paid period: it stays active)');
select is(pg_temp.status('c2'), 'active', '... it is active');
select pg_temp.as_admin();
update public.centers set paid_until = current_date - 3, status = 'past_due', past_due_since = now(),
                          trial_ends_at = now() - interval '1 day'
  where id = pg_temp.id('c2');
select pg_temp.as_service();
select throws_ok(format($$ select public.admin_set_center_status(%L, %L, 'active') $$, pg_temp.id('sa'),
  pg_temp.id('c2')), 'P0001', 'invalid_status', 'active is refused when the paid period has ended');
select throws_ok(format($$ select public.admin_extend_trial(%L, %L, 7) $$, pg_temp.id('sa'), pg_temp.id('c2')),
  'P0001', 'invalid_status', 'a center that has paid gets no trial extension');
select throws_ok(format($$ select public.admin_set_center_status(%L, %L, 'trial') $$, pg_temp.id('sa'),
  pg_temp.id('c2')), 'P0001', 'invalid_status', 'trial is refused when the trial has ended');

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
select pg_temp.put('ent', public.admin_save_plan(pg_temp.id('sa'), null, 'enterprise', 'Enterprise', 1000, 10,
  300000000, false, 9::smallint)::text);
select is(
  (select format('%s|%s|%s|%s|%s', code, name, student_limit, price_amount, is_public) from public.plans
   where id = pg_temp.id('ent')),
  'enterprise|Enterprise|1000|300000000|f', 'super-admin adds a plan');
select lives_ok(format($$ select public.admin_save_plan(%L, %L, 'ignored', 'Enterprise+', null, null, 350000000,
  true, 9::smallint) $$, pg_temp.id('sa'), pg_temp.id('ent')), '... and edits it');
select is(
  (select format('%s|%s|%s|%s|%s', code, name, coalesce(student_limit::text, '∞'), price_amount, is_public)
   from public.plans where id = pg_temp.id('ent')),
  'enterprise|Enterprise+|∞|350000000|t', '... the code stays, the rest changes');
select throws_ok(format($$ select public.admin_save_plan(%L, null, 'Bad Code', 'X', null, null, 0, true,
  0::smallint) $$, pg_temp.id('sa')), 'P0001', 'invalid_plan', 'a bad code is refused');
select throws_ok(format($$ select public.admin_save_plan(%L, null, 'neg', 'X', null, null, -1, true, 0::smallint) $$,
  pg_temp.id('sa')), 'P0001', 'invalid_plan', 'a negative price is refused');
select throws_ok(format($$ select public.admin_save_plan(%L, null, 'starter', 'Again', null, null, 0, true,
  0::smallint) $$, pg_temp.id('sa')), '23505', null, 'a plan code is unique');
select lives_ok(format($$ select public.admin_save_plan(%L, %L, 'trial', 'Trial', 60, null, 0, true, 0::smallint) $$,
  pg_temp.id('sa'), pg_temp.id('trial_plan')), 'the trial limits can be changed');
select is((select format('%s|%s', student_limit, is_public) from public.plans where code = 'trial'), '60|f',
  '... but the trial plan never becomes public');
select throws_ok(format($$ select public.admin_delete_plan(%L, %L) $$, pg_temp.id('sa'), pg_temp.id('growth')),
  'P0001', 'plan_in_use', 'a plan a center is on can''t be deleted');
select throws_ok(format($$ select public.admin_delete_plan(%L, %L) $$, pg_temp.id('sa'), pg_temp.id('trial_plan')),
  'P0001', 'plan_in_use', '... nor the trial plan');
select throws_ok(format($$ select public.admin_archive_plan(%L, %L, true) $$, pg_temp.id('sa'),
  pg_temp.id('trial_plan')), 'P0001', 'plan_in_use', '... which can''t be hidden either');
select lives_ok(format($$ select public.admin_archive_plan(%L, %L, true) $$, pg_temp.id('sa'), pg_temp.id('growth')),
  'a plan in use can be hidden');
select ok((select archived_at is not null from public.plans where id = pg_temp.id('growth')), '... it is hidden');
select is((select plan_id from public.centers where id = pg_temp.id('c2')), pg_temp.id('growth'),
  '... the center on it keeps it');
select throws_ok(format($$ select public.admin_set_center_plan(%L, %L, %L) $$, pg_temp.id('sa'), pg_temp.id('c1'),
  pg_temp.id('growth')), 'P0001', 'invalid_plan', 'nobody new can be put on a hidden plan');
select lives_ok(format($$ select public.admin_archive_plan(%L, %L, false) $$, pg_temp.id('sa'), pg_temp.id('growth')),
  'a hidden plan can be brought back');
select lives_ok(format($$ select public.admin_delete_plan(%L, %L) $$, pg_temp.id('sa'), pg_temp.id('ent')),
  'an unused plan can be deleted');
select is((select count(*)::int from public.plans where id = pg_temp.id('ent')), 0, '... it is gone');
select is(
  (select string_agg(action, ' ' order by id) from public.audit_log
   where table_name = 'plans' and row_id = pg_temp.id('ent') and actor_kind = 'super_admin'
     and actor_profile_id = pg_temp.id('sa')),
  'insert update delete', 'every plan change is in the audit log as the super-admin');

-- Payment instructions
select lives_ok(format($$ select public.admin_set_payment_instructions(%L, '{"uz":"Hisob: 123","ru":"Счёт: 123"}') $$,
  pg_temp.id('sa')), 'super-admin sets how to pay');
select is((select value ->> 'ru' from public.platform_settings where key = 'payment_instructions'), 'Счёт: 123',
  '... owners will see it');
select throws_ok(format($$ select public.admin_set_payment_instructions(%L, '{"de":"x"}') $$, pg_temp.id('sa')),
  'P0001', 'invalid_body', 'only uz/ru/en texts are accepted');
select is(
  (select format('%s|%s', actor_kind, after #>> '{payment_instructions,uz}') from public.audit_log
   where table_name = 'platform_settings' order by id desc limit 1),
  'super_admin|Hisob: 123', '... and the change is audited');

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
select pg_temp.put('inv', public.admin_issue_invoice(pg_temp.id('sa'), pg_temp.id('c1'), pg_temp.id('starter'),
  current_date, current_date + 29)::text);
select is((select status::text from public.platform_invoices where id = pg_temp.id('inv')), 'issued',
  'super-admin issues an invoice');
select lives_ok(format($$ select public.admin_mark_invoice_paid(%L, %L, 'bank transfer #77') $$, pg_temp.id('sa'),
  pg_temp.id('inv')), '... and marks it paid with a note');
select is(
  (select format('%s|%s|%s', c.status, c.plan_id = pg_temp.id('starter'), c.paid_until = current_date + 29)
   from public.centers c where c.id = pg_temp.id('c1')),
  'active|t|t', '... the center is active on Starter, paid through the period end');
select is(
  (select string_agg(distinct actor_kind, ',') from public.audit_log
   where (table_name = 'platform_invoices' and row_id = pg_temp.id('inv'))
      or (table_name = 'centers' and row_id = pg_temp.id('c1') and (after ->> 'paid_until') is not null)),
  'super_admin', 'the invoice and the center change are audited as the super-admin');
select pg_temp.put('inv2', public.admin_issue_invoice(pg_temp.id('sa'), pg_temp.id('c1'), pg_temp.id('starter'),
  current_date + 30, current_date + 59, 1)::text);
select lives_ok(format($$ select public.admin_void_invoice(%L, %L) $$, pg_temp.id('sa'), pg_temp.id('inv2')),
  'super-admin voids an invoice');
select throws_ok(format($$ select public.admin_mark_invoice_paid(%L, %L) $$, pg_temp.id('sa'), pg_temp.id('inv2')),
  'P0001', 'invalid_invoice', 'a void invoice can''t be paid');
select is(
  (select string_agg(format('%s:%s:%s', center_name, plan_name, status), ' ' order by number)
   from public.admin_invoices(pg_temp.id('sa')) where center_id = pg_temp.id('c1')),
  'Admin A:Starter:paid Admin A:Starter:void', 'the invoices list shows the center, the plan and the status');
select throws_ok(format($$ select * from public.admin_invoices(%L) $$, pg_temp.id('o1')), '42501', 'forbidden',
  '... to super-admins only');

-- ---------------------------------------------------------------------------
-- Support view
-- ---------------------------------------------------------------------------
select pg_temp.put('sv', public.admin_support_view(pg_temp.id('sa'), pg_temp.id('c1'))::text);
select is(current_setting('t.sv')::jsonb #>> '{center,name}', 'Admin A', 'the support view shows the center');
select is(jsonb_array_length(current_setting('t.sv')::jsonb -> 'branches'), 1, '... its branches');
select is(current_setting('t.sv')::jsonb #>> '{staff,0,name}', 'Owner One', '... its staff');
select is(current_setting('t.sv')::jsonb #>> '{students,total}', '0', '... student counts');
select ok(current_setting('t.sv')::jsonb ?& array['groups', 'payments', 'failed_messages', 'imports'],
  '... groups, last payments, failed messages and imports');
select is(
  (select format('%s|%s|%s', actor_kind, actor_profile_id = pg_temp.id('sa'), table_name) from public.audit_log
   where center_id = pg_temp.id('c1') and action = 'support_view'),
  'super_admin|t|centers', 'opening it writes support_view to the center''s audit log');
select throws_ok(format($$ select public.admin_support_view(%L, %L) $$, pg_temp.id('sa'), gen_random_uuid()),
  'P0001', 'not_found', 'an unknown center is not found');

-- ---------------------------------------------------------------------------
-- Health
-- ---------------------------------------------------------------------------
select ok(public.admin_health(pg_temp.id('sa')) ?& array['heartbeats', 'outbox', 'cron'],
  'health has heartbeats, the outbox and the cron jobs');
select ok(
  not exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron')  -- PGlite has no pg_cron
  or (select bool_or(x ->> 'job' = 'expire_centers')
      from jsonb_array_elements(public.admin_health(pg_temp.id('sa')) -> 'cron') x),
  '... including expire_centers');
select ok((public.admin_health(pg_temp.id('sa')) -> 'outbox') ?& array['pending', 'due', 'failed_24h', 'sms_failed_24h'],
  '... the outbox backlog and 24 h failures');

-- ---------------------------------------------------------------------------
-- Owners read their own log (Settings → Audit log)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('o1'));
select ok(
  (select count(*) > 0 from public.audit_log where action = 'support_view'),
  'the owner sees the support view of their center');
select is(
  (select count(*)::int from public.audit_log where center_id is distinct from pg_temp.id('c1')), 0,
  'an owner sees only their center''s log (not another center''s, not platform rows)');
select throws_ok($$ update public.audit_log set action = 'x' $$, '42501', null, 'the log can''t be changed');
select pg_temp.login(pg_temp.id('o2'));
select is(
  (select count(*)::int from public.audit_log where center_id = pg_temp.id('c1')), 0,
  'a member of another center sees nothing');
select pg_temp.as_admin();
select throws_ok(format($$ delete from public.audit_log where center_id = %L $$, pg_temp.id('c1')), 'P0001',
  'audit_log is append-only', 'not even the platform can delete it');

select * from finish();
rollback;
