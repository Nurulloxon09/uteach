-- M3 · Billing: cycle charges (formula, windows, generation, price changes, freezes), ending and transferring
-- mid-cycle, payments with receipt numbers, FIFO balances and debtors, voids and adjustments, opening balances,
-- and RLS on every billing table and view. Run with `pnpm db:test`. Dates are relative to today (Tashkent).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers (pg_temp: they disappear with the transaction)
-- ---------------------------------------------------------------------------
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
create function pg_temp.get(k text) returns text language sql as $$ select current_setting('t.' || k); $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid; $$;
create function pg_temp.d(k text) returns date language sql as $$ select current_setting('t.' || k)::date; $$;

create function pg_temp.hire(p_center uuid, p_user uuid, p_role public.membership_role, p_name text, p_phone text,
                             p_branches uuid[], p_perms text[] default '{}')
returns uuid
language plpgsql
as $$
declare
  v_token text;
begin
  perform pg_temp.as_admin();
  perform pg_temp.login((select m.profile_id from public.memberships m where m.center_id = p_center and m.role = 'owner' limit 1));
  v_token := public.create_invite(p_center, p_role, p_name, p_phone, p_branches, p_perms);
  perform pg_temp.login(p_user);
  perform public.accept_invite(v_token);
  perform pg_temp.as_admin();
  return (select m.id from public.memberships m where m.center_id = p_center and m.profile_id = p_user);
end;
$$;

-- Lessons of a group at p_time (Tashkent) on today + p_from … today + p_to, every p_step days.
create function pg_temp.series(p_group text, p_from int, p_to int, p_step int, p_time time)
returns int
language sql
as $$
  insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at, teacher_membership_id,
                              is_manually_edited)
  select g.center_id, g.branch_id, g.id, pg_temp.d('today') + o,
         ((pg_temp.d('today') + o) + p_time) at time zone 'Asia/Tashkent',
         ((pg_temp.d('today') + o) + p_time) at time zone 'Asia/Tashkent' + interval '1 hour',
         g.teacher_membership_id, true
  from public.groups g, generate_series(p_from, p_to, p_step) o
  where g.id = pg_temp.id(p_group);
  select count(*)::int from public.lessons where group_id = pg_temp.id(p_group);
$$;

create function pg_temp.student(p_name text, p_branch text default 'a1', p_phone text default null) returns text
language sql as $$
  insert into public.students (center_id, branch_id, full_name, phone)
  values (pg_temp.id('center_a'), pg_temp.id(p_branch), p_name, p_phone)
  returning id::text;
$$;

-- Open charges of an enrollment, as "cycle:amount" in cycle order (read as postgres).
create function pg_temp.cycles(p_enrollment text) returns text language sql as $$
  select coalesce(string_agg(c.cycle_no || ':' || c.amount, ' ' order by c.cycle_no), '')
  from public.charges c where c.enrollment_id = pg_temp.id(p_enrollment) and c.status = 'open';
$$;

create function pg_temp.charge(p_enrollment text, p_cycle int) returns public.charges language sql as $$
  select c.* from public.charges c
  where c.enrollment_id = pg_temp.id(p_enrollment) and c.cycle_no = p_cycle and c.status = 'open';
$$;

create function pg_temp.window_of(p_enrollment text, p_cycle int) returns public.charge_cycles language sql as $$
  select w.* from public.charge_cycles w where w.enrollment_id = pg_temp.id(p_enrollment) and w.cycle_no = p_cycle;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998930000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998930000002', 'Owner B')::text);
select pg_temp.put('adm_bill', pg_temp.new_user('+998930000003', 'Admin Billing')::text);
select pg_temp.put('adm_pay', pg_temp.new_user('+998930000004', 'Admin Cashier')::text);
select pg_temp.put('adm_a2', pg_temp.new_user('+998930000005', 'Admin Other Branch')::text);
select pg_temp.put('t1', pg_temp.new_user('+998930000006', 'Teacher One')::text);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Center A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent');
select pg_temp.put('a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);

select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Center B', 'Asia/Tashkent', 'ru', 'Main')::text);

select pg_temp.put('m_adm_bill', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_bill'), 'admin', 'Admin Billing',
  '+998930000003', array[pg_temp.id('a1')],
  array['students', 'billing', 'payments', 'void', 'adjustments', 'academics', 'import'])::text);
select pg_temp.put('m_adm_pay', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_pay'), 'admin', 'Admin Cashier',
  '+998930000004', array[pg_temp.id('a1')], array['students', 'payments'])::text);
