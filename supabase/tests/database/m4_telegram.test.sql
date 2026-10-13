-- M4a · Telegram & SMS data layer: the worker role and its functions (claim, mark, recover, link, bot reads),
-- payment reminders (cadence, quiet hours, none after paying), charge_created, broadcasts (preview = queued),
-- staff alerts, template overrides and RLS of the new tables. Run with `pnpm db:test`.
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

create function pg_temp.student(p_center text, p_branch text, p_name text, p_phone text default null) returns text
language sql as $$
  insert into public.students (center_id, branch_id, full_name, phone)
  values (pg_temp.id(p_center), pg_temp.id(p_branch), p_name, p_phone)
  returning id::text;
$$;

-- Outbox rows of center A for a template key (read as postgres).
create function pg_temp.rows(p_key text) returns int language sql as $$
  select count(*)::int from public.notification_outbox
  where center_id = pg_temp.id('center_a') and template_key = p_key;
$$;

-- The latest outbox row of center A for a key and recipient (a student or guardian fixture name).
create function pg_temp.row_for(p_key text, p_recipient text) returns public.notification_outbox language sql as $$
  select o.* from public.notification_outbox o
  where o.center_id = pg_temp.id('center_a') and o.template_key = p_key
    and coalesce(o.guardian_id, o.student_id, o.membership_id) = pg_temp.id(p_recipient)
  order by o.created_at desc, o.id limit 1;
$$;

-- Moves a student's reminders back by p_days (payload date and dedupe key), as if sent earlier.
create function pg_temp.age_reminders(p_student text, p_days int) returns void language sql as $$
  update public.notification_outbox
  set payload = jsonb_set(payload, '{reminderDate}', to_jsonb(to_char(pg_temp.d('today') - p_days, 'YYYY-MM-DD'))),
      dedupe_key = replace(dedupe_key, to_char(pg_temp.d('today'), 'YYYY-MM-DD'),
                           to_char(pg_temp.d('today') - p_days, 'YYYY-MM-DD'))
  where template_key = 'payment_reminder' and payload ->> 'studentId' = pg_temp.id(p_student)::text
    and payload ->> 'reminderDate' = to_char(pg_temp.d('today'), 'YYYY-MM-DD');
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: center A (branches a1, a2) and center B; guardian "mother" has the same phone in both centers.
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998940000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998940000002', 'Owner B')::text);
select pg_temp.put('adm_a1', pg_temp.new_user('+998940000003', 'Admin A1')::text);
select pg_temp.put('adm_a2', pg_temp.new_user('+998940000004', 'Admin A2')::text);
select pg_temp.put('t1', pg_temp.new_user('+998940000005', 'Teacher One')::text);
select pg_temp.put('t2', pg_temp.new_user('+998940000006', 'Teacher Two')::text);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Center A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent');
select pg_temp.put('a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);
select pg_temp.put('m_owner_a', (select id from public.memberships where center_id = pg_temp.id('center_a') and role = 'owner')::text);

select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Center B', 'Asia/Tashkent', 'ru', 'Main')::text);
select pg_temp.put('b1', (select id from public.branches where center_id = pg_temp.id('center_b'))::text);

select pg_temp.put('m_adm_a1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_a1'), 'admin', 'Admin A1',
  '+998940000003', array[pg_temp.id('a1')], array['students', 'billing', 'payments', 'broadcasts', 'academics'])::text);
select pg_temp.put('m_adm_a2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_a2'), 'admin', 'Admin A2',
  '+998940000004', array[pg_temp.id('a2')], array['students', 'billing', 'broadcasts'])::text);
select pg_temp.put('m_t1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t1'), 'teacher', 'Teacher One',
  '+998940000005', array[pg_temp.id('a1')])::text);
select pg_temp.put('m_t2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t2'), 'teacher', 'Teacher Two',
  '+998940000006', array[pg_temp.id('a1')])::text);

select pg_temp.as_admin();
select pg_temp.put('today', private.today_in('Asia/Tashkent')::text);
update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00'
where id in (pg_temp.id('center_a'), pg_temp.id('center_b'));
insert into public.courses (center_id, name) values (pg_temp.id('center_a'), 'English');

