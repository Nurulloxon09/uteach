-- The demo center that `pnpm demo:seed` builds for the public teacher demo (10-platform-onboarding, "Teacher
-- demo"). Run by scripts/demo-seed.mjs in one transaction, as `postgres`, after it has made the demo teacher's
-- accounts; it passes them in the settings `demo.teacher`, `demo.teacher_name` and `demo.owner` (profile ids).
-- The owner account can't sign in; it is there because every center keeps an active owner (m0 memberships_keep_owner).
--
-- Every run starts over: earlier demo centers (settings.demo = true) are archived and cancelled, the teacher's
-- memberships there are disabled, and a fresh center is built. Nothing is deleted (audit_log and financial rows
-- are permanent). All data is made up: students have no phones and no guardians, so nothing reaches a real
-- person, and groups have no price, so no charges are made.
do $$
declare
  v_teacher uuid := current_setting('demo.teacher')::uuid;
  v_name text := current_setting('demo.teacher_name');
  v_owner uuid := current_setting('demo.owner')::uuid;
  v_tz constant text := 'Asia/Tashkent';
  v_today date := private.today_in('Asia/Tashkent');
  v_start date := private.today_in('Asia/Tashkent') - 35;
  v_center uuid;
  v_branch uuid;
  v_room1 uuid;
  v_room2 uuid;
  v_membership uuid;
  v_sat_type uuid;
  v_ielts_type uuid;
  v_sat uuid;
  v_ielts uuid;
  v_group record;
  v_group_id uuid;
  v_edit_hours smallint;
begin
  if (select count(*) from public.profiles p where p.id in (v_teacher, v_owner)) <> 2 then
    raise exception 'the demo accounts have no profiles';
  end if;

  -- 1. Retire earlier demo centers (their owner stays, so each keeps an owner)
  update public.memberships m
  set status = 'disabled'
  from public.centers c
  where c.id = m.center_id and c.settings @> '{"demo": true}' and c.archived_at is null and m.role <> 'owner';
  update public.centers
  set archived_at = now(), status = 'cancelled'
  where settings @> '{"demo": true}' and archived_at is null;

  -- 2. Center, branch, rooms, owner and teacher. Active and paid for ten years, so it never turns read-only.
  insert into public.centers (name, slug, default_locale, timezone, status, paid_until, settings)
  values ('uteach Demo Center', 'demo-' || substr(md5(gen_random_uuid()::text), 1, 8), 'en', v_tz, 'active',
          v_today + 3650, '{"demo": true}')
  returning id, attendance_edit_hours into v_center, v_edit_hours;

  insert into public.branches (center_id, name, address, timezone)
  values (v_center, 'Namangan', 'Demo branch', v_tz)
  returning id into v_branch;
  insert into public.rooms (center_id, branch_id, name, capacity) values (v_center, v_branch, 'Room 101', 12)
  returning id into v_room1;
  insert into public.rooms (center_id, branch_id, name, capacity) values (v_center, v_branch, 'Room 102', 12)
  returning id into v_room2;

  insert into public.memberships (center_id, profile_id, role, status, display_name)
  values (v_center, v_owner, 'owner', 'active', 'Demo Owner');
  insert into public.memberships (center_id, profile_id, role, status, display_name, branch_ids, color)
  values (v_center, v_teacher, 'teacher', 'active', v_name, array[v_branch], 'indigo')
  returning id into v_membership;

  -- 3. Courses with the preset exam types, so their groups get score entry
  select id into v_sat_type from public.exam_types where center_id is null and code = 'sat';
  select id into v_ielts_type from public.exam_types where center_id is null and code = 'ielts';
  insert into public.courses (center_id, name, kind, default_lesson_minutes, exam_type_id)
  values (v_center, 'SAT', 'exam_prep', 90, v_sat_type) returning id into v_sat;
  insert into public.courses (center_id, name, kind, default_lesson_minutes, exam_type_id)
  values (v_center, 'IELTS', 'exam_prep', 90, v_ielts_type) returning id into v_ielts;

  -- 4. Four groups that never overlap; together they have lessons every day of the week
  for v_group in
    select * from (values
      ('SAT Math · Morning', 'sat', 1, array[1, 3, 5], time '09:00',
       array['Aziza Karimova', 'Bekzod Tursunov', 'Dilnoza Rahimova', 'Jasur Aliyev', 'Madina Yusupova',
             'Otabek Nazarov', 'Sevara Ismoilova'],
       array['Linear equations', 'Systems of equations', 'Linear inequalities', 'Quadratic equations',
             'Exponential functions', 'Percentages and ratios', 'Data and statistics', 'Circles',
             'Right triangles and trigonometry', 'Practice test review']),
      ('SAT Reading & Writing', 'sat', 2, array[2, 4, 6], time '11:00',
       array['Akmal Qodirov', 'Feruza Saidova', 'Islom Mirzayev', 'Kamola Ergasheva', 'Laziz Hamidov',
             'Nodira Xolmatova', 'Sardor Abdullayev'],
       array['Words in context', 'Text structure and purpose', 'Cross-text connections',
             'Central ideas and details', 'Command of evidence', 'Inferences', 'Transitions',
             'Rhetorical synthesis', 'Boundaries: punctuation', 'Form, structure and sense']),
      ('SAT Weekend Intensive', 'sat', 2, array[6, 7], time '14:00',
       array['Asal Normatova', 'Doniyor Ochilov', 'Elyor Fayzullayev', 'Hilola Qosimova', 'Mirjalol Xasanov',
             'Zarina Bakirova'],
       array['Timed practice: Math module 1', 'Timed practice: Reading and Writing module 1',
             'Timed practice: Math module 2', 'Timed practice: Reading and Writing module 2',
             'Practice test review']),
      ('IELTS Evening', 'ielts', 1, array[1, 2, 3, 4, 5, 6], time '17:00',
       array['Bobur Sharipov', 'Gulnoza Toshpulatova', 'Jahongir Umarov', 'Malika Sobirova', 'Nurbek Murodov',
             'Shahnoza Valiyeva', 'Ulugbek Raximov'],
       array['Listening: maps and plans', 'Reading: True / False / Not Given', 'Writing Task 1: line graphs',
             'Writing Task 2: opinion essays', 'Speaking Part 2: cue cards', 'Reading: matching headings',
             'Listening: form completion', 'Writing Task 1: process diagrams', 'Speaking Part 3: discussion',
             'Mock test review'])
    ) as t (name, course, room, weekdays, starts, students, topics)
  loop
    insert into public.groups (center_id, branch_id, course_id, name, teacher_membership_id, room_id, capacity,
                               status, start_date)
    values (v_center, v_branch, case v_group.course when 'sat' then v_sat else v_ielts end, v_group.name,
            v_membership, case v_group.room when 1 then v_room1 else v_room2 end, 12, 'active', v_start)
    returning id into v_group_id;

    insert into public.group_schedule_rules (center_id, group_id, weekday, start_time, duration_minutes, valid_from)
    select v_center, v_group_id, d, v_group.starts, 90, v_start from unnest(v_group.weekdays) d;

    with s as (
      insert into public.students (center_id, branch_id, full_name)
      select v_center, v_branch, n from unnest(v_group.students) n
      returning id
    )
    insert into public.enrollments (center_id, student_id, group_id, start_date, created_by)
    select v_center, s.id, v_group_id, v_start, v_teacher from s;

    -- Past lessons, as the rules would have made them, each with a topic
    insert into public.lessons (center_id, branch_id, group_id, rule_id, rule_date, local_date, starts_at, ends_at,
                                room_id, teacher_membership_id, topic)
    select v_center, v_branch, v_group_id, x.rule_id, x.local_date, x.local_date, x.starts_at, x.ends_at,
           case v_group.room when 1 then v_room1 else v_room2 end, v_membership,
           v_group.topics[1 + ((row_number() over (order by x.starts_at) - 1) % cardinality(v_group.topics))]
    from private.expand_rules(
      (select jsonb_agg(jsonb_build_object(
                'id', r.id, 'weekday', r.weekday, 'startTime', r.start_time,
                'durationMinutes', r.duration_minutes, 'validFrom', r.valid_from, 'validTo', r.valid_to))
       from public.group_schedule_rules r where r.group_id = v_group_id),
      '{}', v_start, v_today - 1, v_tz) x;

    -- Mock results every two weeks, slowly going up; the latest mock was a few days ago
    insert into public.exam_results (center_id, student_id, exam_type_id, group_id, kind, taken_on, section_scores,
                                     entered_by)
    select v_center, e.student_id, case v_group.course when 'sat' then v_sat_type else v_ielts_type end, v_group_id,
           'mock', v_start + 4 + 14 * k,
           case v_group.course
             when 'sat' then jsonb_build_object(
               'reading_writing', least(800, 500 + 10 * (abs(hashtext(e.student_id::text || 'rw')) % 18) + 30 * k),
               'math', least(800, 520 + 10 * (abs(hashtext(e.student_id::text || 'm')) % 18) + 30 * k))
             else jsonb_build_object(
               'listening', least(9, 5.5 + 0.5 * (abs(hashtext(e.student_id::text || 'l')) % 3) + 0.5 * k),
               'reading', least(9, 5.0 + 0.5 * (abs(hashtext(e.student_id::text || 'r')) % 3) + 0.5 * k),
               'writing', least(9, 5.0 + 0.5 * (abs(hashtext(e.student_id::text || 'w')) % 2) + 0.5 * (k / 2)),
               'speaking', least(9, 5.5 + 0.5 * (abs(hashtext(e.student_id::text || 's')) % 2) + 0.5 * (k / 2)))
           end,
           v_teacher
    from public.enrollments e
    cross join generate_series(0, 2) k
    where e.group_id = v_group_id;

    insert into public.student_targets (center_id, student_id, exam_type_id, target_total, exam_date)
    select v_center, e.student_id, case v_group.course when 'sat' then v_sat_type else v_ielts_type end,
           case v_group.course
             when 'sat' then 1350 + 50 * (abs(hashtext(e.student_id::text || 't')) % 4)
             else 6.5 + 0.5 * (abs(hashtext(e.student_id::text || 't')) % 2)
           end,
           v_today + case v_group.course when 'sat' then 51 else 37 end
    from public.enrollments e
    where e.group_id = v_group_id;
  end loop;

  -- 5. Attendance on past lessons: mostly present, some late, absent or excused. Lessons still inside the
  -- teacher's edit window stay unmarked, so the demo has something to mark.
  insert into public.attendance (center_id, group_id, lesson_id, student_id, enrollment_id, status, late_minutes,
                                 marked_by, marked_at)
  select v_center, l.group_id, l.id, e.student_id, e.id,
         case
           when roll < 80 then 'present'
           when roll < 88 then 'late'
           when roll < 96 then 'absent'
           else 'excused'
         end::public.attendance_status,
         case when roll >= 80 and roll < 88 then 5 + roll % 3 * 5 end,
         v_teacher, l.ends_at + interval '5 minutes'
  from public.lessons l
  join public.enrollments e on e.group_id = l.group_id
  cross join lateral (select abs(hashtext(l.id::text || e.student_id::text)) % 100 as roll) r
  where l.center_id = v_center
    and l.ends_at + make_interval(hours => v_edit_hours) < now();
  update public.lessons l
  set status = 'held'
  where l.center_id = v_center and exists (select 1 from public.attendance a where a.lesson_id = l.id);

  -- 6. Today and the next eight weeks, like the nightly job
  for v_group_id in select g.id from public.groups g where g.center_id = v_center loop
    perform private.generate_group_lessons(v_group_id);
  end loop;
end;
$$;
