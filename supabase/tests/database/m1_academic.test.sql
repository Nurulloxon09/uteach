-- M1 · Academic core: RLS, generation, conflicts and enrollment RPCs. Run with `pnpm db:test`.
-- Dates are relative to "today" in the branch timezone, so the test passes on any day.
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

-- Invite + accept in one go; returns the membership id.
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

-- Days in [today, today + 55] with one of the ISO weekdays (8-week generation window).
create function pg_temp.days(p_weekdays int[])
returns int
language sql
as $$
  select count(*)::int
  from generate_series(pg_temp.d('today'), pg_temp.d('today') + 55, interval '1 day') d
  where extract(isodow from d)::int = any (p_weekdays);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998910000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998910000002', 'Owner B')::text);
select pg_temp.put('admin_a', pg_temp.new_user('+998910000003', 'Admin Academics')::text);
select pg_temp.put('admin_s', pg_temp.new_user('+998910000004', 'Admin Students')::text);
select pg_temp.put('t1', pg_temp.new_user('+998910000005', 'Teacher One')::text);
select pg_temp.put('t2', pg_temp.new_user('+998910000006', 'Teacher Two')::text);
select pg_temp.put('t3', pg_temp.new_user('+998910000007', 'Teacher Three')::text);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Center A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent');
select pg_temp.put('a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);
insert into public.rooms (center_id, branch_id, name) values
  (pg_temp.id('center_a'), pg_temp.id('a1'), 'Room 1'),
  (pg_temp.id('center_a'), pg_temp.id('a1'), 'Room 2'),
  (pg_temp.id('center_a'), pg_temp.id('a2'), 'Room 3');
select pg_temp.put('r1', (select id from public.rooms where name = 'Room 1' and center_id = pg_temp.id('center_a'))::text);
select pg_temp.put('r2', (select id from public.rooms where name = 'Room 2' and center_id = pg_temp.id('center_a'))::text);
select pg_temp.put('r3', (select id from public.rooms where name = 'Room 3' and center_id = pg_temp.id('center_a'))::text);

select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Center B', 'Asia/Tashkent', 'ru', 'Main')::text);

select pg_temp.put('m_admin_a', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('admin_a'), 'admin', 'Admin Academics',
  '+998910000003', array[pg_temp.id('a1')], array['students', 'billing', 'academics'])::text);
select pg_temp.put('m_admin_s', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('admin_s'), 'admin', 'Admin Students',
  '+998910000004', array[pg_temp.id('a1')], array['students'])::text);
select pg_temp.put('m_t1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t1'), 'teacher', 'Teacher One',
  '+998910000005', array[pg_temp.id('a1')])::text);
select pg_temp.put('m_t2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t2'), 'teacher', 'Teacher Two',
  '+998910000006', array[pg_temp.id('a1')])::text);
select pg_temp.put('m_t3', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t3'), 'teacher', 'Teacher Three',
  '+998910000007', array[pg_temp.id('a2')])::text);

select pg_temp.as_admin();
select pg_temp.put('today', private.today_in('Asia/Tashkent')::text);
-- The first Monday after today: the holiday used below.
select pg_temp.put('holiday', (
  select min(d)::date from generate_series(pg_temp.d('today') + 1, pg_temp.d('today') + 7, interval '1 day') d
  where extract(isodow from d) = 1
)::text);

-- ---------------------------------------------------------------------------
-- Every public table has RLS enabled
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has RLS enabled'
);

-- ---------------------------------------------------------------------------
-- Courses and levels
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
insert into public.courses (center_id, name, kind, default_price_amount, default_lesson_minutes)
values (pg_temp.id('center_a'), 'IELTS', 'exam_prep', 60000000, 90);
select pg_temp.put('ielts', (select id from public.courses where name = 'IELTS')::text);
insert into public.levels (center_id, course_id, name, sort_order) values
  (pg_temp.id('center_a'), pg_temp.id('ielts'), '6.0', 1),
  (pg_temp.id('center_a'), pg_temp.id('ielts'), '6.5', 2);
select pg_temp.put('lvl60', (select id from public.levels where name = '6.0')::text);
update public.levels set next_level_id = (select id from public.levels where name = '6.5') where id = pg_temp.id('lvl60');
select is(
  (select l2.name from public.levels l join public.levels l2 on l2.id = l.next_level_id where l.id = pg_temp.id('lvl60')),
  '6.5', 'owner sets up a course with ordered levels and a next level'
);

