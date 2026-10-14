-- M2 · Attendance: expected students, the sheet RPCs and edit window, audit, alerts in the outbox, quiet hours,
-- "notify students?" on lesson changes, templates, and RLS on the new tables. Run with `pnpm db:test`.
-- Times are relative to now() (fixed for the whole transaction), so the test passes at any hour.
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

-- A lesson inserted directly (as postgres), so its time can be anywhere relative to now().
create function pg_temp.lesson(p_group text, p_starts timestamptz, p_minutes int, p_teacher text,
                               p_original text default null, p_status public.lesson_status default 'scheduled')
returns text
language sql
as $$
  insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at, teacher_membership_id,
                              original_teacher_membership_id, status, is_manually_edited)
  select g.center_id, g.branch_id, g.id, (p_starts at time zone 'Asia/Tashkent')::date, p_starts,
         p_starts + make_interval(mins => p_minutes), pg_temp.id(p_teacher),
         case when p_original is null then null else pg_temp.id(p_original) end, p_status, true
  from public.groups g where g.id = pg_temp.id(p_group)
  returning id::text;
$$;

create function pg_temp.at10(p_day date) returns timestamptz language sql as $$
  select (p_day + time '10:00') at time zone 'Asia/Tashkent';
$$;

create function pg_temp.student(p_name text) returns text language sql as $$
  insert into public.students (center_id, branch_id, full_name) values (pg_temp.id('center_a'), pg_temp.id('a1'), p_name)
  returning id::text;
$$;

create function pg_temp.enroll(p_student text, p_group text, p_start date, p_end date default null) returns text
language sql as $$
  insert into public.enrollments (center_id, student_id, group_id, start_date, end_date, end_reason, status)
  values (
    pg_temp.id('center_a'), pg_temp.id(p_student), pg_temp.id(p_group), p_start, p_end,
    case when p_end is null then null else 'completed'::public.enrollment_end_reason end,
    case when p_end is not null and p_end < pg_temp.d('today') then 'ended'::public.enrollment_status
         else 'active'::public.enrollment_status end
  )
  returning id::text;
$$;

create function pg_temp.guardian(p_student text, p_name text, p_phone text, p_notify boolean, p_locale text default null)
returns text
language plpgsql
as $$
declare
  v_id uuid;
begin
  select g.id into v_id from public.guardians g where g.center_id = pg_temp.id('center_a') and g.phone = p_phone;
  if v_id is null then
    insert into public.guardians (center_id, full_name, phone, locale)
    values (pg_temp.id('center_a'), p_name, p_phone, p_locale)
    returning id into v_id;
  end if;
  insert into public.student_guardians (center_id, student_id, guardian_id, receives_notifications)
  values (pg_temp.id('center_a'), pg_temp.id(p_student), v_id, p_notify);
  return v_id::text;
end;
$$;

-- pg_temp.rows('s1', 'absent', 's2', 'present') → [{"studentId": …, "status": "absent"}, …]
create function pg_temp.rows(variadic p_pairs text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('studentId', pg_temp.id(p_pairs[i]), 'status', p_pairs[i + 1]) order by i)
  from generate_series(1, array_length(p_pairs, 1), 2) i;
$$;

create function pg_temp.save(p_lesson text, p_rows jsonb, p_topic text default null) returns jsonb language sql as $$
  select public.save_attendance(pg_temp.id(p_lesson), p_rows, p_topic);
$$;

-- pg_temp.key('absence', 'now_l', 's1', 'mother') → 'absence:{lesson id}:{student id}:{guardian id}'
create function pg_temp.key(p_kind text, variadic p_names text[]) returns text language sql as $$
  select p_kind || ':' || string_agg(pg_temp.get(n), ':' order by o) from unnest(p_names) with ordinality u (n, o);
$$;

-- Outbox rows whose dedupe key starts with p_prefix (read as postgres).
create function pg_temp.queued(p_prefix text, p_status text default null) returns int language sql as $$
  select count(*)::int from public.notification_outbox o
  where starts_with(o.dedupe_key, p_prefix) and (p_status is null or o.status::text = p_status);
$$;

create function pg_temp.local_hm(p_at timestamptz) returns text language sql as $$
  select to_char(p_at at time zone 'Asia/Tashkent', 'HH24:MI');
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998920000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998920000002', 'Owner B')::text);
select pg_temp.put('adm_att', pg_temp.new_user('+998920000003', 'Admin Attendance')::text);
select pg_temp.put('adm_no', pg_temp.new_user('+998920000004', 'Admin No Flag')::text);
select pg_temp.put('adm_a2', pg_temp.new_user('+998920000005', 'Admin Other Branch')::text);
select pg_temp.put('t1', pg_temp.new_user('+998920000006', 'Teacher One')::text);
select pg_temp.put('t2', pg_temp.new_user('+998920000007', 'Teacher Two')::text);
select pg_temp.put('t3', pg_temp.new_user('+998920000008', 'Teacher Three')::text);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Center A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent');
select pg_temp.put('a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);
insert into public.rooms (center_id, branch_id, name) values (pg_temp.id('center_a'), pg_temp.id('a1'), 'Room 1');
select pg_temp.put('r1', (select id from public.rooms where center_id = pg_temp.id('center_a') and name = 'Room 1')::text);

select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Center B', 'Asia/Tashkent', 'ru', 'Main')::text);

select pg_temp.put('m_adm_att', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_att'), 'admin', 'Admin Attendance',
  '+998920000003', array[pg_temp.id('a1')], array['students', 'attendance', 'academics'])::text);
select pg_temp.put('m_adm_no', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_no'), 'admin', 'Admin No Flag',
  '+998920000004', array[pg_temp.id('a1')], array['students'])::text);