select pg_temp.put('m_adm_a2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_a2'), 'admin', 'Admin Other Branch',
  '+998930000005', array[pg_temp.id('a2')], array['students', 'billing', 'payments', 'void', 'adjustments'])::text);
select pg_temp.put('m_t1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t1'), 'teacher', 'Teacher One',
  '+998930000006', array[pg_temp.id('a1')])::text);

select pg_temp.as_admin();
select pg_temp.put('today', private.today_in('Asia/Tashkent')::text);
select pg_temp.put('year', extract(year from (now() at time zone 'Asia/Tashkent'))::text);
update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where id = pg_temp.id('center_a');
insert into public.courses (center_id, name) values (pg_temp.id('center_a'), 'English');

-- g1: 12-lesson cycles at 600 000 UZS, lessons every 2 days from today − 40 to today + 30 (10:00).
-- g2: 8-lesson cycles at 400 000, daily from today − 7 (12:00). g3: 12 lessons at 600 000, daily from today − 4 (14:00).
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g1', public.create_group(pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')),
  'G1', pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_t1'),
  p_price_amount => 60000000, p_cycle_lessons => 12::smallint)::text);
select pg_temp.put('g2', public.create_group(pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')),
  'G2', pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_t1'),
  p_price_amount => 40000000, p_cycle_lessons => 8::smallint)::text);
select pg_temp.put('g3', public.create_group(pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')),
  'G3', pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_t1'),
  p_price_amount => 60000000, p_cycle_lessons => 12::smallint)::text);
select pg_temp.as_admin();
-- create_group stores the price from the group's start date.
select pg_temp.series('g1', -40, 30, 2, '10:00');
select pg_temp.series('g2', -7, 30, 1, '12:00');
select pg_temp.series('g3', -4, 30, 1, '14:00');

select pg_temp.put('s1', pg_temp.student('Ali Valiyev', 'a1', '+998901111111'));
select pg_temp.put('s2', pg_temp.student('Bobur Karimov'));
select pg_temp.put('s3', pg_temp.student('Sardor Tursunov'));
select pg_temp.put('s4', pg_temp.student('Dilnoza Rahimova'));
select pg_temp.put('s5', pg_temp.student('Aziza Valiyeva'));
select pg_temp.put('s6', pg_temp.student('Leaving Credit'));
select pg_temp.put('s7', pg_temp.student('Leaving No Credit'));
select pg_temp.put('s8', pg_temp.student('Leaving Auto Credit'));
select pg_temp.put('s10', pg_temp.student('Moving Student'));
select pg_temp.put('s11', pg_temp.student('Fifo Student'));
select pg_temp.put('s12', pg_temp.student('Old Debtor'));
select pg_temp.put('s20', pg_temp.student('Other Branch', 'a2'));
insert into public.guardians (center_id, full_name, phone) values
  (pg_temp.id('center_a'), 'Malika Valiyeva', '+998902222222'),
  (pg_temp.id('center_a'), 'Vali Valiyev', '+998903333333');
select pg_temp.put('mother', (select id from public.guardians where phone = '+998902222222')::text);
select pg_temp.put('father', (select id from public.guardians where phone = '+998903333333')::text);
insert into public.student_guardians (center_id, student_id, guardian_id, receives_billing) values
  (pg_temp.id('center_a'), pg_temp.id('s1'), pg_temp.id('mother'), true),
  (pg_temp.id('center_a'), pg_temp.id('s1'), pg_temp.id('father'), false);

-- ---------------------------------------------------------------------------
-- Setup: RLS, accounts, branch codes
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('accounts', 'charges', 'payments', 'balance_adjustments', 'receipt_sequences')
       and not c.relrowsecurity $$,
  'every billing table has RLS enabled'
);
select is(
  (select string_agg(kind::text || coalesce(':' || b.code, ''), ' ' order by b.code nulls first, kind)
   from public.accounts a left join public.branches b on b.id = a.branch_id
   where a.center_id = pg_temp.id('center_a')),
  'bank cash:CHI terminal:CHI cash:YUN terminal:YUN',
  'each center gets a bank account and each branch a cash and a terminal account'
);
select is(
  (select string_agg(code, ' ' order by code) from public.branches where center_id = pg_temp.id('center_a')),
  'CHI YUN', 'branch codes come from the names'
);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Chorsu Hall', 'Asia/Tashkent');
select is(private.suggest_branch_code(pg_temp.id('center_a'), 'Chilonzor Hall'), 'CH2',
  'a code already taken gets a digit (Chorsu Hall has CH)');
select is(private.suggest_branch_code(pg_temp.id('center_a'), 'Юнусабад'), 'BR',
  'a name without Latin letters falls back to BR');