select pg_temp.login(pg_temp.id('admin_s'));
select throws_ok(
  $$ insert into public.courses (center_id, name) values (pg_temp.id('center_a'), 'Hack') $$,
  '42501', null, 'an admin without `academics` cannot create courses'
);

select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.courses where center_id = pg_temp.id('center_a')), 1,
  'teachers can read course names');
select throws_ok(
  $$ select default_price_amount from public.courses $$,
  '42501', null, 'nobody reads the course default price column directly (money stays away from teachers)'
);
select is_empty($$ select * from public.course_default_prices(pg_temp.id('center_a')) $$,
  'course_default_prices() returns nothing to a teacher');
select pg_temp.login(pg_temp.id('owner_a'));
select is((select default_price_amount from public.course_default_prices(pg_temp.id('center_a'))), 60000000::bigint,
  'the owner reads course default prices through course_default_prices()');

-- ---------------------------------------------------------------------------
-- Groups and lesson generation
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin_s'));
select throws_ok(
  format($$ select public.create_group(%L, %L, 'Nope', %L) $$, pg_temp.id('a1'), pg_temp.id('ielts'), pg_temp.d('today')),
  '42501', 'forbidden', 'an admin without `academics` cannot create groups'
);

select pg_temp.login(pg_temp.id('admin_a'));
select pg_temp.put('g1', public.create_group(
  pg_temp.id('a1'), pg_temp.id('ielts'), 'IELTS 6.0 · Mon/Wed/Fri 18:00', pg_temp.d('today') - 30,
  p_level_id => pg_temp.id('lvl60'), p_teacher_membership_id => pg_temp.id('m_t1'), p_room_id => pg_temp.id('r1'),
  p_capacity => 12::smallint, p_price_amount => 60000000, p_cycle_lessons => 12::smallint,
  p_rules => '[{"weekday":1,"startTime":"18:00","durationMinutes":90},
               {"weekday":3,"startTime":"18:00","durationMinutes":90},
               {"weekday":5,"startTime":"18:00","durationMinutes":90}]'::jsonb
)::text);

select pg_temp.as_admin();
select is(
  (select count(*)::int from public.lessons where group_id = pg_temp.id('g1')),
  pg_temp.days(array[1, 3, 5]),
  'Mon/Wed/Fri rules generate exactly one lesson per matching day for 8 weeks'
);
select ok(
  (select bool_and(to_char(starts_at at time zone 'Asia/Tashkent', 'HH24:MI') = '18:00'
                   and ends_at - starts_at = interval '90 minutes')
   from public.lessons where group_id = pg_temp.id('g1')),
  'every lesson starts at 18:00 in the branch timezone and lasts 90 minutes'
);
select ok(
  (select min(local_date) >= pg_temp.d('today') and max(local_date) <= pg_temp.d('today') + 55
   from public.lessons where group_id = pg_temp.id('g1')),
  'lessons are generated from today (never in the past) up to 8 weeks ahead'
);
select is(
  (select count(*)::int from public.lessons where group_id = pg_temp.id('g1')
     and (teacher_membership_id <> pg_temp.id('m_t1') or room_id <> pg_temp.id('r1'))),
  0, 'lessons take the group''s teacher and room'
);

select pg_temp.login(pg_temp.id('admin_a'));
select is(public.generate_lessons(pg_temp.id('g1')), 0, 'running generation again creates 0 lessons');
select pg_temp.as_admin();
select is(private.generate_all_lessons(), 0, 'the daily job is idempotent too');
select is((select price_amount from public.group_prices where group_id = pg_temp.id('g1')), 60000000::bigint,
  'create_group stores the first price');

-- ---------------------------------------------------------------------------
-- Holidays
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin_a'));
select is(
  public.add_holiday(pg_temp.id('center_a'), pg_temp.d('holiday'), 'Holiday', pg_temp.id('a1')),
  1, 'adding a holiday cancels the lesson already generated that day'
);
select pg_temp.as_admin();
select is(
  (select status::text || '/' || is_billable::text from public.lessons
   where group_id = pg_temp.id('g1') and local_date = pg_temp.d('holiday')),
  'cancelled/false', 'the holiday lesson is cancelled and not billable (cycles extend)'
);
select pg_temp.login(pg_temp.id('admin_a'));
select throws_ok(
  format($$ select public.add_holiday(%L, %L, 'Center-wide') $$, pg_temp.id('center_a'), pg_temp.d('holiday') + 1),
  '42501', 'forbidden', 'only the owner adds center-wide holidays'
);