select pg_temp.put('m_adm_a2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_a2'), 'admin', 'Admin Other Branch',
  '+998920000005', array[pg_temp.id('a2')], array['attendance', 'academics'])::text);
select pg_temp.put('m_t1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t1'), 'teacher', 'Teacher One',
  '+998920000006', array[pg_temp.id('a1')])::text);
select pg_temp.put('m_t2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t2'), 'teacher', 'Teacher Two',
  '+998920000007', array[pg_temp.id('a1')])::text);
select pg_temp.put('m_t3', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t3'), 'teacher', 'Teacher Three',
  '+998920000008', array[pg_temp.id('a1')])::text);

select pg_temp.as_admin();
select pg_temp.put('today', private.today_in('Asia/Tashkent')::text);
select pg_temp.put('D', (pg_temp.d('today') - 10)::text);
-- Quiet hours off until the quiet-hours test turns them on.
update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where id = pg_temp.id('center_a');

insert into public.courses (center_id, name) values (pg_temp.id('center_a'), 'English');
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g1', public.create_group(
  pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')), 'G1',
  pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_t1'))::text);
select pg_temp.put('g2', public.create_group(
  pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')), 'G2',
  pg_temp.d('today') - 60, p_teacher_membership_id => pg_temp.id('m_t3'))::text);

select pg_temp.as_admin();
-- G1 (Teacher One): students with and without guardians; Ali and Aziza are siblings (shared mother).
select pg_temp.put('s1', pg_temp.student('Ali Valiyev'));
select pg_temp.put('s2', pg_temp.student('Bobur Karimov'));
select pg_temp.put('s3', pg_temp.student('Sardor Tursunov'));
select pg_temp.put('s4', pg_temp.student('Aziza Valiyeva'));
select pg_temp.put('e_s1', pg_temp.enroll('s1', 'g1', pg_temp.d('today') - 30));
select pg_temp.put('e_s2', pg_temp.enroll('s2', 'g1', pg_temp.d('today') - 30));
select pg_temp.put('e_s3', pg_temp.enroll('s3', 'g1', pg_temp.d('today') - 30));
select pg_temp.put('e_s4', pg_temp.enroll('s4', 'g1', pg_temp.d('today') - 30));
select pg_temp.put('mother', pg_temp.guardian('s1', 'Malika Valiyeva', '+998930000001', true, 'ru'));
select pg_temp.put('father', pg_temp.guardian('s1', 'Vali Valiyev', '+998930000002', false));
select pg_temp.put('mother2', pg_temp.guardian('s4', 'Malika Valiyeva', '+998930000001', true));
select pg_temp.put('g3', pg_temp.guardian('s3', 'Nodira Tursunova', '+998930000003', true));

-- G2 (Teacher Three): the expected-students edges around day D.
select pg_temp.put('s5', pg_temp.student('Outsider'));
select pg_temp.put('x1', pg_temp.student('Edge Start'));
select pg_temp.put('x2', pg_temp.student('Edge End'));
select pg_temp.put('x3', pg_temp.student('Edge Freeze'));
select pg_temp.put('e_s5', pg_temp.enroll('s5', 'g2', pg_temp.d('today') - 30));
select pg_temp.put('e_x1', pg_temp.enroll('x1', 'g2', pg_temp.d('D')));
select pg_temp.put('e_x2', pg_temp.enroll('x2', 'g2', pg_temp.d('D') - 20, pg_temp.d('D')));
select pg_temp.put('e_x3', pg_temp.enroll('x3', 'g2', pg_temp.d('D') - 20));
insert into public.enrollment_freezes (center_id, enrollment_id, from_date, to_date)
values (pg_temp.id('center_a'), pg_temp.id('e_x3'), pg_temp.d('D'), pg_temp.d('D'));

-- Lessons (G1 and G2 never overlap for one teacher).
select pg_temp.put('now_l', pg_temp.lesson('g1', now() - interval '20 minutes', 90, 'm_t1'));
select pg_temp.put('future_l', pg_temp.lesson('g1', now() + interval '3 hours', 90, 'm_t1'));
select pg_temp.put('edge_l', pg_temp.lesson('g1', now() - interval '47 hours' - interval '90 minutes', 90, 'm_t1'));
select pg_temp.put('old_l', pg_temp.lesson('g1', now() - interval '4 days', 90, 'm_t1'));
select pg_temp.put('sub_l', pg_temp.lesson('g1', now() - interval '2 hours', 60, 'm_t2', 'm_t1'));
select pg_temp.put('cancelled_l', pg_temp.lesson('g1', now() - interval '5 days', 90, 'm_t1', null, 'cancelled'));
select pg_temp.put('cancel_l', pg_temp.lesson('g1', now() + interval '1 day', 90, 'm_t1'));
select pg_temp.put('cancel2_l', pg_temp.lesson('g1', now() + interval '1 day 3 hours', 90, 'm_t1'));
select pg_temp.put('move_l', pg_temp.lesson('g1', now() + interval '2 days', 90, 'm_t1'));
select pg_temp.put('hol1_l', pg_temp.lesson('g1', pg_temp.at10(pg_temp.d('today') + 20), 90, 'm_t1'));
select pg_temp.put('hol2_l', pg_temp.lesson('g1', pg_temp.at10(pg_temp.d('today') + 21), 90, 'm_t1'));
select pg_temp.put('soon_l', pg_temp.lesson('g2', now() + interval '20 minutes', 60, 'm_t3'));
select pg_temp.put('e_m1', pg_temp.lesson('g2', pg_temp.at10(pg_temp.d('D') - 1), 60, 'm_t3'));
select pg_temp.put('e_0', pg_temp.lesson('g2', pg_temp.at10(pg_temp.d('D')), 60, 'm_t3'));
select pg_temp.put('e_p1', pg_temp.lesson('g2', pg_temp.at10(pg_temp.d('D') + 1), 60, 'm_t3'));