-- ---------------------------------------------------------------------------
-- computeCycleCharge (15): worked examples and the formula's steps
-- ---------------------------------------------------------------------------
select is((private.compute_cycle_charge(60000000, 1000, 0, 100000) ->> 'amount')::bigint, 54000000::bigint,
  'worked example 1: 600 000 − 10% = 540 000 UZS');
select is((private.compute_cycle_charge(55000000, 1500, 0, 100000) ->> 'amount')::bigint, 46800000::bigint,
  'worked example 2: 550 000 − 15% = 467 500 → rounded half up to 468 000 UZS');
select is((private.compute_cycle_charge(60000000, 0, 5000000, 100000) ->> 'amount')::bigint, 55000000::bigint,
  'a fixed discount per cycle');
select is((private.compute_cycle_charge(60000000, 1000, 2000000, 100000) ->> 'amount')::bigint, 52000000::bigint,
  'percent first, then the fixed amount');
select is((private.compute_cycle_charge(10000000, 0, 20000000, 100000) ->> 'amount')::bigint, 0::bigint,
  'a fixed discount never makes a charge negative');
select is((private.compute_cycle_charge(60000000, 1000, 0, 100000) ->> 'discount')::bigint, 6000000::bigint,
  'calc keeps the discount taken off');

-- ---------------------------------------------------------------------------
-- Enroll → cycle charges; windows; generation; price changes
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('e_s1', public.enroll(pg_temp.id('s1'), pg_temp.id('g1'), pg_temp.d('today') - 40, 1000, 0, 'Sibling')::text);
select pg_temp.put('e_s2', public.enroll(pg_temp.id('s2'), pg_temp.id('g1'), pg_temp.d('today') + 1)::text);
select pg_temp.as_admin();

select is(pg_temp.cycles('e_s2'), '1:60000000', 'enrolling creates cycle 1''s charge');
select is((pg_temp.charge('e_s2', 1)).cycle_start_date, pg_temp.d('today') + 2,
  'it starts at the student''s first billable lesson');
select is((pg_temp.charge('e_s2', 1)).due_date, pg_temp.d('today') + 12, 'due = cycle start + 10 days');
select is((pg_temp.charge('e_s2', 1)).cycle_lessons, 12::smallint, 'cycle length comes from the group price');

select is(pg_temp.cycles('e_s1'), '1:54000000 2:54000000',
  'a backdated enrollment catches up: cycle 1 is over, so cycle 2 is charged too');
select is((pg_temp.charge('e_s1', 2)).cycle_start_date, pg_temp.d('today') - 16, 'cycle 2 starts at lesson 13');
select is((pg_temp.window_of('e_s1', 2)).lessons_used, 9,
  'lessons used = billable lessons up to today (−16 … 0)');
select is((pg_temp.window_of('e_s1', 2)).lessons_left, 3, 'lessons left');
select is((pg_temp.window_of('e_s1', 2)).expected_last_date, pg_temp.d('today') + 6, 'the expected last lesson');

-- Attendance doesn't matter: an absence is a used lesson.
insert into public.attendance (center_id, group_id, lesson_id, student_id, enrollment_id, status, marked_by)
select l.center_id, l.group_id, l.id, pg_temp.id('s1'), pg_temp.id('e_s1'), 'absent', pg_temp.id('t1')
from public.lessons l where l.group_id = pg_temp.id('g1') and l.local_date = pg_temp.d('today') - 2;
select is((pg_temp.window_of('e_s1', 2)).lessons_used, 9, 'an unexcused absence still counts as used');

-- g2: 8-lesson cycles; the next charge appears on the day of the last lesson.
select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('e_s3', public.enroll(pg_temp.id('s3'), pg_temp.id('g2'), pg_temp.d('today') - 7)::text);
select pg_temp.as_admin();
select is(pg_temp.cycles('e_s3'), '1:40000000 2:40000000',
  'with 8-lesson cycles, cycle 1 = −7 … today; its last lesson is today, so cycle 2 is charged today');
select is((pg_temp.window_of('e_s3', 1)).expected_last_date, pg_temp.d('today'), 'an 8-lesson cycle ends on lesson 8');
select is((pg_temp.charge('e_s3', 2)).cycle_start_date, pg_temp.d('today') + 1, 'cycle 2 starts tomorrow');
select private.generate_cycle_charges();
select private.generate_cycle_charges();
select is(pg_temp.cycles('e_s3'), '1:40000000 2:40000000', 'running the job again creates nothing (idempotent)');