-- ---------------------------------------------------------------------------
-- Conflicts: room and teacher
-- ---------------------------------------------------------------------------
-- G2: same room as G1 on Mondays (18:30, overlaps 18:00–19:30). The holiday is skipped.
select pg_temp.put('g2', public.create_group(
  pg_temp.id('a1'), pg_temp.id('ielts'), 'Room clash', pg_temp.d('today'),
  p_teacher_membership_id => pg_temp.id('m_t2'), p_room_id => pg_temp.id('r1'),
  p_rules => '[{"weekday":1,"startTime":"18:30","durationMinutes":60}]'::jsonb
)::text);
-- G3: another room, same teacher as G1 on Wednesdays (19:00, overlaps until 19:30).
select pg_temp.put('g3', public.create_group(
  pg_temp.id('a1'), pg_temp.id('ielts'), 'Teacher clash', pg_temp.d('today'),
  p_teacher_membership_id => pg_temp.id('m_t1'), p_room_id => pg_temp.id('r2'),
  p_rules => '[{"weekday":3,"startTime":"19:00","durationMinutes":60}]'::jsonb
)::text);

select pg_temp.as_admin();
select is((select count(*)::int from public.lessons where group_id = pg_temp.id('g2')), 0,
  'the DB rejects every lesson that would double-book the room');
select is(
  (select count(*)::int from public.schedule_conflicts
   where group_id = pg_temp.id('g2') and conflict_kind = 'room' and resolved_at is null),
  pg_temp.days(array[1]) - 1,
  'each room clash shows in the conflicts inbox (the holiday Monday is skipped, not a conflict)'
);
select is(
  (select count(*)::int from public.schedule_conflicts
   where group_id = pg_temp.id('g3') and conflict_kind = 'teacher' and resolved_at is null),
  pg_temp.days(array[3]),
  'each teacher clash shows in the conflicts inbox'
);
select ok(
  (select bool_and(c.conflicting_lesson_id is not null) from public.schedule_conflicts c where c.group_id = pg_temp.id('g3')),
  'a conflict points at the lesson it clashed with'
);
select throws_ok(
  format($$ insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at, room_id, teacher_membership_id)
            select center_id, branch_id, %L, local_date, starts_at, ends_at, room_id, %L
            from public.lessons where group_id = %L and status = 'scheduled' limit 1 $$,
         pg_temp.id('g2'), pg_temp.id('m_t2'), pg_temp.id('g1')),
  '23P01', null, 'even a direct insert cannot double-book a room (exclusion constraint)'
);

select pg_temp.login(pg_temp.id('admin_a'));
select is(
  (select count(*)::int from public.check_schedule_conflicts(pg_temp.id('g2'),
     '[{"weekday":1,"startTime":"18:30","durationMinutes":60}]'::jsonb) where conflict_kind = 'room'),
  pg_temp.days(array[1]) - 1,
  'the rules editor pre-check finds the same clashes'
);

-- Resolve one G2 conflict by skipping, one G3 conflict by placing the lesson at 20:00.
select pg_temp.put('c_skip', (select id from public.schedule_conflicts where group_id = pg_temp.id('g2') order by local_date limit 1)::text);
select pg_temp.put('c_move', (select id from public.schedule_conflicts where group_id = pg_temp.id('g3') order by local_date limit 1)::text);
select pg_temp.put('c_move_date', (select local_date from public.schedule_conflicts where id = pg_temp.id('c_move'))::text);
select lives_ok(format($$ select public.resolve_conflict(%L, 'skipped') $$, pg_temp.id('c_skip')),
  'a conflict can be skipped');
select isnt(
  public.resolve_conflict(pg_temp.id('c_move'), 'moved',
    ((pg_temp.d('c_move_date') + time '20:00') at time zone 'Asia/Tashkent')),
  null, 'a conflict can be resolved by placing the lesson at another time'
);
select is(public.generate_lessons(pg_temp.id('g2')), 0, 'a skipped occurrence is not generated again');
select is(public.generate_lessons(pg_temp.id('g3')), 0, 'a moved occurrence is not generated again');
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.schedule_conflicts where group_id = pg_temp.id('g2') and resolved_at is null),
  pg_temp.days(array[1]) - 2, 'the skipped conflict stays resolved after regeneration'
);