-- ---------------------------------------------------------------------------
-- New tables have RLS
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('attendance', 'telegram_links', 'notification_templates', 'notification_outbox')
       and not c.relrowsecurity $$,
  'attendance, telegram_links, notification_templates and notification_outbox have RLS enabled'
);

-- ---------------------------------------------------------------------------
-- Expected students: dates only (start, end, freezes)
-- ---------------------------------------------------------------------------
select set_eq(
  format($$ select s.full_name from private.expected_students(%L) x join public.students s on s.id = x.student_id $$,
         pg_temp.id('e_0')),
  array['Outsider', 'Edge Start', 'Edge End'],
  'day D: an enrollment starting or ending that day counts; a freeze covering the day does not'
);
select set_eq(
  format($$ select s.full_name from private.expected_students(%L) x join public.students s on s.id = x.student_id $$,
         pg_temp.id('e_m1')),
  array['Outsider', 'Edge End', 'Edge Freeze'],
  'the day before D: an enrollment that has not started yet does not count'
);
select set_eq(
  format($$ select s.full_name from private.expected_students(%L) x join public.students s on s.id = x.student_id $$,
         pg_temp.id('e_p1')),
  array['Outsider', 'Edge Start', 'Edge Freeze'],
  'the day after D: the ended enrollment no longer counts and the freeze is over'
);
select is(
  (select status::text from public.enrollments where id = pg_temp.id('e_x2')), 'ended',
  'Edge End''s enrollment is ended today, yet it counted on its last day (dates, not status)'
);

-- ---------------------------------------------------------------------------
-- Who may mark, and when
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t3'));
select throws_ok($$ select pg_temp.save('now_l', pg_temp.rows('s1', 'present')) $$,
  '42501', 'forbidden', 'a teacher of another group cannot mark the lesson');
select pg_temp.login(pg_temp.id('adm_no'));
select throws_ok($$ select pg_temp.save('now_l', pg_temp.rows('s1', 'present')) $$,
  '42501', 'forbidden', 'an admin without the attendance flag cannot mark');
select pg_temp.login(pg_temp.id('adm_a2'));
select throws_ok($$ select pg_temp.save('now_l', pg_temp.rows('s1', 'present')) $$,
  '42501', 'forbidden', 'an admin of another branch cannot mark');
select pg_temp.login(pg_temp.id('owner_b'));
select throws_ok($$ select pg_temp.save('now_l', pg_temp.rows('s1', 'present')) $$,
  '42501', 'forbidden', 'another center cannot mark');

select pg_temp.login(pg_temp.id('t1'));
select throws_ok($$ select pg_temp.save('future_l', pg_temp.rows('s1', 'present')) $$,
  'P0001', 'attendance_too_early', 'teachers cannot mark more than 30 min before the start');
select pg_temp.login(pg_temp.id('adm_att'));
select throws_ok($$ select pg_temp.save('future_l', pg_temp.rows('s1', 'present')) $$,
  'P0001', 'attendance_too_early', 'admins cannot mark a future lesson either');
select pg_temp.login(pg_temp.id('t3'));
select lives_ok($$ select pg_temp.save('soon_l', pg_temp.rows('s5', 'present')) $$,
  'marking opens 30 min before the start');

select pg_temp.login(pg_temp.id('t1'));
select throws_ok($$ select pg_temp.save('old_l', pg_temp.rows('s1', 'present')) $$,
  'P0001', 'attendance_window_closed', 'teachers cannot mark after ends_at + 48 h (enforced in the database)');
select lives_ok($$ select pg_temp.save('edge_l', pg_temp.rows('s1', 'present')) $$,
  'teachers can still mark 47 h after the end');
select throws_ok($$ select pg_temp.save('sub_l', pg_temp.rows('s1', 'present')) $$,
  '42501', 'forbidden', 'the original teacher cannot mark a lesson given to a substitute');
select throws_ok($$ select pg_temp.save('cancelled_l', pg_temp.rows('s1', 'present')) $$,
  'P0001', 'lesson_cancelled', 'a cancelled lesson cannot be marked');
select throws_ok($$ select pg_temp.save('now_l', pg_temp.rows('s5', 'present')) $$,
  'P0001', 'student_not_expected', 'a student of another group cannot be marked');
select throws_ok($$ select pg_temp.save('now_l', pg_temp.rows('s1', 'here')) $$,
  'P0001', 'invalid_attendance', 'an unknown status is rejected');
select throws_ok(
  $$ select pg_temp.save('now_l', jsonb_build_array(jsonb_build_object('studentId', pg_temp.id('s1'), 'status', 'late', 'lateMinutes', 0))) $$,
  'P0001', 'invalid_attendance', 'late minutes must be at least 1');
select throws_ok(
  $$ select pg_temp.save('now_l', jsonb_build_array(jsonb_build_object('studentId', pg_temp.id('s1'), 'status', 'late', 'lateMinutes', 300))) $$,
  'P0001', 'invalid_attendance', 'late minutes are at most 240');
select throws_ok($$ select pg_temp.save('now_l', '{}'::jsonb) $$,
  'P0001', 'invalid_attendance', 'rows must be an array');

select pg_temp.login(pg_temp.id('t2'));
select lives_ok($$ select pg_temp.save('sub_l', pg_temp.rows('s1', 'present')) $$,
  'the substitute marks the lesson');

-- ---------------------------------------------------------------------------
-- First save: rows, held, topic, absence alerts
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.put('res1', pg_temp.save('now_l', pg_temp.rows('s1', 'absent', 's2', 'absent', 's3', 'present', 's4', 'present'),
  'Unit 3: Past simple')::text);