-- g1 (a1) and g2 (a2): 12-lesson cycles at 600 000 UZS, lessons every 2 days from today − 40 to today + 30.
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g1', public.create_group(pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')),
  'G1', pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_t1'),
  p_price_amount => 60000000, p_cycle_lessons => 12::smallint)::text);
select pg_temp.put('g2', public.create_group(pg_temp.id('a2'), (select id from public.courses where center_id = pg_temp.id('center_a')),
  'G2', pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_owner_a'),
  p_price_amount => 60000000, p_cycle_lessons => 12::smallint)::text);
select pg_temp.put('gx', public.create_group(pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')),
  'GX', pg_temp.d('today'), p_teacher_membership_id => pg_temp.id('m_t1'))::text);
select pg_temp.as_admin();
select pg_temp.series('g1', -40, 30, 2, '10:00');
select pg_temp.series('g2', -40, 30, 2, '12:00');

select pg_temp.put('s1', pg_temp.student('center_a', 'a1', 'Ali Valiyev', '+998901111111'));
select pg_temp.put('s2', pg_temp.student('center_a', 'a1', 'Bobur Karimov'));
select pg_temp.put('s3', pg_temp.student('center_a', 'a1', 'Sardor Tursunov', '+998903333333'));
select pg_temp.put('s4', pg_temp.student('center_a', 'a2', 'Dilnoza Rahimova', '+998904444444'));
select pg_temp.put('s5', pg_temp.student('center_a', 'a1', 'No Debt'));
select pg_temp.put('sb1', pg_temp.student('center_b', 'b1', 'Ali Bek'));
insert into public.guardians (center_id, full_name, phone) values
  (pg_temp.id('center_a'), 'Malika Valiyeva', '+998902222222'),
  (pg_temp.id('center_b'), 'Malika Valiyeva', '+998902222222');
select pg_temp.put('mother', (select id from public.guardians where center_id = pg_temp.id('center_a'))::text);
select pg_temp.put('mother_b', (select id from public.guardians where center_id = pg_temp.id('center_b'))::text);
insert into public.student_guardians (center_id, student_id, guardian_id) values
  (pg_temp.id('center_a'), pg_temp.id('s1'), pg_temp.id('mother')),
  (pg_temp.id('center_b'), pg_temp.id('sb1'), pg_temp.id('mother_b'));

-- s1 and s4 owe two overdue cycles; s3's first cycle is due in 2 days; s2's starts in 2 days.
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('e_s1', public.enroll(pg_temp.id('s1'), pg_temp.id('g1'), pg_temp.d('today') - 40)::text);
select pg_temp.put('e_s2', public.enroll(pg_temp.id('s2'), pg_temp.id('g1'), pg_temp.d('today') + 1)::text);
select pg_temp.put('e_s3', public.enroll(pg_temp.id('s3'), pg_temp.id('g1'), pg_temp.d('today') - 8)::text);
select pg_temp.put('e_s4', public.enroll(pg_temp.id('s4'), pg_temp.id('g2'), pg_temp.d('today') - 40)::text);
select pg_temp.as_admin();

-- ---------------------------------------------------------------------------
-- Setup: tables, RLS, the worker role
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('broadcasts', 'bot_sessions', 'system_heartbeats')
       and not c.relrowsecurity $$,
  'broadcasts, bot_sessions and system_heartbeats have RLS enabled'
);
select is_empty(
  $$ select tablename from pg_policies where schemaname = 'public' and tablename in ('bot_sessions', 'system_heartbeats') $$,
  'bot_sessions and system_heartbeats have no policies (worker only)'
);
select ok(not has_table_privilege('authenticated', 'public.bot_sessions', 'select')
          and not has_table_privilege('authenticated', 'public.system_heartbeats', 'select'),
  'signed-in users cannot read bot sessions or heartbeats');
select ok(not has_schema_privilege('authenticated', 'worker', 'usage')
          and not has_schema_privilege('anon', 'worker', 'usage'),
  'the worker schema is closed to anon and signed-in users');
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'worker'
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')
            or not has_function_privilege('uteach_worker', p.oid, 'execute')) $$,
  'every worker function is executable by uteach_worker only'
);
select ok(not has_table_privilege('uteach_worker', 'public.notification_outbox', 'select')
          and not has_table_privilege('uteach_worker', 'public.students', 'select'),
  'uteach_worker has no direct table access');