-- ---------------------------------------------------------------------------
-- Single-lesson actions: move, cancel, makeup, substitute
-- ---------------------------------------------------------------------------
select pg_temp.put('mon', (
  select id from public.lessons where group_id = pg_temp.id('g1') and status = 'scheduled'
    and extract(isodow from local_date) = 1 order by starts_at limit 1)::text);
select pg_temp.put('mon_date', (select rule_date from public.lessons where id = pg_temp.id('mon'))::text);

select pg_temp.login(pg_temp.id('admin_a'));
select throws_like(
  format($$ select public.move_lesson(%L, (select starts_at from public.lessons
            where group_id = %L and extract(isodow from local_date) = 3 and status = 'scheduled' order by starts_at limit 1)) $$,
         pg_temp.id('mon'), pg_temp.id('g1')),
  'lesson_conflict%', 'dropping a lesson onto a busy slot is refused'
);
-- Move the Monday lesson to Tuesday 18:00 (free): regeneration must not recreate Monday.
select lives_ok(
  format($$ select public.move_lesson(%L, ((%L::date + 1 + time '18:00') at time zone 'Asia/Tashkent')) $$,
         pg_temp.id('mon'), pg_temp.d('mon_date')),
  'a lesson can be moved to a free slot'
);
select is(public.generate_lessons(pg_temp.id('g1')), 0, 'moving a lesson to another day does not regenerate the old day');
select pg_temp.as_admin();
select is(
  (select local_date - rule_date || '/' || is_manually_edited::text from public.lessons where id = pg_temp.id('mon')),
  '1/true', 'the moved lesson keeps its rule occurrence and is marked as edited'
);

select pg_temp.put('wed', (
  select id from public.lessons where group_id = pg_temp.id('g1') and status = 'scheduled'
    and extract(isodow from local_date) = 3 order by starts_at limit 1)::text);
select pg_temp.put('fri', (
  select id from public.lessons where group_id = pg_temp.id('g1') and status = 'scheduled'
    and extract(isodow from local_date) = 5 order by starts_at limit 1)::text);
select pg_temp.login(pg_temp.id('admin_a'));
select lives_ok(format($$ select public.cancel_lesson(%L, 'Teacher ill', true) $$, pg_temp.id('wed')),
  'cancel (center''s fault)');
select lives_ok(format($$ select public.cancel_lesson(%L, 'Students away', false) $$, pg_temp.id('fri')),
  'cancel (not the center''s fault)');
select pg_temp.put('makeup1', public.create_makeup_lesson(
  pg_temp.id('g1'), (select starts_at + interval '1 day' from public.lessons where id = pg_temp.id('wed')), 90,
  p_for_lesson_id => pg_temp.id('wed'))::text);
select pg_temp.put('makeup2', public.create_makeup_lesson(
  pg_temp.id('g1'), (select starts_at + interval '1 day' from public.lessons where id = pg_temp.id('fri')), 90,
  p_for_lesson_id => pg_temp.id('fri'))::text);
select pg_temp.as_admin();
select is(
  (select string_agg(is_billable::text, ',' order by starts_at) from public.lessons
   where id in (pg_temp.id('wed'), pg_temp.id('fri'))),
  'false,true', 'a center-fault cancellation is not billable; another cancellation still counts'
);
select is(
  (select is_makeup::text || '/' || is_billable::text from public.lessons where id = pg_temp.id('makeup1')),
  'true/true', 'a makeup for a non-billable cancellation counts'
);
select is(
  (select is_billable from public.lessons where id = pg_temp.id('makeup2')),
  false, 'a makeup for a cancellation that still counted is free (net zero)'
);

select pg_temp.put('sub', (
  select id from public.lessons where group_id = pg_temp.id('g1') and status = 'scheduled'
    and is_makeup = false and extract(isodow from local_date) = 5 order by starts_at limit 1)::text);
select pg_temp.login(pg_temp.id('admin_a'));
select lives_ok(format($$ select public.substitute_teacher(%L, %L) $$, pg_temp.id('sub'), pg_temp.id('m_t2')),
  'a substitute can take one lesson');