select is((pg_temp.get('res1')::jsonb ->> 'saved')::int, 4, 'one call saves the whole sheet (four rows)');
select is((pg_temp.get('res1')::jsonb ->> 'alerts')::int, 2, 'and queues two absence alerts');

select pg_temp.as_admin();
select is((select status::text from public.lessons where id = pg_temp.id('now_l')), 'held',
  'the first save sets the lesson to held');
select is((select topic from public.lessons where id = pg_temp.id('now_l')), 'Unit 3: Past simple',
  'the topic is saved in the same request');
select is((select marked_by from public.attendance where lesson_id = pg_temp.id('now_l') and student_id = pg_temp.id('s1')),
  pg_temp.id('t1'), 'rows record who marked them');
select is(pg_temp.queued(pg_temp.key('absence', 'now_l') || ':'), 2,
  'two absences: Ali''s mother (the father opted out) and Bobur himself (no guardians)');
select is(
  (select guardian_id from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  pg_temp.id('mother'), 'the dedupe key is absence:{lesson}:{student}:{guardian}');
select is(
  (select locale from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  'ru', 'in the guardian''s language');
select is((select count(*)::int from public.notification_outbox where guardian_id = pg_temp.id('father')), 0,
  'a guardian who turned notifications off gets nothing');
select is(
  (select student_id from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's2', 's2')),
  pg_temp.id('s2'), 'a student without guardians gets the alert');
select is(
  (select locale from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's2', 's2')),
  'uz', 'in the center''s default language');
select ok(
  (select bool_and(send_after = now() + interval '10 minutes' and status = 'pending' and channel is null
                   and template_key = 'absence_alert')
   from public.notification_outbox where starts_with(dedupe_key, pg_temp.key('absence', 'now_l'))),
  'alerts wait 10 minutes, are pending, and leave the channel to the sender');
select is(
  (select payload ->> 'student' from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  'Ali Valiyev', 'the payload names the student');
select ok(
  (select payload ?& array['group', 'date', 'time', 'center', 'lessonId', 'studentId']
   from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  'and carries the lesson fields');
select is(
  (select payload ->> 'time' from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  pg_temp.local_hm(now() - interval '20 minutes'), 'with the start time in the branch timezone');

-- Re-saving the same marks changes nothing.
select pg_temp.login(pg_temp.id('t1'));
select is(
  (pg_temp.save('now_l', pg_temp.rows('s1', 'absent', 's2', 'absent', 's3', 'present', 's4', 'present')) ->> 'saved')::int,
  0, 're-saving unchanged marks writes nothing');
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('absence', 'now_l') || ':'), 2, 're-saving does not duplicate alerts');
select is((select count(*)::int from public.attendance where lesson_id = pg_temp.id('now_l')), 4,
  'still one row per student');

-- Absent → present cancels; → absent again revives the same row.
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', pg_temp.rows('s1', 'present'));
select pg_temp.as_admin();
select is(
  (select status::text from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  'cancelled', 'changing absent → present before sending cancels the alert');
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', pg_temp.rows('s1', 'absent'));
select pg_temp.as_admin();
select is(
  (select status::text from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  'pending', 'marking absent again brings the cancelled alert back');
select is(pg_temp.queued(pg_temp.key('absence', 'now_l', 's1') || ':'), 1, '... as the same row');

-- A row already sent is never sent again.
update public.notification_outbox set status = 'sent', sent_at = now()
where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother');
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', pg_temp.rows('s1', 'present'));
select pg_temp.save('now_l', pg_temp.rows('s1', 'absent'));
select pg_temp.as_admin();
select is(
  (select status::text from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's1', 'mother')),
  'sent', 'an alert that was already sent stays sent (no second message)');

-- Excused never alerts and cancels a pending absence alert.
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', pg_temp.rows('s2', 'excused'));
select pg_temp.as_admin();
select is(
  (select status::text from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's2', 's2')),
  'cancelled', 'absent → excused cancels the alert');
select is(pg_temp.queued(pg_temp.key('absence', 'now_l', 's2') || ':', 'pending'), 0, 'excused queues nothing');

-- Late: no alert by default; with late alerts on, one per guardian; minutes are kept.
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', jsonb_build_array(
  jsonb_build_object('studentId', pg_temp.id('s3'), 'status', 'late', 'lateMinutes', 7)));
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('late', 'now_l') || ':'), 0, 'late marks do not alert by default');
select is((select late_minutes from public.attendance where lesson_id = pg_temp.id('now_l') and student_id = pg_temp.id('s3')),
  7::smallint, 'late minutes are saved');

select pg_temp.login(pg_temp.id('owner_a'));
update public.centers set late_alert_enabled = true where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', jsonb_build_array(
  jsonb_build_object('studentId', pg_temp.id('s4'), 'status', 'late', 'lateMinutes', 5)));
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('late', 'now_l', 's4') || ':'), 1,
  'with late alerts on (owner setting), a late mark queues late_alert to the guardian');
select is(
  (select payload ->> 'minutes' from public.notification_outbox where dedupe_key = pg_temp.key('late', 'now_l', 's4', 'mother2')),
  '5', 'with the minutes');
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', jsonb_build_array(
  jsonb_build_object('studentId', pg_temp.id('s4'), 'status', 'present', 'lateMinutes', 5)));
select pg_temp.as_admin();
select is(
  (select status::text from public.notification_outbox where dedupe_key = pg_temp.key('late', 'now_l', 's4', 'mother2')),
  'cancelled', 'late → present cancels the late alert');
select is((select late_minutes from public.attendance where lesson_id = pg_temp.id('now_l') and student_id = pg_temp.id('s4')),
  null::smallint, 'minutes are dropped when the status is not late');