-- No charge while frozen.
insert into public.enrollments (center_id, student_id, group_id, start_date, status)
values (pg_temp.id('center_a'), pg_temp.id('s4'), pg_temp.id('g2'), pg_temp.d('today') - 7, 'frozen');
select pg_temp.put('e_s4', (select id from public.enrollments where student_id = pg_temp.id('s4'))::text);
insert into public.enrollment_freezes (center_id, enrollment_id, from_date, to_date)
values (pg_temp.id('center_a'), pg_temp.id('e_s4'), pg_temp.d('today') - 1, pg_temp.d('today') + 2);
select private.generate_cycle_charges();
select is(pg_temp.cycles('e_s4'), '', 'no charge is created while the enrollment is frozen');
select is(private.generate_charges_for(pg_temp.id('e_s4')), 0,
  '... not even when the enrollment is charged directly (enroll, transfer, schedule save)');
update public.enrollments set status = 'active' where id = pg_temp.id('e_s4');
select private.generate_cycle_charges();
select is(pg_temp.cycles('e_s4'), '1:40000000',
  'after the freeze only cycle 1: its lessons skip the frozen days, so it isn''t over yet');
select is((pg_temp.window_of('e_s4', 1)).expected_last_date, pg_temp.d('today') + 4,
  'the freeze pushed the end of the cycle (−7 … −2, +3, +4)');

-- A price change applies from the next cycle.
insert into public.group_prices (center_id, group_id, price_amount, cycle_lessons, effective_from)
values (pg_temp.id('center_a'), pg_temp.id('g1'), 70000000, 12, pg_temp.d('today') - 17);
select is((pg_temp.charge('e_s1', 2)).amount, 54000000::bigint, 'a charge already issued keeps its price');
select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('e_s5', public.enroll(pg_temp.id('s5'), pg_temp.id('g1'), pg_temp.d('today') - 40, 1000, 0, 'Sibling')::text);
select pg_temp.as_admin();
select is(pg_temp.cycles('e_s5'), '1:54000000 2:63000000',
  'each cycle uses the price effective at its start (600 000 then 700 000, −10%)');

-- Schedule changes move the end of a cycle, never its amount.
select pg_temp.login(pg_temp.id('adm_bill'));
select public.cancel_lesson(
  (select id from public.lessons where group_id = pg_temp.id('g1') and local_date = pg_temp.d('today') + 2),
  'Teacher is ill');
select pg_temp.as_admin();
select is((pg_temp.window_of('e_s1', 2)).expected_last_date, pg_temp.d('today') + 8,
  'a lesson cancelled by the center pushes the cycle end one lesson later');
select pg_temp.login(pg_temp.id('adm_bill'));
select public.add_holiday(pg_temp.id('center_a'), pg_temp.d('today') + 4, 'Holiday', pg_temp.id('a1'));
select pg_temp.as_admin();
select is((pg_temp.window_of('e_s1', 2)).expected_last_date, pg_temp.d('today') + 10, '... and so does a holiday');
select pg_temp.login(pg_temp.id('adm_bill'));
select public.freeze_enrollment(pg_temp.id('e_s1'), pg_temp.d('today') + 10, pg_temp.d('today') + 12, 'Travel');
select pg_temp.as_admin();
select is((pg_temp.window_of('e_s1', 2)).expected_last_date, pg_temp.d('today') + 14, '... and so does a freeze');
select is(pg_temp.cycles('e_s1'), '1:54000000 2:54000000', 'the amounts never changed');

-- ---------------------------------------------------------------------------
-- Payments: receipt numbers, default accounts, balance, notification, permissions
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_pay'));
select pg_temp.put('p1', public.record_payment(pg_temp.id('s1'), 54000000, 'cash')::text);
select is(pg_temp.get('p1')::jsonb ->> 'receiptNo', format('CHI-%s-000001', pg_temp.get('year')),
  'receipt numbers are {branch code}-{year}-{000001}');
select is((pg_temp.get('p1')::jsonb ->> 'balance')::bigint, -54000000::bigint,
  'the RPC returns the balance after the payment (two cycles charged, one paid)');
select is(public.record_payment(pg_temp.id('s1'), 1000000, 'card') ->> 'receiptNo',
  format('CHI-%s-000002', pg_temp.get('year')), 'the next payment gets the next number');
select public.record_payment(pg_temp.id('s1'), 1000000, 'transfer');
select pg_temp.as_admin();
select is(
  (select string_agg(p.method || '→' || a.kind, ' ' order by p.receipt_no) from public.payments p
   join public.accounts a on a.id = p.account_id where p.student_id = pg_temp.id('s1')),
  'cash→cash card→terminal transfer→bank', 'default accounts: cash → branch cash, card → terminal, transfer → bank');