select pg_temp.as_admin();
select is(
  (select original_teacher_membership_id from public.lessons where id = pg_temp.id('sub')),
  pg_temp.id('m_t1'), 'the original teacher is kept'
);

-- ---------------------------------------------------------------------------
-- Rule edits touch only future, untouched lessons
-- ---------------------------------------------------------------------------
select pg_temp.put('rule_mon', (select id from public.group_schedule_rules where group_id = pg_temp.id('g1') and weekday = 1)::text);
select pg_temp.put('rule_wed', (select id from public.group_schedule_rules where group_id = pg_temp.id('g1') and weekday = 3)::text);
select pg_temp.put('rule_fri', (select id from public.group_schedule_rules where group_id = pg_temp.id('g1') and weekday = 5)::text);
-- A lesson that already happened (attendance was taken: status held).
insert into public.lessons (center_id, branch_id, group_id, rule_id, rule_date, local_date, starts_at, ends_at,
                            room_id, teacher_membership_id, status)
values (pg_temp.id('center_a'), pg_temp.id('a1'), pg_temp.id('g1'), pg_temp.id('rule_fri'), pg_temp.d('today') - 4,
        pg_temp.d('today') - 4, ((pg_temp.d('today') - 4) + time '18:00') at time zone 'Asia/Tashkent',
        ((pg_temp.d('today') - 4) + time '19:30') at time zone 'Asia/Tashkent', pg_temp.id('r1'), pg_temp.id('m_t1'), 'held');

select pg_temp.login(pg_temp.id('admin_a'));
select lives_ok(
  format($$ select public.save_schedule_rules(%L, jsonb_build_array(
            jsonb_build_object('id', %L::text, 'weekday', 1, 'startTime', '18:00', 'durationMinutes', 90),
            jsonb_build_object('id', %L::text, 'weekday', 3, 'startTime', '18:00', 'durationMinutes', 90),
            jsonb_build_object('id', %L::text, 'weekday', 5, 'startTime', '19:00', 'durationMinutes', 60))) $$,
         pg_temp.id('g1'), pg_temp.id('rule_mon'), pg_temp.id('rule_wed'), pg_temp.id('rule_fri')),
  'the Friday rule moves to 19:00 for 60 minutes'
);
select pg_temp.as_admin();
select ok(
  (select bool_and(to_char(starts_at at time zone 'Asia/Tashkent', 'HH24:MI') = '19:00')
   from public.lessons where rule_id = pg_temp.id('rule_fri') and starts_at > now()
     and status = 'scheduled' and not is_manually_edited),
  'future untouched Friday lessons are regenerated at 19:00'
);
select is(
  (select to_char(starts_at at time zone 'Asia/Tashkent', 'HH24:MI') from public.lessons
   where rule_id = pg_temp.id('rule_fri') and status = 'held'),
  '18:00', 'a lesson that already happened is never touched'
);
select is(
  (select count(*)::int from public.lessons where id in (pg_temp.id('fri'), pg_temp.id('sub'), pg_temp.id('mon'))),
  3, 'cancelled, substituted and moved lessons survive the rule edit'
);
select is(
  (select count(*)::int from public.lessons where rule_id = pg_temp.id('rule_fri') and starts_at > now()),
  pg_temp.days(array[5]), 'no Friday is lost or doubled by the edit'
);

-- Removing a rule: future untouched lessons go, the rule ends (it has history).
select pg_temp.login(pg_temp.id('admin_a'));
select lives_ok(
  format($$ select public.save_schedule_rules(%L, jsonb_build_array(
            jsonb_build_object('id', %L::text, 'weekday', 1, 'startTime', '18:00', 'durationMinutes', 90),
            jsonb_build_object('id', %L::text, 'weekday', 3, 'startTime', '18:00', 'durationMinutes', 90))) $$,
         pg_temp.id('g1'), pg_temp.id('rule_mon'), pg_temp.id('rule_wed')),
  'the Friday rule can be removed'
);
select pg_temp.as_admin();
select is(
  (select valid_to from public.group_schedule_rules where id = pg_temp.id('rule_fri')),
  pg_temp.d('today') - 1, 'a removed rule with history ends yesterday'
);
select is(
  (select count(*)::int from public.lessons where rule_id = pg_temp.id('rule_fri') and starts_at > now()
     and status = 'scheduled' and not is_manually_edited),
  0, 'its future untouched lessons are gone'
);