select ok(not has_function_privilege('uteach_worker', 'public.record_payment(uuid, bigint, public.payment_method, uuid, timestamptz, text, text, uuid)', 'execute'),
  'uteach_worker cannot call staff RPCs');

select is(
  (select string_agg(coalesce(extract(epoch from private.outbox_backoff(a))::int::text, 'null'), ' ' order by a)
   from generate_series(1, 6) a),
  '30 120 600 3600 null null', 'backoff: 30 s, 2 min, 10 min, 1 h, then give up after the 5th attempt'
);

select is(
  (select count(*)::int from (values ('absence_alert'), ('late_alert'), ('lesson_cancelled'), ('lesson_moved'),
     ('lesson_added'), ('payment_received'), ('charge_created'), ('payment_reminder'), ('payment_due_soon'),
     ('broadcast'), ('substitute_assigned'), ('schedule_conflict')) k (key)
   where (select count(*) from public.notification_templates t
          where t.center_id is null and t.key = k.key and t.channel = 'telegram' and t.locale in ('uz', 'ru', 'en')) = 3),
  12, 'every key queued so far has a Telegram system template in uz, ru and en');
select is(
  (select count(*)::int from public.notification_templates
   where center_id is null and channel = 'sms' and sms_provider_template_id is null
     and key in ('absence_alert', 'payment_reminder', 'lesson_cancelled')),
  9, 'SMS templates for the critical keys are seeded without an Eskiz id');

-- ---------------------------------------------------------------------------
-- charge_created (15)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.notification_outbox
           where template_key = 'charge_created' and payload ->> 'studentId' = pg_temp.id('s3')::text), 1,
  'a new cycle charge that is not yet due queues charge_created');
select is((select payload ->> 'dueDate' from pg_temp.row_for('charge_created', 's3')),
  to_char(pg_temp.d('today') + 2, 'YYYY-MM-DD'), '... with its due date');
select is((select count(*)::int from public.notification_outbox
           where template_key = 'charge_created' and payload ->> 'studentId' = pg_temp.id('s1')::text), 0,
  'catching up an old enrollment does not message charges already past due');

-- ---------------------------------------------------------------------------
-- Payment reminders (15)
-- ---------------------------------------------------------------------------
select is(private.enqueue_payment_reminders_for(pg_temp.id('center_a')), 3,
  'the daily job queues 2 overdue reminders and 1 due-soon');
select is((select guardian_id from pg_temp.row_for('payment_reminder', 'mother')), pg_temp.id('mother'),
  'the reminder goes to the guardian who receives billing messages');
select is((select payload ->> 'debt' from pg_temp.row_for('payment_reminder', 'mother')),
  (-private.student_balance(pg_temp.id('s1')))::text, '... with the whole debt in minor units');
select is((select payload ->> 'oldestDueDate' from pg_temp.row_for('payment_reminder', 'mother')),
  to_char(pg_temp.d('today') - 30, 'YYYY-MM-DD'), '... and the oldest due date');
select is((select student_id from pg_temp.row_for('payment_reminder', 's4')), pg_temp.id('s4'),
  'a student without guardians gets it directly');
select is((select payload ->> 'chargeId' from pg_temp.row_for('payment_due_soon', 's3')),
  (select id::text from public.charges where enrollment_id = pg_temp.id('e_s3')), 'due soon names the charge');
select is(pg_temp.rows('payment_reminder') + pg_temp.rows('payment_due_soon'), 3, 's2 (due in 12 days) gets nothing');
select is(private.enqueue_payment_reminders_for(pg_temp.id('center_a')), 0, 'running it again the same day adds nothing');

select pg_temp.age_reminders('s1', 2);
select pg_temp.age_reminders('s4', 2);
select is(private.enqueue_payment_reminders_for(pg_temp.id('center_a')), 0,
  'two days after a reminder (every 3 days) there is none');
update public.notification_outbox
set payload = jsonb_set(payload, '{reminderDate}', to_jsonb(to_char(pg_temp.d('today') - 3, 'YYYY-MM-DD'))),
    dedupe_key = replace(dedupe_key, to_char(pg_temp.d('today') - 2, 'YYYY-MM-DD'),
                         to_char(pg_temp.d('today') - 3, 'YYYY-MM-DD'))
where template_key = 'payment_reminder';
select is(private.enqueue_payment_reminders_for(pg_temp.id('center_a')), 2,
  'three days after the last reminder the next one is queued');
