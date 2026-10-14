-- M7c · Role dashboards: every number of dashboard_owner (all branches and each branch), dashboard_admin (an
-- admin of one branch, with and without permissions) and dashboard_teacher against a fixture center, plus RLS.
-- Lessons are inserted with local_date = today and times relative to now(), so the counts don't move at midnight.
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

create function pg_temp.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, true); $$;
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

-- A lesson on `p_day` (local_date) with times relative to now().
create function pg_temp.lesson(p_group text, p_day date, p_starts timestamptz, p_minutes int, p_teacher text,
                               p_status public.lesson_status default 'scheduled')
returns text
language sql
as $$
  insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at, teacher_membership_id,
                              status, is_manually_edited)
  select g.center_id, g.branch_id, g.id, p_day, p_starts, p_starts + make_interval(mins => p_minutes),
         pg_temp.id(p_teacher), p_status, true
  from public.groups g where g.id = pg_temp.id(p_group)
  returning id::text;
$$;

create function pg_temp.student(p_branch text, p_name text) returns text language sql as $$
  insert into public.students (center_id, branch_id, full_name) values (pg_temp.id('c'), pg_temp.id(p_branch), p_name)
  returning id::text;
$$;

create function pg_temp.enroll(p_student text, p_group text, p_start date, p_end date default null) returns void
language sql as $$
  insert into public.enrollments (center_id, student_id, group_id, start_date, end_date, end_reason, status)
  values (pg_temp.id('c'), pg_temp.id(p_student), pg_temp.id(p_group), p_start, p_end,
          case when p_end is null then null else 'completed'::public.enrollment_end_reason end,
          case when p_end is null then 'active'::public.enrollment_status else 'ended' end);
$$;

create function pg_temp.pay(p_student text, p_branch text, p_amount bigint, p_at timestamptz, p_no text,
                            p_voided boolean default false) returns void
language sql as $$
  insert into public.payments (center_id, branch_id, student_id, account_id, amount, method, receipt_no, paid_at,
                               voided_at, void_reason)
  values (pg_temp.id('c'), pg_temp.id(p_branch), pg_temp.id(p_student),
          (select a.id from public.accounts a where a.branch_id = pg_temp.id(p_branch) and a.kind = 'cash' limit 1),
          p_amount, 'cash', p_no, p_at,
          case when p_voided then now() end, case when p_voided then 'mistake' end);
$$;

create function pg_temp.charge(p_student text, p_due date, p_amount bigint, p_voided boolean default false)
returns void
language sql as $$
  insert into public.charges (center_id, student_id, is_manual, cycle_start_date, due_date, price_amount, amount,
                              status, voided_at, void_reason)
  values (pg_temp.id('c'), pg_temp.id(p_student), true, p_due, p_due, p_amount, p_amount,
          case when p_voided then 'void'::public.charge_status else 'open' end,
          case when p_voided then now() end, case when p_voided then 'mistake' end);
$$;

create function pg_temp.owner(p_branch text default null) returns jsonb language sql as $$
  select public.dashboard_owner(pg_temp.id('c'), case when p_branch is null then null else pg_temp.id(p_branch) end);
$$;

-- ---------------------------------------------------------------------------
-- Fixture: center C, branches A and B (Tashkent). T = today, M = the first of this month.
-- ---------------------------------------------------------------------------
select pg_temp.put('owner', pg_temp.new_user('+998976000001', 'Dash Owner')::text);
select pg_temp.put('u_adm_a', pg_temp.new_user('+998976000002', 'Admin A')::text);
select pg_temp.put('u_adm_b', pg_temp.new_user('+998976000003', 'Admin B')::text);
select pg_temp.put('u_t_a', pg_temp.new_user('+998976000004', 'Teacher A')::text);
select pg_temp.put('u_t_b', pg_temp.new_user('+998976000005', 'Teacher B')::text);
select pg_temp.put('other', pg_temp.new_user('+998976000006', 'Other Owner')::text);