select pg_temp.login(pg_temp.id('admin_a'));
select throws_ok(
  format($$ select public.save_schedule_rules(%L, '[{"weekday":2,"startTime":"10:00","durationMinutes":60}]') $$,
         (select public.create_group(pg_temp.id('a1'), pg_temp.id('ielts'), 'No teacher', pg_temp.d('today')))),
  'P0001', 'rule_needs_teacher', 'a rule without any teacher is refused'
);

-- ---------------------------------------------------------------------------
-- A group in the other branch, for scope checks
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g4', public.create_group(
  pg_temp.id('a2'), pg_temp.id('ielts'), 'Yunusobod group', pg_temp.d('today'),
  p_teacher_membership_id => pg_temp.id('m_t3'), p_room_id => pg_temp.id('r3'), p_price_amount => 50000000,
  p_rules => '[{"weekday":2,"startTime":"10:00","durationMinutes":60}]'::jsonb
)::text);
select throws_ok(
  format($$ select public.create_group(%L, %L, 'Wrong teacher', %L, p_teacher_membership_id => %L) $$,
         pg_temp.id('a2'), pg_temp.id('ielts'), pg_temp.d('today'), pg_temp.id('m_t1')),
  'P0001', 'invalid_teacher', 'a teacher can only be assigned in their own branches'
);

select pg_temp.login(pg_temp.id('admin_a'));
select is((select count(*)::int from public.groups where id = pg_temp.id('g4')), 0,
  'an admin does not see groups of other branches');
select is((select count(*)::int from public.lessons where group_id = pg_temp.id('g4')), 0,
  'nor their lessons');
select is((select count(*)::int from public.group_prices where group_id = pg_temp.id('g1')), 1,
  'an admin with `billing` sees the prices of their branches');
select pg_temp.login(pg_temp.id('admin_s'));
select is((select count(*)::int from public.group_prices), 0, 'an admin without `billing` sees no prices');

-- ---------------------------------------------------------------------------
-- Students and guardians
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin_s'));
insert into public.students (center_id, branch_id, full_name, phone)
values (pg_temp.id('center_a'), pg_temp.id('a1'), 'Ali Valiyev', '+998930000001'),
       (pg_temp.id('center_a'), pg_temp.id('a1'), 'Vali Valiyev', null);
select pg_temp.put('s1', (select id from public.students where full_name = 'Ali Valiyev')::text);
select pg_temp.put('s2', (select id from public.students where full_name = 'Vali Valiyev')::text);
select throws_ok(
  format($$ insert into public.students (center_id, branch_id, full_name) values (%L, %L, 'Elsewhere') $$,
         pg_temp.id('center_a'), pg_temp.id('a2')),
  '42501', null, 'an admin cannot add students to another branch'
);

select is(
  (public.upsert_guardian(pg_temp.id('s1'), 'Malika Valiyeva', '+998901112233', 'mother', true) ->> 'linkedExisting'),
  'false', 'a new phone creates a guardian'
);
select is(
  (public.upsert_guardian(pg_temp.id('s2'), 'Someone Else', '+998901112233', 'mother', true) ->> 'linkedExisting'),
  'true', 'the same phone links the existing guardian (siblings)'
);
select pg_temp.as_admin();
select is((select count(*)::int from public.guardians where center_id = pg_temp.id('center_a')), 1,
  'siblings share one guardian row');
select is((select full_name from public.guardians where phone = '+998901112233'), 'Malika Valiyeva',
  'linking does not overwrite the guardian''s name');
select is(
  (select count(*)::int from public.student_guardians where guardian_id = (select id from public.guardians where phone = '+998901112233')),
  2, 'the guardian is linked to both students ("also guardian of")'
);

-- ---------------------------------------------------------------------------
-- Enroll / freeze / transfer / end
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin_s'));
select pg_temp.put('e1', public.enroll(pg_temp.id('s1'), pg_temp.id('g1'))::text);
select pg_temp.as_admin();
select is(
  (select start_date from public.enrollments where id = pg_temp.id('e1')),
  (select min(local_date) from public.lessons where group_id = pg_temp.id('g1') and status = 'scheduled'
     and local_date >= pg_temp.d('today')),
  'enroll starts on the group''s next lesson by default'
);
select ok(
  exists (select 1 from public.audit_log where table_name = 'enrollments' and row_id = pg_temp.id('e1') and action = 'insert'),
  'enroll writes audit_log'
);