select is(pg_temp.rows('payment_reminder'), 4, '... so each debtor now has two');

update public.centers set reminder_every_days = 7 where id = pg_temp.id('center_a');
update public.notification_outbox
set payload = jsonb_set(payload, '{reminderDate}', to_jsonb(to_char(pg_temp.d('today') - 5, 'YYYY-MM-DD'))),
    dedupe_key = dedupe_key || ':aged'
where template_key = 'payment_reminder';
select is(private.enqueue_payment_reminders_for(pg_temp.id('center_a')), 0, 'the cadence follows reminder_every_days');
update public.centers set reminder_every_days = 3 where id = pg_temp.id('center_a');

update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '23:59' where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('adm_a1'));
select is(public.send_payment_reminder(pg_temp.id('s1')), 1, 'Debtors → Send reminder queues one now');
select is(public.send_payment_reminder(pg_temp.id('s1')), 0, '... at most once a day');
select pg_temp.as_admin();
select ok((select send_after from public.notification_outbox
           where template_key = 'payment_reminder' and dedupe_key like '%:manual:%')
          >= ((pg_temp.d('today') + time '23:59') at time zone 'Asia/Tashkent'),
  'nothing is sent in quiet hours: send_after moves to their end');
update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where id = pg_temp.id('center_a');
select is(private.last_reminder_date(pg_temp.id('center_a'), pg_temp.id('s1')), pg_temp.d('today'),
  'a manual reminder counts as the last reminder');

select pg_temp.login(pg_temp.id('adm_a1'));
select throws_ok(format($$ select public.send_payment_reminder(%L) $$, pg_temp.id('s5')), 'P0001', 'no_debt',
  'a student without debt gets no reminder');
select pg_temp.login(pg_temp.id('adm_a2'));
select throws_ok(format($$ select public.send_payment_reminder(%L) $$, pg_temp.id('s1')), '42501', null,
  'admins of another branch cannot send it');
select pg_temp.login(pg_temp.id('t1'));
select throws_ok(format($$ select public.send_payment_reminder(%L) $$, pg_temp.id('s1')), '42501', null,
  'teachers cannot send it');
select pg_temp.as_admin();

-- ---------------------------------------------------------------------------
-- Linking and the bot's reads (17)
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from worker.link_contact(5001, 5001, '998902222222', 'ru') $$, 'P0001', 'invalid_phone',
  'phones must be E.164');
select is((select count(*)::int from worker.link_contact(5001, 5001, '+998902222222', 'ru')), 2,
  'a guardian''s contact links them in every center that has the phone');
select is((select count(*)::int from worker.link_contact(5001, 5001, '+998902222222', 'ru')), 2,
  'sharing again keeps the same links');
select is((select count(*)::int from public.telegram_links where telegram_user_id = 5001), 2, '... without duplicates');
select is(
  (select string_agg(student_name || '/' || relation, ', ' order by student_name) from worker.bot_subjects(5001)),
  'Ali Bek/child, Ali Valiyev/child', 'the bot offers each child, across centers'
);
select is((select subject from worker.link_contact(5002, 5002, '+998940000006', 'uz')), 'staff',
  'a staff member''s contact links their membership');
select is_empty($$ select * from worker.bot_subjects(5002) $$, 'staff links have no children in the menu');
select is((select count(*)::int from worker.link_contact(5003, 5003, '+998903333333', 'en')), 1,
  'a student with a phone links to themselves');
select is((select relation from worker.bot_subjects(5003)), 'self', '... and sees their own data');

select is((select count(*)::int from worker.bot_schedule(5001, pg_temp.id('s1'), pg_temp.d('today'), pg_temp.d('today') + 6)),
  4, 'schedule: this week''s lessons of the child');
select is((select (worker.bot_payments(5001, pg_temp.id('s1')) ->> 'balance')),
  private.student_balance(pg_temp.id('s1'))::text, 'payments: the balance');
select is((select jsonb_array_length(worker.bot_payments(5001, pg_temp.id('s1')) -> 'debts')), 2,
  '... and the open debts');
select throws_ok(format($$ select worker.bot_payments(5001, %L) $$, pg_temp.id('s4')), '42501', null,
  'nobody reads a student they are not linked to');