select pg_temp.login(pg_temp.id('other'));
select pg_temp.put('c_other', public.create_center('Other Dash', 'Asia/Tashkent', 'uz', 'Main')::text);
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('c', public.create_center('Dash Center', 'Asia/Tashkent', 'uz', 'A')::text);
select pg_temp.as_admin();
select pg_temp.put('a', (select id from public.branches where center_id = pg_temp.id('c'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('c'), 'B', 'Asia/Tashkent');
select pg_temp.put('b', (select id from public.branches where center_id = pg_temp.id('c') and name = 'B')::text);
select pg_temp.put('T', private.today_in('Asia/Tashkent')::text);
select pg_temp.put('M', date_trunc('month', pg_temp.d('T'))::date::text);

select pg_temp.put('adm_a', pg_temp.hire(pg_temp.id('c'), pg_temp.id('u_adm_a'), 'admin', 'Admin A', '+998976000002',
  array[pg_temp.id('a')], array['billing', 'leads', 'academics'])::text);
select pg_temp.put('adm_b', pg_temp.hire(pg_temp.id('c'), pg_temp.id('u_adm_b'), 'admin', 'Admin B', '+998976000003',
  array[pg_temp.id('b')])::text);
select pg_temp.put('t_a', pg_temp.hire(pg_temp.id('c'), pg_temp.id('u_t_a'), 'teacher', 'Teacher A', '+998976000004',
  array[pg_temp.id('a')])::text);
select pg_temp.put('t_b', pg_temp.hire(pg_temp.id('c'), pg_temp.id('u_t_b'), 'teacher', 'Teacher B', '+998976000005',
  array[pg_temp.id('b')])::text);

insert into public.courses (center_id, name) values (pg_temp.id('c'), 'English');
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('g_a', public.create_group(pg_temp.id('a'), (select id from public.courses where center_id = pg_temp.id('c')),
  'Group A', pg_temp.d('T') - 90, p_teacher_membership_id => pg_temp.id('t_a'))::text);
select pg_temp.put('g_a2', public.create_group(pg_temp.id('a'), (select id from public.courses where center_id = pg_temp.id('c')),
  'Group A empty', pg_temp.d('T') - 90, p_teacher_membership_id => pg_temp.id('t_a'))::text);
select pg_temp.put('g_b', public.create_group(pg_temp.id('b'), (select id from public.courses where center_id = pg_temp.id('c')),
  'Group B', pg_temp.d('T') - 90, p_teacher_membership_id => pg_temp.id('t_b'))::text);
select pg_temp.as_admin();

-- Students: A1, A2 since long ago; A3 from the 1st of this month; A4 ended on the last day of last month;
-- B1 since long ago; B2 from today.
select pg_temp.put('sA1', pg_temp.student('a', 'Student A1'));
select pg_temp.put('sA2', pg_temp.student('a', 'Student A2'));
select pg_temp.put('sA3', pg_temp.student('a', 'Student A3'));
select pg_temp.put('sA4', pg_temp.student('a', 'Student A4'));
select pg_temp.put('sB1', pg_temp.student('b', 'Student B1'));
select pg_temp.put('sB2', pg_temp.student('b', 'Student B2'));
select pg_temp.enroll('sA1', 'g_a', pg_temp.d('T') - 60);
select pg_temp.enroll('sA2', 'g_a', pg_temp.d('T') - 60);
select pg_temp.enroll('sA3', 'g_a', pg_temp.d('M'));
select pg_temp.enroll('sA4', 'g_a', pg_temp.d('T') - 80, pg_temp.d('M') - 1);
select pg_temp.enroll('sB1', 'g_b', pg_temp.d('T') - 60);
select pg_temp.enroll('sB2', 'g_b', pg_temp.d('T'));

-- Lessons: L1 today, ended 10 min ago (A); L2 today in an hour (B); L3 today cancelled (A);
-- L4 yesterday, ended a day ago, unmarked (A, inside the 48 h window); L5 five days ago, unmarked (outside).
select pg_temp.put('L1', pg_temp.lesson('g_a', pg_temp.d('T'), now() - interval '100 minutes', 90, 't_a'));
select pg_temp.put('L2', pg_temp.lesson('g_b', pg_temp.d('T'), now() + interval '60 minutes', 90, 't_b'));
select pg_temp.put('L3', pg_temp.lesson('g_a', pg_temp.d('T'), now() + interval '2 hours', 90, 't_a', 'cancelled'));
select pg_temp.put('L4', pg_temp.lesson('g_a', pg_temp.d('T') - 1, now() - interval '1 day', 90, 't_a'));
select pg_temp.put('L5', pg_temp.lesson('g_a', pg_temp.d('T') - 5, now() - interval '5 days', 90, 't_a'));
insert into public.attendance (center_id, group_id, lesson_id, student_id, enrollment_id, status, marked_by)
select pg_temp.id('c'), pg_temp.id('g_a'), pg_temp.id('L1'), e.student_id, e.id, x.status::public.attendance_status,
       pg_temp.id('u_t_a')
from (values ('sA1', 'present'), ('sA2', 'late'), ('sA3', 'absent')) x (k, status)
join public.enrollments e on e.student_id = pg_temp.id(x.k);

-- Money. Charges: A1 600 000 due the 1st; A2 200 000 due last month (paid); A3 5 000 due 100 days ago;
-- B1 400 000 due the 1st, and a voided 100 000.
select pg_temp.charge('sA1', pg_temp.d('M'), 600000);
select pg_temp.charge('sA2', pg_temp.d('M') - 5, 200000);
select pg_temp.charge('sA3', pg_temp.d('T') - 100, 5000);
select pg_temp.charge('sB1', pg_temp.d('M'), 400000);
select pg_temp.charge('sB1', pg_temp.d('M'), 100000, true);
-- Payments: A2 200 000 now (A); B1 300 000 at 00:00:30 on the 1st (B); A4 50 000 last month (A); a voided one now.
select pg_temp.pay('sA2', 'a', 200000, now(), 'D-1');
select pg_temp.pay('sB1', 'b', 300000, (pg_temp.d('M') + time '00:00:30') at time zone 'Asia/Tashkent', 'D-2');
select pg_temp.pay('sA4', 'a', 50000, ((pg_temp.d('M') - 1) + time '12:00') at time zone 'Asia/Tashkent', 'D-3');
select pg_temp.pay('sA1', 'a', 999, now(), 'D-4', true);

-- Leads: L-A new now (A) with an overdue task, a done task; L-B1 created last month (B), moved to Won now;
-- L-B2 new now (B) with a trial on L2 and a task due in two days.
insert into public.leads (center_id, branch_id, full_name, status, created_at) values
  (pg_temp.id('c'), pg_temp.id('a'), 'Lead A', 'new', now()),
  (pg_temp.id('c'), pg_temp.id('b'), 'Lead B1', 'contacted', ((pg_temp.d('M') - 1) + time '12:00') at time zone 'Asia/Tashkent'),
  (pg_temp.id('c'), pg_temp.id('b'), 'Lead B2', 'trial_scheduled', now());
select pg_temp.put('ldA', (select id from public.leads where full_name = 'Lead A')::text);
select pg_temp.put('ldB1', (select id from public.leads where full_name = 'Lead B1')::text);
select pg_temp.put('ldB2', (select id from public.leads where full_name = 'Lead B2')::text);
insert into public.lead_activities (center_id, lead_id, kind, from_status, to_status, body, due_at, done_at) values
  (pg_temp.id('c'), pg_temp.id('ldB1'), 'status_change', 'trial_done', 'won', null, null, null),
  (pg_temp.id('c'), pg_temp.id('ldA'), 'task', null, null, 'Call back', now() - interval '1 hour', null),
  (pg_temp.id('c'), pg_temp.id('ldA'), 'task', null, null, 'Done already', now() - interval '2 hours', now()),
  (pg_temp.id('c'), pg_temp.id('ldB2'), 'task', null, null, 'Later', now() + interval '2 days', null);
insert into public.lead_trials (center_id, lead_id, lesson_id) values (pg_temp.id('c'), pg_temp.id('ldB2'), pg_temp.id('L2'));

-- Telegram: A3 is linked; A1's mother is linked. A2, B1 and B2 have nothing.
insert into public.guardians (center_id, full_name, phone) values (pg_temp.id('c'), 'Mother A1', '+998976100001');
insert into public.student_guardians (center_id, student_id, guardian_id)
values (pg_temp.id('c'), pg_temp.id('sA1'), (select id from public.guardians where phone = '+998976100001'));
insert into public.telegram_links (center_id, telegram_user_id, chat_id, phone, student_id) values
  (pg_temp.id('c'), 9100001, 9100001, '+998976100002', pg_temp.id('sA3'));
insert into public.telegram_links (center_id, telegram_user_id, chat_id, phone, guardian_id) values
  (pg_temp.id('c'), 9100002, 9100002, '+998976100001', (select id from public.guardians where phone = '+998976100001'));

-- An open schedule conflict in A (rule far in the future, so nothing is generated from it).
insert into public.group_schedule_rules (center_id, group_id, weekday, start_time, duration_minutes, valid_from)
values (pg_temp.id('c'), pg_temp.id('g_a'), 1, '10:00', 90, pg_temp.d('T') + 400);
insert into public.schedule_conflicts (center_id, branch_id, group_id, rule_id, local_date, conflict_kind)
values (pg_temp.id('c'), pg_temp.id('a'), pg_temp.id('g_a'),
        (select id from public.group_schedule_rules where group_id = pg_temp.id('g_a')), pg_temp.d('T') + 400, 'room');

-- ---------------------------------------------------------------------------
-- Owner, all branches
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('o', pg_temp.owner()::text);
create function pg_temp.o(p text[]) returns text language sql as $$ select current_setting('t.o')::jsonb #>> p; $$;

select is(pg_temp.o('{today,lessons}'), '2', 'today: 2 lessons (the cancelled one and yesterday''s left out)');
select is(pg_temp.o('{today,marked_lessons}'), '1', '... 1 fully marked (L1), L2 not yet');
select is(format('%s/%s/%s', pg_temp.o('{today,present}'), pg_temp.o('{today,late}'), pg_temp.o('{today,absent}')),
  '1/1/1', '... marks today: 1 present, 1 late, 1 absent (attendance 2 of 3)');
select is(
  format('%s/%s', pg_temp.o('{today,payments_amount}'), pg_temp.o('{today,payments_count}')),
  case when pg_temp.d('T') = pg_temp.d('M') then '500000/2' else '200000/1' end,
  'payments today: not voided, paid today');
select is(pg_temp.o('{month,charged}'), '1000000',
  'charged this month: charges due this month, not voided (last month''s and the 100-day-old one left out)');
select is(pg_temp.o('{month,collected}'), '500000', 'collected this month: payments this month, not voided');
select is(pg_temp.o('{debt,total}'), '705000', 'debt: 600 000 + 5 000 + 100 000');
select is(pg_temp.o('{debt,students}'), '3', '... 3 debtors');
select is(
  format('%s/%s/%s/%s', pg_temp.o('{debt,buckets,0-30}'), pg_temp.o('{debt,buckets,31-60}'),
         pg_temp.o('{debt,buckets,61-90}'), pg_temp.o('{debt,buckets,90+}')),
  '700000/0/0/5000', '... by the Debtors page''s buckets');
select is(
  (select sum(debt)::text from public.debtors where center_id = pg_temp.id('c')), pg_temp.o('{debt,total}'),
  '... the same total as the Debtors page');
select is(pg_temp.o('{students,active}'), '5', 'active students today: A1, A2, A3, B1, B2');
select is(pg_temp.o('{students,active_last_month}'), '4', '... on the last day of last month: A1, A2, A4, B1');
select is(format('%s/%s', pg_temp.o('{leads,new}'), pg_temp.o('{leads,won}')), '2/1',
  'leads: 2 new this month, 1 won this month');
select is(
  (select string_agg(format('%s:%s:%s:%s:%s', x ->> 'name', x ->> 'lessons_today', x ->> 'active_students',
                            x ->> 'collected_month', x ->> 'debt'), ' ' order by x ->> 'name')
   from jsonb_array_elements(current_setting('t.o')::jsonb -> 'branches') x),
  'A:1:3:200000:605000 B:1:2:300000:100000', 'a card per branch');

-- Owner, one branch
select pg_temp.put('o', pg_temp.owner('a')::text);
select is(
  format('%s|%s|%s|%s|%s|%s', pg_temp.o('{today,lessons}'), pg_temp.o('{month,charged}'), pg_temp.o('{month,collected}'),
         pg_temp.o('{debt,total}'), pg_temp.o('{students,active}'), pg_temp.o('{leads,new}')),
  '1|600000|200000|605000|3|1', 'the branch filter: branch A only');
select is(jsonb_array_length(current_setting('t.o')::jsonb -> 'branches'), 1, '... and only its card');
select pg_temp.put('o', pg_temp.owner('b')::text);
select is(
  format('%s|%s|%s|%s|%s|%s|%s', pg_temp.o('{today,lessons}'), pg_temp.o('{month,charged}'),
         pg_temp.o('{month,collected}'), pg_temp.o('{debt,total}'), pg_temp.o('{students,active}'),
         pg_temp.o('{students,active_last_month}'), pg_temp.o('{leads,won}')),
  '1|400000|300000|100000|2|1|1', 'branch B only');

select throws_ok(format($$ select public.dashboard_owner(%L) $$, pg_temp.id('c_other')), '42501', 'forbidden',
  'an owner of another center gets nothing');
select pg_temp.login(pg_temp.id('u_adm_a'));
select throws_ok(format($$ select public.dashboard_owner(%L) $$, pg_temp.id('c')), '42501', 'forbidden',
  'admins don''t get the owner dashboard');

-- ---------------------------------------------------------------------------
-- Admin A (branch A; billing, leads, academics)
-- ---------------------------------------------------------------------------
select pg_temp.put('o', public.dashboard_admin(pg_temp.id('c'))::text);
select is(
  (select string_agg(format('%s:%s/%s', x ->> 'group', x ->> 'marked', x ->> 'expected'), ' ')
   from jsonb_array_elements(current_setting('t.o')::jsonb -> 'lessons') x),
  'Group A:3/3', 'admin A: today''s lessons in A only, with marks / expected');
select is(
  (select string_agg(format('%s:%s', x ->> 'name', x ->> 'debt'), ' ' order by (x ->> 'debt')::bigint desc)
   from jsonb_array_elements(current_setting('t.o')::jsonb -> 'debtors') x),
  'Student A1:600000 Student A3:5000', '... top debtors of A, largest first');
select is(
  (select string_agg(x ->> 'body', ' ') from jsonb_array_elements(current_setting('t.o')::jsonb -> 'follow_ups') x),
  'Call back', '... follow-ups due by tonight (done and later ones left out)');
select is(pg_temp.o('{follow_ups_overdue}'), '1', '... 1 overdue');
select is(jsonb_array_length(current_setting('t.o')::jsonb -> 'trials'), 0, '... no trials in A today');
select is(pg_temp.o('{no_telegram}'), '1', '... 1 active student in A without Telegram (A2)');
select is(pg_temp.o('{conflicts}'), '1', '... 1 open schedule conflict');

-- Admin B (branch B, no permissions)
select pg_temp.login(pg_temp.id('u_adm_b'));
select pg_temp.put('o', public.dashboard_admin(pg_temp.id('c'))::text);
select is(
  (select string_agg(format('%s:%s/%s', x ->> 'group', x ->> 'marked', x ->> 'expected'), ' ')
   from jsonb_array_elements(current_setting('t.o')::jsonb -> 'lessons') x),
  'Group B:0/2', 'admin B: Group B, nothing marked yet');
select is(current_setting('t.o')::jsonb -> 'debtors', 'null'::jsonb, '... no debtors without the billing permission');
select is(jsonb_array_length(current_setting('t.o')::jsonb -> 'follow_ups'), 0, '... no leads without the permission');
select is(pg_temp.o('{no_telegram}'), '2', '... B1 and B2 without Telegram');
select is(pg_temp.o('{conflicts}'), '0', '... no conflicts without academics');
select pg_temp.login(pg_temp.id('owner'));
select is(
  (select string_agg(x ->> 'name', ' ') from jsonb_array_elements(public.dashboard_admin(pg_temp.id('c')) -> 'trials') x),
  'Lead B2', 'the owner sees today''s trial on L2');
select pg_temp.login(pg_temp.id('u_t_a'));
select throws_ok(format($$ select public.dashboard_admin(%L) $$, pg_temp.id('c')), '42501', 'forbidden',
  'teachers don''t get the admin dashboard');

-- ---------------------------------------------------------------------------
-- Teachers
-- ---------------------------------------------------------------------------
select pg_temp.put('o', public.dashboard_teacher(pg_temp.id('c'))::text);
select is(
  (select string_agg(format('%s:%s/%s', x ->> 'id' = pg_temp.id('L4')::text, x ->> 'marked', x ->> 'expected'), ' ')
   from jsonb_array_elements(current_setting('t.o')::jsonb -> 'to_mark') x),
  't:0/3', 'teacher A: only yesterday''s L4 is left to mark (L1 is done, L5 is past the window)');
select is(
  (select string_agg(format('%s:%s', x ->> 'name', x ->> 'students'), ' ' order by x ->> 'name')
   from jsonb_array_elements(current_setting('t.o')::jsonb -> 'groups') x),
  'Group A:3 Group A empty:0', '... their groups with active students');
select is(
  (select string_agg(x ->> 'name', ' ') from jsonb_array_elements(current_setting('t.o')::jsonb -> 'scores_to_enter') x),
  'Group A', '... scores to enter: groups with students and no score in 30 days');
select ok(not (current_setting('t.o')::jsonb ?| array['debt', 'month', 'debtors']), '... and no money');
select pg_temp.login(pg_temp.id('u_t_b'));
select is(
  (select string_agg(x ->> 'name', ' ') from jsonb_array_elements(public.dashboard_teacher(pg_temp.id('c')) -> 'groups') x),
  'Group B', 'teacher B sees only Group B');
select is(jsonb_array_length(public.dashboard_teacher(pg_temp.id('c')) -> 'to_mark'), 0,
  '... L2 hasn''t started, so nothing to mark');
select pg_temp.login(pg_temp.id('other'));
select throws_ok(format($$ select public.dashboard_teacher(%L) $$, pg_temp.id('c')), '42501', 'forbidden',
  'a member of another center gets nothing');
select throws_ok(format($$ select public.dashboard_admin(%L) $$, pg_temp.id('c')), '42501', 'forbidden',
  '... from any dashboard');

select * from finish();
rollback;