select is(
  (select count(*)::int from public.notification_outbox
   where template_key = 'payment_received' and guardian_id = pg_temp.id('mother')),
  3, 'payment_received goes to the guardian who receives billing messages');
select is(
  (select count(*)::int from public.notification_outbox
   where template_key = 'payment_received' and guardian_id = pg_temp.id('father')), 0,
  '... not to one who opted out of billing');

select pg_temp.login(pg_temp.id('t1'));
select throws_ok(format($$ select public.record_payment(%L, 100000, 'cash') $$, pg_temp.id('s1')),
  '42501', 'forbidden', 'teachers cannot record payments');
select pg_temp.login(pg_temp.id('adm_a2'));
select throws_ok(format($$ select public.record_payment(%L, 100000, 'cash') $$, pg_temp.id('s1')),
  '42501', 'forbidden', 'an admin of another branch cannot record payments for this student');
select pg_temp.login(pg_temp.id('adm_pay'));
select throws_ok(format($$ select public.record_payment(%L, 0, 'cash') $$, pg_temp.id('s1')),
  'P0001', 'invalid_amount', 'the amount must be positive');
select throws_ok(format($$ select public.record_payment(%L, 100000, 'online') $$, pg_temp.id('s1')),
  'P0001', 'invalid_method', 'online payments come with M8');
select throws_ok(
  format($$ select public.record_payment(%L, 100000, 'cash', null, now() - interval '8 days') $$, pg_temp.id('s1')),
  'P0001', 'backdate_limit', 'backdating more than 7 days needs the void flag');
select lives_ok(
  format($$ select public.record_payment(%L, 100000, 'cash', null, now() - interval '6 days') $$, pg_temp.id('s1')),
  'backdating up to 7 days is fine');
select throws_ok(
  format($$ insert into public.payments (center_id, branch_id, student_id, account_id, amount, method, receipt_no)
            values (%L, %L, %L, (select id from public.accounts limit 1), 1, 'cash', 'X') $$,
         pg_temp.id('center_a'), pg_temp.id('a1'), pg_temp.id('s1')),
  '42501', null, 'nobody inserts payments directly');

-- ---------------------------------------------------------------------------
-- FIFO balances and debtors (fixtures with manual charges)
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
insert into public.charges (center_id, student_id, is_manual, cycle_start_date, due_date, price_amount, amount, created_at)
values
  (pg_temp.id('center_a'), pg_temp.id('s11'), true, pg_temp.d('today') - 50, pg_temp.d('today') - 40, 1000, 1000, now() - interval '3 days'),
  (pg_temp.id('center_a'), pg_temp.id('s11'), true, pg_temp.d('today') - 20, pg_temp.d('today') - 10, 2000, 2000, now() - interval '2 days'),
  (pg_temp.id('center_a'), pg_temp.id('s11'), true, pg_temp.d('today'), pg_temp.d('today') + 5, 3000, 3000, now() - interval '1 day'),
  (pg_temp.id('center_a'), pg_temp.id('s12'), true, pg_temp.d('today') - 101, pg_temp.d('today') - 91, 5000, 5000, now());
insert into public.payments (center_id, branch_id, student_id, account_id, amount, method, receipt_no)
values (pg_temp.id('center_a'), pg_temp.id('a1'), pg_temp.id('s11'),
        (select id from public.accounts where branch_id = pg_temp.id('a1') and kind = 'cash'), 1500, 'cash', 'FIFO-1');
insert into public.balance_adjustments (center_id, student_id, kind, amount, reason) values
  (pg_temp.id('center_a'), pg_temp.id('s11'), 'correction', 500, 'Goodwill'),
  (pg_temp.id('center_a'), pg_temp.id('s11'), 'opening_balance', -700, null);

select pg_temp.login(pg_temp.id('adm_bill'));
select is(
  (select row(charged, paid, adjusted, balance)::text from public.student_balances where student_id = pg_temp.id('s11')),
  '(6000,1500,-200,-4700)', 'balance = payments + adjustments − charges');
select results_eq(
  format($$ select item_kind || ':' || amount || '/' || covered || '/' || outstanding || '/' || days_overdue
            from public.charge_debts where student_id = %L order by due_date $$, pg_temp.id('s11')),
  array['charge:1000/1000/0/0', 'charge:2000/1000/1000/10', 'adjustment:700/0/700/0', 'charge:3000/0/3000/0'],
  'FIFO: credits (1 500 paid + 500 credit) cover the oldest due first; an opening debt is a debt item too'
);
select is(
  (select row(debt, oldest_due_date, max_days_overdue, is_overdue, aging_bucket)::text from public.debtors
   where student_id = pg_temp.id('s11')),
  format('(4700,%s,10,t,0-30)', pg_temp.d('today') - 10), 'the debtor row: debt, oldest unpaid due date, aging');