select throws_ok(format($$ select * from worker.bot_schedule(5003, %L, current_date, current_date) $$, pg_temp.id('s1')),
  '42501', null, '... not even another student of the same group');

select worker.set_session(5001, jsonb_build_object('step', 'menu', 'activeCenterId', pg_temp.id('center_b')));
select is((select active_center_id from public.bot_sessions where telegram_user_id = 5001), pg_temp.id('center_b'),
  'the session keeps the chosen center');
select is((worker.get_session(5001) ->> 'activeCenterId'), pg_temp.id('center_b')::text, '... and returns it');
select worker.set_session(5003, jsonb_build_object('activeCenterId', pg_temp.id('center_b')));
select is((select active_center_id from public.bot_sessions where telegram_user_id = 5003), null,
  'a center the user is not linked to is not kept');

-- ---------------------------------------------------------------------------
-- Sending: claim, mark sent / retry / failed, stale recovery (17)
-- ---------------------------------------------------------------------------
create temp table claimed on commit drop as select * from worker.claim_outbox(500);
create function pg_temp.job(p_key text, p_recipient text) returns claimed language sql as $$
  select c.* from claimed c
  where c.center_id = pg_temp.id('center_a') and c.template_key = p_key
    and coalesce(c.guardian_id, c.student_id, c.membership_id) = pg_temp.id(p_recipient)
  order by c.id limit 1;
$$;
select is((select count(*)::int from claimed where center_id = pg_temp.id('center_a')),
  (select count(*)::int from public.notification_outbox where center_id = pg_temp.id('center_a') and status = 'sending'),
  'claimed rows are marked sending');
select is((select count(*)::int from public.notification_outbox
           where center_id = pg_temp.id('center_a') and status = 'pending' and send_after <= now()), 0,
  'every due row was claimed');
select is((select attempts::int from public.notification_outbox where id = (pg_temp.job('payment_due_soon', 's3')).id), 1,
  'claiming counts an attempt');
select is((pg_temp.job('payment_reminder', 'mother')).telegram_chat_id, 5001::bigint,
  'a linked recipient gets their chat id');
select is((pg_temp.job('payment_reminder', 'mother')).locale, 'ru', '... and their bot language');
select ok((pg_temp.job('payment_reminder', 'mother')).telegram_body like 'Задолженность%',
  '... with the template in that language');
select is((pg_temp.job('payment_reminder', 's4')).telegram_chat_id, null, 'an unlinked recipient has no chat');
select is((pg_temp.job('payment_reminder', 's4')).phone, '+998904444444', '... but their phone for SMS');
select ok((pg_temp.job('payment_reminder', 's4')).sms_body is not null
          and (pg_temp.job('payment_reminder', 's4')).sms_template_id is null,
  '... and an SMS text that is not approved yet');
select is_empty(
  $$ select 1 from worker.claim_outbox(500) c where c.center_id = pg_temp.id('center_a') $$,
  'a second claim gets none of the rows being sent'
);

select ok(worker.mark_sent((pg_temp.job('charge_created', 's3')).id, 'sms', null, '+998903333333', 'eskiz-1'),
  'mark_sent');
select is((select status::text || ' ' || channel::text || ' ' || provider_message_id
           from public.notification_outbox where id = (pg_temp.job('charge_created', 's3')).id),
  'sent sms eskiz-1', '... stores the channel and the provider id');
select ok(not worker.mark_sent((pg_temp.job('charge_created', 's3')).id, 'sms'), '... only once');

select is(worker.mark_retry((pg_temp.job('payment_reminder', 's4')).id, 'timeout')::text, 'pending',
  'a retryable error goes back to pending');
select ok((select send_after between now() + interval '25 seconds' and now() + interval '35 seconds'
           from public.notification_outbox where id = (pg_temp.job('payment_reminder', 's4')).id),
  '... after 30 s');
update public.notification_outbox set attempts = 5 where id = (pg_temp.job('payment_due_soon', 's3')).id;
select is(worker.mark_retry((pg_temp.job('payment_due_soon', 's3')).id, 'timeout', 7200)::text, 'failed',
  'the 5th failed attempt gives up');

update public.notification_outbox set status = 'sending', locked_at = now() - interval '3 minutes'
where id = (pg_temp.job('payment_reminder', 's4')).id;
select is(worker.recover_stale(120), 1, 'a row stuck in sending for over 2 min is recovered');
select is((select status::text from public.notification_outbox where id = (pg_temp.job('payment_reminder', 's4')).id),
  'pending', '... back to pending');