-- ---------------------------------------------------------------------------
-- Quiet hours
-- ---------------------------------------------------------------------------
select is(private.apply_quiet_hours('2026-10-12 22:00+05', 'Asia/Tashkent', '21:00', '08:00'),
  '2026-10-13 08:00+05'::timestamptz, 'quiet hours: 22:00 moves to 08:00 the next morning');
select is(private.apply_quiet_hours('2026-10-13 07:59+05', 'Asia/Tashkent', '21:00', '08:00'),
  '2026-10-13 08:00+05'::timestamptz, 'quiet hours: 07:59 moves to 08:00 the same day');
select is(private.apply_quiet_hours('2026-10-12 21:00+05', 'Asia/Tashkent', '21:00', '08:00'),
  '2026-10-13 08:00+05'::timestamptz, 'quiet hours: the start is quiet');
select is(private.apply_quiet_hours('2026-10-13 08:00+05', 'Asia/Tashkent', '21:00', '08:00'),
  '2026-10-13 08:00+05'::timestamptz, 'quiet hours: the end is not quiet');
select is(private.apply_quiet_hours('2026-10-12 20:59+05', 'Asia/Tashkent', '21:00', '08:00'),
  '2026-10-12 20:59+05'::timestamptz, 'quiet hours: before the start is not quiet');
select is(private.apply_quiet_hours('2026-10-12 14:00+05', 'Asia/Tashkent', '13:00', '15:00'),
  '2026-10-12 15:00+05'::timestamptz, 'quiet hours inside one day');
select is(private.apply_quiet_hours('2026-10-12 22:00+05', 'Asia/Tashkent', '08:00', '08:00'),
  '2026-10-12 22:00+05'::timestamptz, 'equal start and end: no quiet hours');
select is(private.apply_quiet_hours('2026-03-28 22:00+01', 'Europe/Berlin', '21:00', '08:00'),
  '2026-03-29 08:00+02'::timestamptz, 'across a DST change the end is still 08:00 local time');

-- An absence marked inside quiet hours waits for their end.
update public.centers
set quiet_hours_start = ((now() at time zone 'Asia/Tashkent') - interval '1 hour')::time,
    quiet_hours_end = ((now() at time zone 'Asia/Tashkent') + interval '2 hours')::time
where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('t1'));
select pg_temp.save('now_l', pg_temp.rows('s3', 'absent'));
select pg_temp.as_admin();
select is(
  (select send_after from public.notification_outbox where dedupe_key = pg_temp.key('absence', 'now_l', 's3', 'g3')),
  now() + interval '2 hours', 'an absence marked during quiet hours is sent when they end');

-- ---------------------------------------------------------------------------
-- After the window: admins only, audited, nobody messaged
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_att'));
select pg_temp.put('res_old', pg_temp.save('old_l', pg_temp.rows('s1', 'absent', 's2', 'present'))::text);
select is((pg_temp.get('res_old')::jsonb ->> 'saved')::int, 2, 'an admin with the attendance flag marks after the window');
select is((pg_temp.get('res_old')::jsonb ->> 'alerts')::int, 0, 'late corrections do not message parents');
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('absence', 'old_l') || ':'), 0, '... and queue nothing');
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'attendance' and action = 'insert' and actor_profile_id = pg_temp.id('adm_att')),
  2, 'marks made after the window are audited');
select pg_temp.login(pg_temp.id('adm_att'));
select pg_temp.save('old_l', pg_temp.rows('s1', 'present'));
select pg_temp.as_admin();
select is(
  (select string_agg((before ->> 'status') || ' → ' || (after ->> 'status') || ' ' || (after ? 'note')::text, '; ' order by id)
   from public.audit_log
   where table_name = 'attendance' and action = 'update'
     and row_id = (select id from public.attendance where lesson_id = pg_temp.id('old_l') and student_id = pg_temp.id('s1'))),
  'absent → present false', 'a late edit stores only the changed columns');
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'attendance'
     and row_id in (select id from public.attendance where lesson_id = pg_temp.id('now_l'))),
  0, 'edits inside the window are not audited');

-- ---------------------------------------------------------------------------
-- No direct writes; unique (lesson, student)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select throws_ok(
  format($$ insert into public.attendance (center_id, group_id, lesson_id, student_id, enrollment_id, status, marked_by)
            values (%L, %L, %L, %L, %L, 'present', %L) $$,
         pg_temp.id('center_a'), pg_temp.id('g1'), pg_temp.id('edge_l'), pg_temp.id('s2'), pg_temp.id('e_s2'), pg_temp.id('t1')),
  '42501', null, 'teachers cannot insert attendance directly');
select throws_ok($$ update public.attendance set status = 'present' $$,
  '42501', null, 'teachers cannot update attendance directly (only save_attendance, which applies the window)');
select pg_temp.login(pg_temp.id('adm_att'));
select throws_ok($$ update public.attendance set status = 'present' $$, '42501', null, 'nor can admins');
select throws_ok($$ delete from public.attendance $$, '42501', null, 'nobody deletes attendance');
select pg_temp.as_admin();
select throws_ok(
  format($$ insert into public.attendance (center_id, group_id, lesson_id, student_id, enrollment_id, status, marked_by)
            values (%L, %L, %L, %L, %L, 'present', %L) $$,
         pg_temp.id('center_a'), pg_temp.id('g1'), pg_temp.id('now_l'), pg_temp.id('s1'), pg_temp.id('e_s1'), pg_temp.id('t1')),
  '23505', null, 'attendance is unique per (lesson, student)');

-- ---------------------------------------------------------------------------
-- Reading attendance (RLS) and the read RPCs
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.attendance where lesson_id = pg_temp.id('now_l')), 4,
  'the teacher reads their group''s attendance');