select is((select aging_bucket from public.debtors where student_id = pg_temp.id('s12')), '90+',
  'more than 90 days overdue is the 90+ bucket');
select is((select count(*)::int from public.debtors where student_id = pg_temp.id('s2')), 1,
  'a charge not yet due still makes a (not overdue) debtor');
select is((select is_overdue from public.debtors where student_id = pg_temp.id('s2')), false, '... marked not overdue');

-- ---------------------------------------------------------------------------
-- Voids and adjustments
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_pay'));
select throws_ok(format($$ select public.void_payment(%L, 'Mistake') $$, (pg_temp.get('p1')::jsonb ->> 'paymentId')),
  '42501', 'forbidden', 'voiding needs the void flag');
select pg_temp.login(pg_temp.id('adm_bill'));
select throws_ok(format($$ select public.void_payment(%L, '  ') $$, (pg_temp.get('p1')::jsonb ->> 'paymentId')),
  'P0001', 'void_reason_required', 'a void needs a reason');
select pg_temp.put('bal_before', private.student_balance(pg_temp.id('s1'))::text);
select lives_ok(format($$ select public.void_payment(%L, 'Entered twice') $$, (pg_temp.get('p1')::jsonb ->> 'paymentId')),
  'an admin with the void flag voids a payment');
select is(private.student_balance(pg_temp.id('s1')), pg_temp.get('bal_before')::bigint - 54000000,
  'the balance updates');
select throws_ok(format($$ select public.void_payment(%L, 'Again') $$, (pg_temp.get('p1')::jsonb ->> 'paymentId')),
  'P0001', 'already_voided', 'a payment is voided once');
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.notification_outbox
   where dedupe_key like 'payment:' || (pg_temp.get('p1')::jsonb ->> 'paymentId') || ':%' and status = 'cancelled'),
  1, 'its pending payment message is cancelled');

select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('old_c2', (pg_temp.charge('e_s5', 2)).id::text);
select pg_temp.put('new_c2', public.void_charge(pg_temp.id('old_c2'), 'Wrong price', true)::text);
select pg_temp.as_admin();
select is((select status::text from public.charges where id = pg_temp.id('old_c2')), 'void', 'void and reissue: the old charge is void');
select is((select row(cycle_no, amount, reissue_of_id = pg_temp.id('old_c2'))::text from public.charges where id = pg_temp.id('new_c2')),
  '(2,63000000,t)', '... and the same cycle is issued again');

select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('waive', public.add_adjustment(pg_temp.id('s5'), 'waive', null, 'Scholarship', pg_temp.id('new_c2'))::text);
select pg_temp.put('wo', public.add_adjustment(pg_temp.id('s12'), 'write_off', null, 'Moved away')::text);
select throws_ok(format($$ select public.add_adjustment(%L, 'correction', null, 'x') $$, pg_temp.id('s5')),
  'P0001', 'invalid_amount', 'a correction needs an amount');
select throws_ok(format($$ select public.add_adjustment(%L, 'correction', 100, '') $$, pg_temp.id('s5')),
  'P0001', 'reason_required', 'adjustments need a reason');
select throws_ok(format($$ select public.add_adjustment(%L, 'opening_balance', 100, 'x') $$, pg_temp.id('s5')),
  'P0001', 'invalid_adjustment', 'opening balances come only from the import');
select pg_temp.as_admin();
select is((select amount from public.balance_adjustments where id = pg_temp.id('waive')), 63000000::bigint,
  'a waive covers what is still owed on that charge');
select is(private.student_balance(pg_temp.id('s12')), 0::bigint, 'a write-off clears the debt');
select pg_temp.login(pg_temp.id('adm_pay'));
select throws_ok(format($$ select public.add_adjustment(%L, 'correction', 100, 'x') $$, pg_temp.id('s5')),
  '42501', 'forbidden', 'adjustments need the adjustments flag');
select pg_temp.login(pg_temp.id('adm_bill'));
select lives_ok(format($$ select public.void_adjustment(%L, 'Wrong student') $$, pg_temp.id('wo')),
  'an adjustment can be voided');
select is(private.student_balance(pg_temp.id('s12')), -5000::bigint, '... and the debt is back');