-- Blocked bot: the links end and an approved SMS template gets a fallback row.
update public.centers set sms_enabled = true, sms_monthly_cap = 100 where id = pg_temp.id('center_a');
insert into public.notification_templates (center_id, key, channel, locale, body, sms_provider_template_id)
select pg_temp.id('center_a'), 'payment_reminder', 'sms', locale, body, 'eskiz-tpl-' || locale
from public.notification_templates where center_id is null and key = 'payment_reminder' and channel = 'sms';
select pg_temp.put('fallback', worker.mark_failed((pg_temp.job('payment_reminder', 'mother')).id, '403 blocked', true)::text);
select is((select status::text from public.notification_outbox where id = (pg_temp.job('payment_reminder', 'mother')).id),
  'failed', 'a permanent error fails the row');
select is((select count(*)::int from public.telegram_links where chat_id = 5001 and unlinked_at is null), 0,
  '... unlinks the chat in every center');
select is((select channel::text || ' ' || status::text from public.notification_outbox where id = pg_temp.id('fallback')),
  'sms pending', '... and queues the SMS fallback');
select is((select fallback_of_id from public.notification_outbox where id = pg_temp.id('fallback')),
  (pg_temp.job('payment_reminder', 'mother')).id, '... pointing at the failed row');
select is(worker.mark_failed((pg_temp.job('payment_reminder', 'mother')).id, 'again', true), null,
  'a row that is no longer being sent is left alone');

-- Paying before the fallback goes out: the reminder is skipped, not sent.
select pg_temp.login(pg_temp.id('owner_a'));
select public.record_payment(pg_temp.id('s1'), -private.student_balance(pg_temp.id('s1')), 'cash');
select pg_temp.as_admin();
select is_empty($$ select 1 from worker.claim_outbox(500) c where c.id = pg_temp.id('fallback') $$,
  'reminders about a paid debt are not claimed');
select is((select status::text || ' ' || last_error from public.notification_outbox where id = pg_temp.id('fallback')),
  'skipped settled', '... they are skipped as settled');
select pg_temp.put('n_s1', (select count(*) from public.notification_outbox
                             where template_key = 'payment_reminder' and payload ->> 'studentId' = pg_temp.id('s1')::text)::text);
update public.notification_outbox set payload = jsonb_set(payload, '{reminderDate}', '"2000-01-01"')
where template_key = 'payment_reminder';
select private.enqueue_payment_reminders_for(pg_temp.id('center_a'));
select is((select count(*)::text from public.notification_outbox
           where template_key = 'payment_reminder' and payload ->> 'studentId' = pg_temp.id('s1')::text),
  current_setting('t.n_s1'), 'and the job reminds no more after paying');

select worker.beat('worker', '{"version": "test"}');
select worker.beat('worker', '{"version": "test2"}');
select is((select info ->> 'version' from public.system_heartbeats where service = 'worker'), 'test2', 'heartbeats upsert');
select pg_temp.login(pg_temp.id('owner_a'));
select is((select count(*)::int from public.worker_health() where service = 'worker' and last_beat_at > now() - interval '1 minute'),
  1, 'owners see the worker heartbeat');
select pg_temp.login(pg_temp.id('t1'));
select throws_ok($$ select * from public.worker_health() $$, '42501', null, 'teachers do not');
select pg_temp.as_admin();
select is(worker.unlink(5003), 1, 'unlinking ends the user''s links');

-- ---------------------------------------------------------------------------
-- Broadcasts (17)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_a1'));
select pg_temp.put('aud', '{"debtors": true, "recipients": "guardians"}');
select pg_temp.put('preview', public.preview_broadcast(pg_temp.id('center_a'), current_setting('t.aud')::jsonb)::text);
select is((current_setting('t.preview')::jsonb ->> 'students')::int, 2,
  'debtors of the admin''s branch: s2 and s3 (s1 paid, s4 is in another branch)');
select pg_temp.put('bc', public.create_broadcast(pg_temp.id('center_a'), current_setting('t.aud')::jsonb,
  'Darslar 1-sentyabrdan', '{"ru": "Занятия с 1 сентября", "de": "ignored"}')::text);