select pg_temp.login(pg_temp.id('t2'));
select is((select count(*)::int from public.attendance where lesson_id = pg_temp.id('sub_l')), 1,
  'the substitute reads the lesson they taught');
select pg_temp.login(pg_temp.id('t3'));
select is((select count(*)::int from public.attendance where group_id = pg_temp.id('g1')), 0,
  'a teacher of another group reads none of it');
select is((select count(*)::int from public.attendance where lesson_id = pg_temp.id('soon_l')), 1,
  '... but reads their own');
select pg_temp.login(pg_temp.id('adm_no'));
select is((select count(*)::int from public.attendance where lesson_id = pg_temp.id('now_l')), 4,
  'branch admins read attendance without the attendance flag');
select pg_temp.login(pg_temp.id('adm_a2'));
select is((select count(*)::int from public.attendance where group_id = pg_temp.id('g1')), 0,
  'an admin of another branch reads none');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.attendance), 0, 'another center reads none');

select pg_temp.login(pg_temp.id('t3'));
select throws_ok(format($$ select * from public.attendance_sheet(%L) $$, pg_temp.id('now_l')),
  '42501', 'forbidden', 'a teacher of another group cannot open the sheet');
select throws_ok(format($$ select * from public.attendance_lesson(%L) $$, pg_temp.id('now_l')),
  '42501', 'forbidden', '... or the lesson header');
select throws_ok(
  format($$ select * from public.attendance_matrix(%L, %L, %L) $$, pg_temp.id('g1'), pg_temp.d('today') - 5, pg_temp.d('today')),
  '42501', 'forbidden', '... or the group''s matrix');
select is_empty(format($$ select * from public.lesson_attendance_stats(array[%L]::uuid[]) $$, pg_temp.id('now_l')),
  'lesson stats leave out lessons the caller cannot see');

select pg_temp.login(pg_temp.id('t1'));
select results_eq(
  format($$ select full_name from public.attendance_sheet(%L) $$, pg_temp.id('now_l')),
  array['Ali Valiyev', 'Aziza Valiyeva', 'Bobur Karimov', 'Sardor Tursunov'],
  'the sheet lists the expected students by name'
);
select ok(
  not exists (select 1 from pg_proc where proname in ('attendance_sheet', 'attendance_matrix', 'attendance_lesson')
              and 'phone' = any (proargnames)),
  'the sheet, matrix and lesson header return no phone numbers'
);
select is((select mode from public.attendance_lesson(pg_temp.id('now_l'))), 'teacher', 'mode: the teacher may mark');
select is((select mode from public.attendance_lesson(pg_temp.id('old_l'))), 'closed', 'mode: closed after the window');
select is((select mode from public.attendance_lesson(pg_temp.id('future_l'))), 'too_early', 'mode: too early');
select is((select mode from public.attendance_lesson(pg_temp.id('sub_l'))), 'none',
  'mode: the original teacher may view a substituted lesson but not mark it');
select is(
  (select closes_at from public.attendance_lesson(pg_temp.id('now_l'))),
  now() + interval '70 minutes' + interval '48 hours', 'closes_at = ends_at + 48 h');
select is(
  (select row(expected, marked, present, late, absent, excused)::text
   from public.lesson_attendance_stats(array[pg_temp.id('now_l')])),
  '(4,4,1,0,2,1)', 'lesson stats count expected and marked students by status');
select pg_temp.login(pg_temp.id('adm_att'));
select is((select mode from public.attendance_lesson(pg_temp.id('old_l'))), 'admin', 'mode: admins any time');
select pg_temp.login(pg_temp.id('adm_no'));
select is((select mode from public.attendance_lesson(pg_temp.id('now_l'))), 'none',
  'mode: an admin without the flag views but cannot mark');

-- The matrix marks days outside the enrollment and frozen days.
select pg_temp.login(pg_temp.id('owner_a'));
select is(
  (select count(*)::int from public.attendance_matrix(pg_temp.id('g2'), pg_temp.d('D') - 1, pg_temp.d('D') + 1)),
  12, 'the matrix has one cell per student and lesson (4 × 3)');
select is(
  (select day_state from public.attendance_matrix(pg_temp.id('g2'), pg_temp.d('D') - 1, pg_temp.d('D') + 1) m
   where m.student_id = pg_temp.id('x3') and m.lesson_id = pg_temp.id('e_0')),
  'frozen', 'matrix: a frozen day');
select is(
  (select day_state from public.attendance_matrix(pg_temp.id('g2'), pg_temp.d('D') - 1, pg_temp.d('D') + 1) m
   where m.student_id = pg_temp.id('x1') and m.lesson_id = pg_temp.id('e_m1')),
  'out', 'matrix: before the enrollment starts');
select is(
  (select day_state from public.attendance_matrix(pg_temp.id('g2'), pg_temp.d('D') - 1, pg_temp.d('D') + 1) m
   where m.student_id = pg_temp.id('x2') and m.lesson_id = pg_temp.id('e_p1')),
  'out', 'matrix: after the enrollment ends');
select is(
  (select day_state from public.attendance_matrix(pg_temp.id('g2'), pg_temp.d('D') - 1, pg_temp.d('D') + 1) m
   where m.student_id = pg_temp.id('x2') and m.lesson_id = pg_temp.id('e_0')),
  'expected', 'matrix: the last day counts');
select throws_ok(
  format($$ select * from public.attendance_matrix(%L, %L, %L) $$, pg_temp.id('g2'), pg_temp.d('D'), pg_temp.d('D') + 100),
  'P0001', 'invalid_dates', 'the matrix covers at most about two months');
select pg_temp.login(pg_temp.id('t1'));
select is(
  (select status::text from public.attendance_matrix(pg_temp.id('g1'), pg_temp.d('today') - 1, pg_temp.d('today')) m
   where m.student_id = pg_temp.id('s3') and m.lesson_id = pg_temp.id('now_l')),
  'absent', 'teachers read their group''s matrix with the marks');