select pg_temp.login(pg_temp.id('admin_s'));
select throws_ok(
  format($$ select public.enroll(%L, %L) $$, pg_temp.id('s1'), pg_temp.id('g1')),
  'P0001', 'enrollment_exists', 'a student can''t be enrolled twice in the same group'
);
select throws_ok(
  format($$ select public.enroll(%L, %L, null, 1500, 0, 'Sibling') $$, pg_temp.id('s2'), pg_temp.id('g1')),
  'P0001', 'discount_cap', 'an admin without `discounts` cannot give more than 10%'
);
select throws_ok(
  format($$ select public.enroll(%L, %L, null, 500) $$, pg_temp.id('s2'), pg_temp.id('g1')),
  'P0001', 'discount_reason_required', 'a discount needs a reason'
);
select pg_temp.put('e2', public.enroll(pg_temp.id('s2'), pg_temp.id('g1'), pg_temp.d('today') - 20, 1000, 0, 'Sibling')::text);
select is((select discount_bp from public.enrollments where id = pg_temp.id('e2')), 1000,
  '10% with a reason is fine; backdating is allowed');

select throws_ok(
  format($$ select public.freeze_enrollment(%L, %L, %L) $$, pg_temp.id('e2'), pg_temp.d('today') - 30, pg_temp.d('today')),
  'P0001', 'freeze_outside_enrollment', 'a freeze cannot start before the enrollment'
);
select lives_ok(
  format($$ select public.freeze_enrollment(%L, %L, %L, 'Travel') $$,
         pg_temp.id('e2'), pg_temp.d('today'), pg_temp.d('today') + 6),
  'freeze an enrollment'
);
select pg_temp.as_admin();
select is((select status::text from public.enrollments where id = pg_temp.id('e2')), 'frozen',
  'the enrollment is frozen while today is in the freeze');
select ok(
  exists (select 1 from public.audit_log where table_name = 'enrollment_freezes' and action = 'insert'),
  'freezing writes audit_log'
);
select pg_temp.login(pg_temp.id('admin_s'));
select throws_ok(
  format($$ select public.freeze_enrollment(%L, %L, %L) $$, pg_temp.id('e2'), pg_temp.d('today') + 3, pg_temp.d('today') + 9),
  'P0001', 'freeze_overlap', 'freezes of one enrollment cannot overlap'
);

select pg_temp.put('e3', public.transfer_enrollment(pg_temp.id('e1'), pg_temp.id('g3'), pg_temp.d('today') + 7)::text);
select pg_temp.as_admin();
select is(
  (select end_date || '/' || end_reason from public.enrollments where id = pg_temp.id('e1')),
  (pg_temp.d('today') + 6) || '/transferred', 'transfer ends the old enrollment the day before'
);
select is(
  (select start_date || '/' || group_id from public.enrollments where id = pg_temp.id('e3')),
  (pg_temp.d('today') + 7) || '/' || pg_temp.get('g3'), 'and starts the new one on the transfer date'
);
select is((select transferred_to_enrollment_id from public.enrollments where id = pg_temp.id('e1')), pg_temp.id('e3'),
  'the old enrollment points at the new one');

select pg_temp.login(pg_temp.id('admin_s'));
select lives_ok(
  format($$ select public.end_enrollment(%L, %L, 'dropped') $$, pg_temp.id('e2'), pg_temp.d('today') - 1),
  'end an enrollment yesterday'
);
select pg_temp.as_admin();
select is((select status::text from public.enrollments where id = pg_temp.id('e2')), 'ended',
  'an end date in the past ends it at once');
select ok(
  (select count(*) >= 2 from public.audit_log where table_name = 'enrollments' and row_id = pg_temp.id('e2')),
  'ending writes audit_log'
);
select is(private.refresh_enrollment_statuses(), 0, 'the hourly status job changes nothing when statuses are right');

select pg_temp.login(pg_temp.id('admin_s'));
select throws_ok(
  format($$ update public.students set archived_at = now() where id = %L $$, pg_temp.id('s1')),
  'P0001', 'student_has_active_enrollments', 'a student with an active enrollment cannot be archived'
);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
insert into public.student_notes (center_id, student_id, body) values (pg_temp.id('center_a'), pg_temp.id('s1'), 'Owner only');
insert into public.student_notes (center_id, student_id, body, visible_to_teachers)
values (pg_temp.id('center_a'), pg_temp.id('s1'), 'For teachers', true);