select is((current_setting('t.bc')::jsonb ->> 'recipients')::int, (current_setting('t.preview')::jsonb ->> 'recipients')::int,
  'the broadcast reaches exactly the previewed number of recipients');
select pg_temp.as_admin();
select is((select count(*)::int from public.notification_outbox
           where broadcast_id = (current_setting('t.bc')::jsonb ->> 'broadcastId')::uuid),
  (current_setting('t.preview')::jsonb ->> 'recipients')::int, '... one outbox row each');
select is((select body_by_locale from public.broadcasts where id = (current_setting('t.bc')::jsonb ->> 'broadcastId')::uuid),
  '{"ru": "Занятия с 1 сентября"}'::jsonb, 'only known locales are kept');
select is((select branch_ids from public.broadcasts where id = (current_setting('t.bc')::jsonb ->> 'broadcastId')::uuid),
  array[pg_temp.id('a1')], 'the broadcast records the branches it reached');

select pg_temp.login(pg_temp.id('adm_a1'));
select is((select count(*)::int from public.broadcast_stats(array[(current_setting('t.bc')::jsonb ->> 'broadcastId')::uuid])
           where pending = 2), 1, 'stats count the pending messages');
select throws_ok(format($$ select public.create_broadcast(%L, '{"branch_ids": ["%s"]}', 'x') $$,
  pg_temp.id('center_a'), pg_temp.id('a2')), 'P0001', 'empty_audience', 'an admin cannot reach another branch');
select throws_ok(format($$ select public.create_broadcast(%L, '{}', 'x', '{}', 'sms') $$, pg_temp.id('center_a')),
  'P0001', 'sms_not_available', 'SMS broadcasts need an approved template');
select throws_ok(format($$ select public.preview_broadcast(%L, '{"recipients": "pets"}') $$, pg_temp.id('center_a')),
  'P0001', 'invalid_audience', 'unknown recipient kinds are rejected');
select is((public.preview_broadcast(pg_temp.id('center_a'),
  jsonb_build_object('student_ids', jsonb_build_array(pg_temp.id('s1')), 'recipients', 'both')) ->> 'recipients')::int, 2,
  'broadcast to a selection: the student and their guardian');
select is((public.preview_broadcast(pg_temp.id('center_a'),
  jsonb_build_object('group_ids', jsonb_build_array(pg_temp.id('g1')), 'recipients', 'students')) ->> 'students')::int, 3,
  'a group reaches its enrolled students');
select pg_temp.login(pg_temp.id('adm_a2'));
select is((select count(*)::int from public.broadcasts), 0, 'admins of another branch do not see it');
select throws_ok(format($$ select public.cancel_broadcast(%L) $$, current_setting('t.bc')::jsonb ->> 'broadcastId'),
  '42501', null, '... nor cancel it');
select pg_temp.login(pg_temp.id('t1'));
select throws_ok(format($$ select public.preview_broadcast(%L, '{}') $$, pg_temp.id('center_a')), '42501', null,
  'teachers cannot broadcast');
select is((select count(*)::int from public.broadcasts), 0, '... nor see broadcasts');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.broadcasts), 0, 'another center sees none');
select pg_temp.login(pg_temp.id('adm_a1'));
select is(public.cancel_broadcast((current_setting('t.bc')::jsonb ->> 'broadcastId')::uuid), 2,
  'cancelling stops the messages not sent yet');
select is((select status from public.broadcasts where id = (current_setting('t.bc')::jsonb ->> 'broadcastId')::uuid),
  'cancelled', '... and marks the broadcast');
select pg_temp.as_admin();

-- ---------------------------------------------------------------------------
-- Staff alerts (17)
-- ---------------------------------------------------------------------------
select pg_temp.put('future_l', (select id from public.lessons where group_id = pg_temp.id('g1')
                                 and local_date = pg_temp.d('today') + 4)::text);
select pg_temp.login(pg_temp.id('owner_a'));
select public.substitute_teacher(pg_temp.id('future_l'), pg_temp.id('m_t2'));
select pg_temp.as_admin();
select is((select status::text from pg_temp.row_for('substitute_assigned', 'm_t2')), 'pending',
  'the substitute gets an alert');