-- ---------------------------------------------------------------------------
-- Outbox, templates, telegram_links, center settings
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
select ok((select count(*) from public.notification_outbox) > 0, 'owners read their center''s outbox');
select throws_ok(
  format($$ insert into public.notification_outbox (center_id, template_key, locale, student_id)
            values (%L, 'absence_alert', 'uz', %L) $$, pg_temp.id('center_a'), pg_temp.id('s1')),
  '42501', null, 'nobody inserts outbox rows directly');
select pg_temp.login(pg_temp.id('adm_att'));
select ok((select count(*) from public.notification_outbox) > 0,
  'admins read the rows about their branch''s students (M4 widened it from owners only)');
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.notification_outbox), 0, 'teachers never read the outbox');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.notification_outbox), 0, 'another center reads none of it');

select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.notification_templates where center_id is null and channel = 'telegram'
            and key in ('absence_alert', 'late_alert', 'lesson_cancelled', 'lesson_moved', 'lesson_added')), 15,
  'everyone signed in reads the system templates');
select pg_temp.as_admin();
insert into public.notification_templates (center_id, key, channel, locale, body)
values (pg_temp.id('center_b'), 'absence_alert', 'telegram', 'ru', 'Свой текст: {student}');
select pg_temp.login(pg_temp.id('owner_a'));
select is((select count(*)::int from public.notification_templates where center_id is not null), 0,
  'another center''s template override is invisible');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.notification_templates where center_id is not null), 1,
  'a center reads its own override');
update public.notification_templates set body = 'x' where center_id is null;
select is((select count(*)::int from public.notification_templates where body = 'x'), 0,
  'system templates stay read-only (centers edit only their own overrides, M4)');
select pg_temp.as_admin();
select is(
  (select count(*)::int from (values ('absence_alert'), ('late_alert'), ('lesson_cancelled'), ('lesson_moved'), ('lesson_added')) k (key)
   where (select count(*) from public.notification_templates t
          where t.center_id is null and t.key = k.key and t.channel = 'telegram' and t.locale in ('uz', 'ru', 'en')) = 3),
  5, 'every key M2 queues has a system template in uz, ru and en');

insert into public.telegram_links (center_id, telegram_user_id, chat_id, phone, guardian_id)
values (pg_temp.id('center_a'), 1001, 1001, '+998930000001', pg_temp.id('mother'));
select pg_temp.login(pg_temp.id('adm_no'));
select is((select count(*)::int from public.telegram_links), 1, 'admins see who is linked to Telegram');
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.telegram_links), 0, 'teachers do not');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.telegram_links), 0, 'another center does not');
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  format($$ insert into public.telegram_links (center_id, telegram_user_id, chat_id, phone, student_id)
            values (%L, 1002, 1002, '+998930000009', %L) $$, pg_temp.id('center_a'), pg_temp.id('s1')),
  '42501', null, 'only the worker links Telegram accounts');

select lives_ok(
  format($$ update public.centers set attendance_edit_hours = 48, absence_alert_delay_min = 10 where id = %L $$,
         pg_temp.id('center_a')),
  'the owner edits the attendance settings');
select throws_ok(
  format($$ update public.centers set attendance_edit_hours = 0 where id = %L $$, pg_temp.id('center_a')),
  '23514', null, 'the edit window is at least one hour');
select pg_temp.login(pg_temp.id('adm_att'));
update public.centers set absence_alert_delay_min = 1 where id = pg_temp.id('center_a');
select pg_temp.as_admin();
select is((select absence_alert_delay_min from public.centers where id = pg_temp.id('center_a')), 10::smallint,
  'admins cannot change the attendance settings');

-- ---------------------------------------------------------------------------
-- "Notify students?" on lesson changes (13)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_att'));
select lives_ok(format($$ select public.cancel_lesson(%L, 'Teacher is ill') $$, pg_temp.id('cancel_l')),
  'cancelling notifies by default');
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_cancelled', 'cancel_l') || ':'), 6,
  'four students and two guardians: siblings share one message to their mother');
select is(
  (select count(*)::int from public.notification_outbox
   where starts_with(dedupe_key, pg_temp.key('lesson_cancelled', 'cancel_l')) and guardian_id = pg_temp.id('father')),
  0, 'a guardian who turned notifications off gets nothing');
select pg_temp.login(pg_temp.id('adm_att'));
select public.cancel_lesson(pg_temp.id('cancel2_l'), 'Room flooded', true, false);
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_cancelled', 'cancel2_l') || ':'), 0, 'notify off: nothing is queued');

select pg_temp.put('move_at', (select starts_at from public.lessons where id = pg_temp.id('move_l'))::text);
select pg_temp.login(pg_temp.id('adm_att'));
select public.move_lesson(pg_temp.id('move_l'), pg_temp.get('move_at')::timestamptz + interval '1 hour');
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_moved', 'move_l') || ':', 'pending'), 6, 'moving a lesson notifies');
select is(
  (select min(payload ->> 'oldTime') || ' → ' || min(payload ->> 'time') from public.notification_outbox
   where starts_with(dedupe_key, pg_temp.key('lesson_moved', 'move_l'))),
  pg_temp.local_hm(pg_temp.get('move_at')::timestamptz) || ' → '
    || pg_temp.local_hm(pg_temp.get('move_at')::timestamptz + interval '1 hour'),
  'with the old and the new time');
select pg_temp.login(pg_temp.id('adm_att'));
select public.move_lesson(pg_temp.id('move_l'), pg_temp.get('move_at')::timestamptz + interval '2 hours');
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_moved', 'move_l') || ':', 'pending'), 6,
  'a second move leaves only its own messages pending');