-- Nothing financial is deleted or edited in place.
select pg_temp.as_admin();
select throws_ok(format($$ delete from public.payments where id = %L $$, (pg_temp.get('p1')::jsonb ->> 'paymentId')),
  'P0001', 'financial_rows_permanent', 'payments cannot be deleted (trigger, even for the service role)');
select throws_ok(format($$ update public.charges set amount = 1 where id = %L $$, (pg_temp.charge('e_s1', 1)).id),
  'P0001', 'financial_rows_permanent', 'charges cannot be edited in place');
select throws_ok($$ truncate public.balance_adjustments $$, 'P0001', 'financial_rows_permanent',
  'adjustments cannot be truncated');
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(format($$ update public.payments set amount = 1 where student_id = %L $$, pg_temp.id('s1')),
  '42501', null, 'staff have no update grant on payments');

-- ---------------------------------------------------------------------------
-- Ending and transferring mid-cycle (leave_credit_policy)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('e_s6', public.enroll(pg_temp.id('s6'), pg_temp.id('g3'), pg_temp.d('today') - 4, 1000, 0, 'Promo')::text);
select pg_temp.put('e_s7', public.enroll(pg_temp.id('s7'), pg_temp.id('g3'), pg_temp.d('today') - 4, 1000, 0, 'Promo')::text);
select pg_temp.put('e_s8', public.enroll(pg_temp.id('s8'), pg_temp.id('g3'), pg_temp.d('today') - 4, 1000, 0, 'Promo')::text);
select pg_temp.put('e_s10', public.enroll(pg_temp.id('s10'), pg_temp.id('g3'), pg_temp.d('today') - 4, 1000, 0, 'Promo')::text);
select is(pg_temp.cycles('e_s6'), '1:54000000', 'cycle 1: 12 lessons, 540 000 UZS');
select is(
  (select row(unused, credit, policy)::text from public.unused_lessons_preview(pg_temp.id('e_s6'), pg_temp.d('today'))),
  '(7,31500000,ask)', 'ending after 5 of 12 lessons leaves 7 unused = 315 000 UZS (worked example 3)');
select throws_ok(
  format($$ select public.end_enrollment(%L, %L, 'dropped') $$, pg_temp.id('e_s6'), pg_temp.d('today')),
  'P0001', 'credit_choice_required', 'with policy ask, staff must choose credit or no credit');
select lives_ok(
  format($$ select public.end_enrollment(%L, %L, 'dropped', true) $$, pg_temp.id('e_s6'), pg_temp.d('today')),
  'ending with credit');
select pg_temp.as_admin();
select is(
  (select row(kind, amount, details ->> 'unused')::text from public.balance_adjustments where enrollment_id = pg_temp.id('e_s6')),
  '(unused_lessons,31500000,7)', 'the unused lessons are credited (315 000 UZS)');

update public.centers set leave_credit_policy = 'no_credit' where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('adm_bill'));
select public.end_enrollment(pg_temp.id('e_s7'), pg_temp.d('today'), 'dropped');
select pg_temp.as_admin();
select is((select count(*)::int from public.balance_adjustments where enrollment_id = pg_temp.id('e_s7')), 0,
  'policy no_credit: the started cycle stays fully paid');
update public.centers set leave_credit_policy = 'credit' where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('adm_bill'));
select public.end_enrollment(pg_temp.id('e_s8'), pg_temp.d('today'), 'completed');
select pg_temp.as_admin();
select is((select amount from public.balance_adjustments where enrollment_id = pg_temp.id('e_s8')), 31500000::bigint,
  'policy credit: credited without asking');
update public.centers set leave_credit_policy = 'ask' where id = pg_temp.id('center_a');

select pg_temp.login(pg_temp.id('adm_bill'));
select pg_temp.put('e_s10b', public.transfer_enrollment(pg_temp.id('e_s10'), pg_temp.id('g1'), pg_temp.d('today') + 1)::text);
select pg_temp.as_admin();
select is((select amount from public.balance_adjustments where enrollment_id = pg_temp.id('e_s10')), 31500000::bigint,
  'a transfer always credits the old group''s unused lessons (policy ask, no question)');
select is((select count(*)::int from public.charges where enrollment_id = pg_temp.id('e_s10b') and cycle_no = 1), 1,
  '... and cycle 1 starts in the new group');

-- Cycles that haven't started by the end date are voided.
select pg_temp.login(pg_temp.id('adm_bill'));
select public.end_enrollment(pg_temp.id('e_s1'), pg_temp.d('today') - 17, 'dropped');
select pg_temp.as_admin();
select is(
  (select row(status, void_reason)::text from public.charges where enrollment_id = pg_temp.id('e_s1') and cycle_no = 2),
  '(void,enrollment_ended)', 'ending before cycle 2 starts voids cycle 2');