select is((select payload ->> 'group' from pg_temp.row_for('substitute_assigned', 'm_t2')), 'G1', '... about the lesson');
select pg_temp.login(pg_temp.id('owner_a'));
select public.substitute_teacher(pg_temp.id('future_l'), pg_temp.id('m_t1'));
select pg_temp.as_admin();
select is((select status::text from pg_temp.row_for('substitute_assigned', 'm_t2')), 'cancelled',
  'undoing the substitution takes the alert back');
select is((select count(*)::int from public.notification_outbox
           where template_key = 'substitute_assigned' and membership_id = pg_temp.id('m_t1')), 0,
  'the original teacher gets nothing');

insert into public.group_schedule_rules (center_id, group_id, weekday, start_time, duration_minutes, valid_from, valid_to)
values (pg_temp.id('center_a'), pg_temp.id('gx'), 1, '09:00', 60, pg_temp.d('today') + 400, pg_temp.d('today') + 401);
insert into public.schedule_conflicts (center_id, branch_id, group_id, rule_id, local_date, conflict_kind)
select pg_temp.id('center_a'), pg_temp.id('a1'), pg_temp.id('gx'), r.id, pg_temp.d('today') + 400 + n, 'room'
from public.group_schedule_rules r, generate_series(0, 1) n where r.group_id = pg_temp.id('gx');
select is(
  (select string_agg(m.display_name, ', ' order by m.display_name) from public.notification_outbox o
   join public.memberships m on m.id = o.membership_id
   where o.center_id = pg_temp.id('center_a') and o.template_key = 'schedule_conflict'),
  'Admin A1, Owner A', 'conflicts alert the owner and branch admins with academics, once per group per day');

-- ---------------------------------------------------------------------------
-- Outbox and template RLS
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_a1'));
select ok((select count(*) from public.notification_outbox where student_id = pg_temp.id('s3')) > 0,
  'admins read rows about students of their branch');
select is((select count(*)::int from public.notification_outbox where student_id = pg_temp.id('s4')), 0,
  '... not about other branches');
select ok((select count(*) from public.notification_outbox where guardian_id = pg_temp.id('mother')) > 0,
  '... and rows to the guardians of their students');
select is((select count(*)::int from public.notification_outbox where membership_id is not null), 0,
  '... but not staff alerts');
select is((select count(*)::int from public.last_payment_reminders where student_id = pg_temp.id('s1')), 1,
  'Debtors reads the last reminder per student');
select pg_temp.login(pg_temp.id('adm_a2'));
select ok((select count(*) from public.notification_outbox where student_id = pg_temp.id('s4')) > 0,
  'the other branch''s admin reads theirs');
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.notification_outbox), 0, 'teachers read no outbox rows');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.notification_outbox where center_id = pg_temp.id('center_a')), 0,
  'another center reads none');

select pg_temp.login(pg_temp.id('owner_a'));
select lives_ok(format($$ insert into public.notification_templates (center_id, key, channel, locale, body)
                          values (%L, 'absence_alert', 'telegram', 'uz', 'Bizning matn: {student}') $$, pg_temp.id('center_a')),
  'owners override a template for their center');
update public.notification_templates set body = 'x' where center_id is null;
select is((select count(*)::int from public.notification_templates where body = 'x'), 0, 'system templates stay read-only');
select is((select (private.template_for(pg_temp.id('center_a'), 'absence_alert', 'telegram', 'uz')).body),
  'Bizning matn: {student}', 'the override wins over the system text');
select lives_ok($$ delete from public.notification_templates where body = 'Bizning matn: {student}' $$,
  '"Reset to default" deletes the override');
select ok((select (private.template_for(pg_temp.id('center_a'), 'absence_alert', 'telegram', 'uz')).center_id is null),
  '... and the system text applies again');
select pg_temp.login(pg_temp.id('adm_a1'));
select throws_ok(format($$ insert into public.notification_templates (center_id, key, channel, locale, body)
                          values (%L, 'absence_alert', 'telegram', 'ru', 'x') $$, pg_temp.id('center_a')),
  '42501', null, 'admins without the settings flag cannot');
select pg_temp.login(pg_temp.id('owner_b'));
select throws_ok(format($$ insert into public.notification_templates (center_id, key, channel, locale, body)
                          values (%L, 'absence_alert', 'telegram', 'ru', 'x') $$, pg_temp.id('center_a')),
  '42501', null, 'nor can another center');

select * from finish();
rollback;