select is(pg_temp.queued(pg_temp.key('lesson_moved', 'move_l') || ':', 'cancelled'), 6,
  '... the first move''s messages are cancelled');
select pg_temp.login(pg_temp.id('adm_att'));
select public.move_lesson(pg_temp.id('move_l'), pg_temp.get('move_at')::timestamptz + interval '2 hours', pg_temp.id('r1'));
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_moved', 'move_l') || ':'), 12, 'a room-only change notifies nobody');
select pg_temp.login(pg_temp.id('adm_att'));
select public.move_lesson(pg_temp.id('move_l'), pg_temp.get('move_at')::timestamptz + interval '3 hours', null, false);
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_moved', 'move_l') || ':', 'pending'), 0,
  'moving with notify off still cancels the outdated pending messages');

select pg_temp.login(pg_temp.id('adm_att'));
select pg_temp.put('mk', public.create_makeup_lesson(pg_temp.id('g1'), now() + interval '5 days', 90, pg_temp.id('cancel_l'))::text);
select pg_temp.put('ex', public.create_makeup_lesson(pg_temp.id('g1'), now() + interval '6 days', 90)::text);
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_moved', 'mk') || ':'), 6, 'a makeup lesson notifies as a move');
select is(
  (select min(payload ->> 'oldDate') from public.notification_outbox where starts_with(dedupe_key, pg_temp.key('lesson_moved', 'mk'))),
  (select local_date::text from public.lessons where id = pg_temp.id('cancel_l')), 'from the cancelled lesson''s date');
select is(pg_temp.queued(pg_temp.key('lesson_added', 'ex') || ':'), 6, 'an extra lesson queues lesson_added');

select pg_temp.login(pg_temp.id('adm_att'));
select is(public.add_holiday(pg_temp.id('center_a'), pg_temp.d('today') + 20, 'Holiday one', pg_temp.id('a1')), 1,
  'a holiday cancels that day''s lesson');
select is(public.add_holiday(pg_temp.id('center_a'), pg_temp.d('today') + 21, 'Holiday two', pg_temp.id('a1'), true), 1,
  '... and so does a second one');
select pg_temp.as_admin();
select is(pg_temp.queued(pg_temp.key('lesson_cancelled', 'hol1_l') || ':'), 0, 'a holiday notifies only when asked');
select is(pg_temp.queued(pg_temp.key('lesson_cancelled', 'hol2_l') || ':'), 6, 'opting in notifies students and guardians');

-- ---------------------------------------------------------------------------
-- Regeneration and holidays leave lessons with attendance alone
-- ---------------------------------------------------------------------------
select pg_temp.put('W', extract(isodow from pg_temp.d('today') + 3)::text);
select pg_temp.login(pg_temp.id('adm_att'));
select public.save_schedule_rules(pg_temp.id('g2'),
  format('[{"weekday": %s, "startTime": "07:00", "durationMinutes": 60}]', pg_temp.get('W'))::jsonb);
select pg_temp.as_admin();
select pg_temp.put('keep', (select id from public.lessons
  where group_id = pg_temp.id('g2') and local_date = pg_temp.d('today') + 3 and rule_id is not null)::text);
select pg_temp.put('rule', (select rule_id from public.lessons where id = pg_temp.id('keep'))::text);
-- A mark on a future lesson can't come through save_attendance; insert it to prove the guard itself.
insert into public.attendance (center_id, group_id, lesson_id, student_id, enrollment_id, status, marked_by)
values (pg_temp.id('center_a'), pg_temp.id('g2'), pg_temp.id('keep'), pg_temp.id('s5'), pg_temp.id('e_s5'), 'present',
        pg_temp.id('t3'));
select pg_temp.login(pg_temp.id('adm_att'));
select public.save_schedule_rules(pg_temp.id('g2'),
  format('[{"id": "%s", "weekday": %s, "startTime": "07:30", "durationMinutes": 60}]', pg_temp.get('rule'), pg_temp.get('W'))::jsonb);
select pg_temp.as_admin();
select is(pg_temp.local_hm((select starts_at from public.lessons where id = pg_temp.id('keep'))), '07:00',
  'a rule edit keeps a lesson that has attendance');
select is(
  pg_temp.local_hm((select starts_at from public.lessons
                    where group_id = pg_temp.id('g2') and local_date = pg_temp.d('today') + 10 and rule_id is not null)),
  '07:30', '... and regenerates the others');
select pg_temp.login(pg_temp.id('adm_att'));
select public.add_holiday(pg_temp.id('center_a'), pg_temp.d('today') + 3, 'Holiday three', pg_temp.id('a1'));
select pg_temp.as_admin();
select is((select status::text from public.lessons where id = pg_temp.id('keep')), 'scheduled',
  'a holiday does not cancel a lesson that has attendance');

-- ---------------------------------------------------------------------------
-- A marked student who is no longer expected stays on the sheet
-- ---------------------------------------------------------------------------
update public.enrollments set start_date = pg_temp.d('today') + 1 where id = pg_temp.id('e_s4');
select pg_temp.login(pg_temp.id('t1'));
select is(
  (select is_expected from public.attendance_sheet(pg_temp.id('now_l')) where student_id = pg_temp.id('s4')),
  false, 'a marked student who is no longer expected stays on the sheet, flagged');
select lives_ok($$ select pg_temp.save('now_l', pg_temp.rows('s4', 'excused')) $$, '... and their mark can still change');

-- Every key in the outbox has a system template.
select pg_temp.as_admin();
select is_empty(
  $$ select distinct o.template_key from public.notification_outbox o
     where not exists (select 1 from public.notification_templates t where t.center_id is null and t.key = o.template_key) $$,
  'every queued template key has a system template'
);

select * from finish();
rollback;
