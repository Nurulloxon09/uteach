-- M4b · worker & SMS: the per-phone OTP limit (10), receipts for the bot (scoped to the user's links), deep
-- links and the bot's subject list. Run with `pnpm db:test`.
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

create function pg_temp.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, true); $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid; $$;

-- ---------------------------------------------------------------------------
-- OTP limit
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.record_otp_send(text)', 'execute')
          and not has_function_privilege('anon', 'public.record_otp_send(text)', 'execute'),
  'only the service role records OTP sends');
select ok(has_function_privilege('service_role', 'public.record_otp_send(text)', 'execute'), '... it can');
select ok(not has_table_privilege('service_role', 'private.otp_sends', 'select'), 'the log itself is closed');

select pg_temp.put('h1', encode(extensions.digest('+998901112233', 'sha256'), 'hex'));
select pg_temp.put('h2', encode(extensions.digest('+998901112244', 'sha256'), 'hex'));
select is(
  (select array_agg(public.record_otp_send(current_setting('t.h1')) order by n) from generate_series(1, 6) n),
  array[true, true, true, true, true, false], 'five codes per phone per hour, then no more'
);
select ok(public.record_otp_send(current_setting('t.h2')), 'another phone is not affected');
update private.otp_sends set sent_at = now() - interval '61 minutes' where phone_hash = current_setting('t.h1');
select ok(public.record_otp_send(current_setting('t.h1')), 'an hour later the phone gets codes again');
select throws_ok($$ select public.record_otp_send('not-a-hash') $$, 'P0001', 'invalid_phone', 'hashes are checked');
update private.otp_sends set sent_at = now() - interval '2 days' where phone_hash = current_setting('t.h2');
select is(private.prune_otp_sends(), 1, 'old rows are pruned');

-- ---------------------------------------------------------------------------
-- Receipts, deep links, subjects
-- ---------------------------------------------------------------------------
select pg_temp.put('owner', pg_temp.new_user('+998950000001', 'Owner')::text);
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('center', public.create_center('Receipt Center', 'Asia/Tashkent', 'uz', 'Main')::text);
select pg_temp.as_admin();
insert into public.students (center_id, branch_id, full_name)
select pg_temp.id('center'), b.id, s from public.branches b, unnest(array['Ali', 'Vali']) s
where b.center_id = pg_temp.id('center');
select pg_temp.put('ali', (select id from public.students where full_name = 'Ali' and center_id = pg_temp.id('center'))::text);
select pg_temp.put('vali', (select id from public.students where full_name = 'Vali' and center_id = pg_temp.id('center'))::text);
insert into public.guardians (center_id, full_name, phone) values (pg_temp.id('center'), 'Mother', '+998950000009');
insert into public.student_guardians (center_id, student_id, guardian_id)
select pg_temp.id('center'), pg_temp.id('ali'), g.id from public.guardians g where g.phone = '+998950000009';
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('pay_ali', (public.record_payment(pg_temp.id('ali'), 100000, 'cash') ->> 'paymentId'));
select pg_temp.put('pay_vali', (public.record_payment(pg_temp.id('vali'), 100000, 'cash') ->> 'paymentId'));
select pg_temp.as_admin();
select count(*) from worker.link_contact(6001, 6001, '+998950000009', 'ru');

select is((worker.receipt_data(pg_temp.id('pay_ali'), 6001) ->> 'student'), 'Ali',
  'a parent gets their child''s receipt');
select throws_ok(format($$ select worker.receipt_data(%L, 6001) $$, pg_temp.id('pay_vali')), '42501', null,
  '... not another student''s');
select is((worker.receipt_data(pg_temp.id('pay_vali')) ->> 'student'), 'Vali',
  'the outbox (no Telegram user) reads any receipt it was queued for');
select is((worker.receipt_data(pg_temp.id('pay_ali')) ->> 'amount'), '100000', 'amounts stay minor units as text');
select throws_ok($$ select worker.receipt_data(gen_random_uuid()) $$, 'P0001', 'not_found', 'unknown payments');

select is(worker.center_by_slug((select slug::text from public.centers where id = pg_temp.id('center'))),
  pg_temp.id('center'), 'a deep link finds its center by slug');
select is(worker.center_by_slug('no-such-center'), null, '... and nothing for an unknown slug');
select is((select timezone || ' ' || currency || ' ' || relation from worker.bot_subjects(6001)),
  'Asia/Tashkent UZS child', 'subjects carry the center''s timezone and currency');
select ok(not has_function_privilege('authenticated', 'worker.receipt_data(uuid, bigint)', 'execute')
          and has_function_privilege('uteach_worker', 'worker.receipt_data(uuid, bigint)', 'execute'),
  'receipt_data is for the worker only');

select * from finish();
rollback;