-- ---------------------------------------------------------------------------
-- Teachers: own groups, names only, never money or contacts
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select is(
  (select array_agg(name order by name) from public.groups),
  array['IELTS 6.0 · Mon/Wed/Fri 18:00', 'Teacher clash'],
  'a teacher sees only the groups they teach'
);
select is((select count(*)::int from public.lessons where group_id = pg_temp.id('g4')), 0,
  'a teacher sees no lessons of other groups');
select is((select count(*)::int from public.students), 0, 'a teacher cannot read students (contacts) directly');
select is((select count(*)::int from public.guardians), 0, 'nor guardians');
select is((select count(*)::int from public.enrollments), 0, 'nor enrollments (discounts, price overrides)');
select is((select count(*)::int from public.group_prices), 0, 'nor group prices');
select is(
  (select array_agg(full_name order by full_name) from public.group_roster(pg_temp.id('g1'))),
  array['Ali Valiyev'], 'a teacher reads the roster of their group through group_roster() (names only)'
);
select throws_ok(
  format($$ select * from public.group_roster(%L) $$, pg_temp.id('g4')),
  '42501', 'forbidden', 'but not the roster of another group'
);
select is((select array_agg(body) from public.student_notes), array['For teachers'],
  'a teacher sees only notes marked visible to teachers');
select is(
  (select count(*)::int from public.student_notes where body = 'Owner only'), 0,
  'and not the others'
);
select throws_ok(
  format($$ select public.cancel_lesson(%L, 'no') $$, pg_temp.id('makeup1')),
  '42501', 'forbidden', 'a teacher cannot cancel lessons'
);

-- The substitute sees the lesson they cover (and its group), nothing else of that group's money.
select pg_temp.login(pg_temp.id('t2'));
select ok(
  exists (select 1 from public.lessons where id = pg_temp.id('sub')),
  'the substitute sees the lesson they cover'
);
select ok(
  exists (select 1 from public.groups where id = pg_temp.id('g1')),
  'and its group'
);

-- ---------------------------------------------------------------------------
-- Holiday removal restores the cancelled lesson
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin_a'));
select lives_ok(
  format($$ select public.remove_holiday(%L) $$, (select id from public.holidays where date = pg_temp.d('holiday'))),
  'a holiday can be removed'
);
select pg_temp.as_admin();
select is(
  (select status::text from public.lessons where group_id = pg_temp.id('g1') and rule_date = pg_temp.d('holiday')),
  'scheduled', 'the lesson it cancelled comes back'
);

-- ---------------------------------------------------------------------------
-- Another center sees nothing
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_b'));
select is(
  (select (select count(*) from public.courses) + (select count(*) from public.levels)
        + (select count(*) from public.groups) + (select count(*) from public.group_prices)
        + (select count(*) from public.group_schedule_rules) + (select count(*) from public.lessons)
        + (select count(*) from public.holidays) + (select count(*) from public.schedule_conflicts)
        + (select count(*) from public.students) + (select count(*) from public.guardians)
        + (select count(*) from public.student_guardians) + (select count(*) from public.student_notes)
        + (select count(*) from public.enrollments) + (select count(*) from public.enrollment_freezes)
        + (select count(*) from public.import_jobs))::int,
  0, 'a member of another center sees nothing in any M1 table'
);
select throws_ok(
  format($$ select * from public.group_roster(%L) $$, pg_temp.id('g1')),
  '42501', 'forbidden', 'nor any roster'
);
select throws_ok(
  format($$ select public.enroll(%L, %L) $$, pg_temp.id('s2'), pg_temp.id('g1')),
  '42501', 'forbidden', 'nor can it enroll into another center''s group'
);

-- ---------------------------------------------------------------------------
-- Read-only centers can't write
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
update public.centers set status = 'read_only' where id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  format($$ select public.create_group(%L, %L, 'Late', %L) $$, pg_temp.id('a1'), pg_temp.id('ielts'), pg_temp.d('today')),
  '42501', 'center_read_only', 'a read-only center cannot create groups'
);
select is((select count(*)::int from public.groups where center_id = pg_temp.id('center_a')) > 0, true,
  'but still reads its data');

select * from finish();
rollback;