select is(pg_temp.cycles('e_s1'), '1:54000000', 'cycle 1 (fully used) stays');

-- ---------------------------------------------------------------------------
-- Opening balances (import)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_bill'));
insert into public.import_jobs (center_id, kind, file_path)
values (pg_temp.id('center_a'), 'opening_balances', pg_temp.get('center_a') || '/ob1.xlsx');
select pg_temp.put('job1', (select id from public.import_jobs where file_path like '%ob1.xlsx')::text);
select is(
  public.import_opening_balances(pg_temp.id('job1'),
    jsonb_build_array(jsonb_build_object('phone', '+998901111111', 'fullName', 'Ali Valiyev', 'amount', '-500000'))),
  '{"created": 1, "skipped": 0}'::jsonb, 'an opening balance becomes an adjustment');
insert into public.import_jobs (center_id, kind, file_path)
values (pg_temp.id('center_a'), 'opening_balances', pg_temp.get('center_a') || '/ob2.xlsx');
select is(
  public.import_opening_balances((select id from public.import_jobs where file_path like '%ob2.xlsx'),
    jsonb_build_array(jsonb_build_object('phone', '+998901111111', 'fullName', 'Ali Valiyev', 'amount', '-500000'))),
  '{"created": 0, "skipped": 1}'::jsonb, 're-importing creates no duplicate');
insert into public.import_jobs (center_id, kind, file_path)
values (pg_temp.id('center_a'), 'opening_balances', pg_temp.get('center_a') || '/ob3.xlsx');
select throws_ok(
  format($$ select public.import_opening_balances(%L, %L::jsonb) $$,
    (select id from public.import_jobs where file_path like '%ob3.xlsx'),
    jsonb_build_array(jsonb_build_object('fullName', 'Nobody', 'phone', '+998909999999', 'amount', '100'))),
  'P0001', 'import_student_not_found', 'an unknown student stops the whole import');
select pg_temp.as_admin();
select is(
  (select row(kind, amount)::text from public.balance_adjustments where student_id = pg_temp.id('s1') and kind = 'opening_balance'),
  '(opening_balance,-500000)', 'negative = an existing debt');

-- ---------------------------------------------------------------------------
-- Who sees money (RLS on every table and view)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.charges), 0, 'teachers see no charges');
select is((select count(*)::int from public.payments), 0, 'teachers see no payments');
select is((select count(*)::int from public.balance_adjustments), 0, 'teachers see no adjustments');
select is((select count(*)::int from public.accounts), 0, 'teachers see no accounts');
select is((select count(*)::int from public.charge_cycles), 0, 'teachers see no charge cycles');
select is((select count(*)::int from public.student_balances), 0, 'teachers see no balances');
select is((select count(*)::int from public.charge_debts), 0, 'teachers see no debts');
select is((select count(*)::int from public.debtors), 0, 'teachers see no debtors');
select throws_ok(format($$ select public.student_balance(%L) $$, pg_temp.id('s1')), '42501', 'forbidden',
  'teachers cannot ask for a balance');
select throws_ok($$ select * from public.receipt_sequences $$, '42501', null, 'nobody reads receipt sequences directly');

select pg_temp.login(pg_temp.id('adm_pay'));
select is((select count(*)::int from public.charges), 0, 'without billing: no charges');
select ok((select count(*) from public.payments) > 0, 'with payments: the payments they record');
select is((select count(*)::int from public.student_balances), 0, 'without billing: no balances');
select ok((select count(*) from public.accounts) > 0, 'with payments: the accounts to choose from');

select pg_temp.login(pg_temp.id('adm_a2'));
select is((select count(*)::int from public.charges), 0, 'an admin of another branch sees none of these charges');
select is((select count(*)::int from public.debtors), 0, '... nor debtors');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.charges), 0, 'another center sees no charges');
select is((select count(*)::int from public.payments), 0, '... no payments');
select is((select count(*)::int from public.accounts where center_id = pg_temp.id('center_a')), 0, '... no accounts');
select pg_temp.login(pg_temp.id('adm_bill'));
select ok((select count(*) from public.charge_cycles) > 0, 'billing admins read the cycles');

-- The currency is fixed once something was charged.
select pg_temp.as_admin();
select throws_ok(format($$ update public.centers set currency = 'USD' where id = %L $$, pg_temp.id('center_a')),
  'P0001', 'currency_locked', 'the currency can''t change after the first charge');

select * from finish();
rollback;
