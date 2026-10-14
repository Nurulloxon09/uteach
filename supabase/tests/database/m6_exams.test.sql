-- M6 · Exam scores: presets and custom types, the score trigger (ranges, steps, totals), group entry and
-- re-entry, official results, targets and the gap table, score_posted, convert → target, and RLS.
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

create function pg_temp.preset(p_code text) returns uuid language sql as $$
  select id from public.exam_types where center_id is null and code = p_code;
$$;

-- One student's IELTS row for save_group_scores.
create function pg_temp.ielts(p_student text, l numeric, r numeric, w numeric, s numeric) returns jsonb language sql as $$
  select jsonb_build_object('studentId', pg_temp.id(p_student),
    'scores', jsonb_build_object('listening', l, 'reading', r, 'writing', w, 'speaking', s));
$$;

create function pg_temp.result(p_student text, p_kind text default 'mock') returns public.exam_results language sql as $$
  select r.* from public.exam_results r
  where r.student_id = pg_temp.id(p_student) and r.exam_type_id = pg_temp.preset('ielts') and r.kind::text = p_kind
  order by r.taken_on desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998940000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998940000002', 'Owner B')::text);
select pg_temp.put('adm', pg_temp.new_user('+998940000003', 'Academic Admin')::text);
select pg_temp.put('adm_ro', pg_temp.new_user('+998940000004', 'Admin Without Academics')::text);
select pg_temp.put('adm_a2', pg_temp.new_user('+998940000005', 'Admin Other Branch')::text);
select pg_temp.put('t1', pg_temp.new_user('+998940000006', 'Teacher One')::text);
select pg_temp.put('t2', pg_temp.new_user('+998940000007', 'Teacher Two')::text);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Exams A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent');
select pg_temp.put('a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);
select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Exams B', 'Asia/Tashkent', 'ru', 'Main')::text);

select pg_temp.put('m_adm', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm'), 'admin', 'Academic Admin',
  '+998940000003', array[pg_temp.id('a1')], array['academics', 'students', 'leads'])::text);
select pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_ro'), 'admin', 'Admin Without Academics',
  '+998940000004', array[pg_temp.id('a1')], array['students']);
select pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_a2'), 'admin', 'Admin Other Branch',
  '+998940000005', array[pg_temp.id('a2')], array['academics', 'students']);
select pg_temp.put('m_t1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t1'), 'teacher', 'Teacher One',
  '+998940000006', array[pg_temp.id('a1')])::text);
select pg_temp.put('m_t2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t2'), 'teacher', 'Teacher Two',
  '+998940000007', array[pg_temp.id('a1')])::text);

select pg_temp.as_admin();
select pg_temp.put('today', private.today_in('Asia/Tashkent')::text);
update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where id = pg_temp.id('center_a');
insert into public.courses (center_id, name, kind) values (pg_temp.id('center_a'), 'IELTS', 'exam_prep');
select pg_temp.put('course', (select id from public.courses where center_id = pg_temp.id('center_a'))::text);
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g1', public.create_group(pg_temp.id('a1'), pg_temp.id('course'), 'IELTS-1', pg_temp.d('today') - 60,
  p_teacher_membership_id => pg_temp.id('m_t1'), p_price_amount => 60000000)::text);
select pg_temp.put('g2', public.create_group(pg_temp.id('a1'), pg_temp.id('course'), 'IELTS-2', pg_temp.d('today') - 60,
  p_teacher_membership_id => pg_temp.id('m_t2'), p_price_amount => 60000000)::text);

-- 15 students in G1 (s01 … s15), one in G2; s01 has a mother who gets notifications.
select pg_temp.as_admin();
insert into public.students (center_id, branch_id, full_name)
select pg_temp.id('center_a'), pg_temp.id('a1'), format('Student %s', lpad(n::text, 2, '0'))
from generate_series(1, 16) n;
select pg_temp.put(format('s%s', lpad(n::text, 2, '0')),
  (select id from public.students where full_name = format('Student %s', lpad(n::text, 2, '0'))
     and center_id = pg_temp.id('center_a'))::text)
from generate_series(1, 16) n;
insert into public.guardians (center_id, full_name, phone) values (pg_temp.id('center_a'), 'Mother', '+998940000091');
insert into public.student_guardians (center_id, student_id, guardian_id, is_primary)
select pg_temp.id('center_a'), pg_temp.id('s01'), g.id, true
from public.guardians g where g.center_id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('owner_a'));
select public.enroll(pg_temp.id(format('s%s', lpad(n::text, 2, '0'))), pg_temp.id('g1'), pg_temp.d('today') - 30)
from generate_series(1, 15) n;
select public.enroll(pg_temp.id('s16'), pg_temp.id('g2'), pg_temp.d('today') - 30);

-- ---------------------------------------------------------------------------
-- Exam types
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
select is((select string_agg(code || ':' || total_min || '-' || total_max, ' ' order by code)
           from public.exam_types where center_id is null),
  'cefr:0.0-75.0 ielts:0.0-9.0 milliy:0.0-75.0 sat:400.0-1600.0', 'four presets with their total ranges');

select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.exam_types), 4, 'teachers read the presets');

select pg_temp.login(pg_temp.id('owner_a'));
update public.exam_types set name = 'Hacked' where code = 'ielts';
select is((select name from public.exam_types where code = 'ielts' and center_id is null), 'IELTS',
  'a center owner can''t edit a preset (RLS hides it from updates)');
select throws_ok(
  $$ insert into public.exam_types (center_id, name, sections, total_rule)
     values (null, 'Fake', '[{"key":"a","label":{"uz":"A","ru":"A","en":"A"},"min":0,"max":10,"step":1}]', 'sum') $$,
  '42501', null, 'nobody adds a preset'
);
select throws_ok(
  format($$ insert into public.exam_types (center_id, name, sections, total_rule)
     values (%L, 'Bad', '[{"key":"a","label":{"uz":"A","ru":"A","en":"A"},"min":0,"max":10,"step":3}]', 'sum') $$,
     pg_temp.id('center_a')),
  'invalid_exam_type', 'a step that doesn''t divide the range is rejected'
);
select lives_ok(
  format($$ insert into public.exam_types (center_id, name, sections, total_rule)
     values (%L, 'Grammar test', '[
       {"key":"grammar","label":{"uz":"Grammatika","ru":"Грамматика","en":"Grammar"},"min":0,"max":50,"step":1},
       {"key":"vocab","label":{"uz":"Lugʻat","ru":"Лексика","en":"Vocabulary"},"min":0,"max":50,"step":1}]', 'sum') $$,
     pg_temp.id('center_a')),
  'the owner adds a custom type'
);
select pg_temp.put('custom', (select id from public.exam_types where name = 'Grammar test')::text);
select is((select code ~ '^c_[0-9a-f]{12}$' and total_min = 0 and total_max = 100
           from public.exam_types where id = pg_temp.id('custom')), true,
  'a custom type gets its own code and total range');

select pg_temp.login(pg_temp.id('adm_ro'));
select throws_ok(
  format($$ insert into public.exam_types (center_id, name, sections, total_rule)
     values (%L, 'Nope', '[{"key":"a","label":{"uz":"A","ru":"A","en":"A"},"min":0,"max":10,"step":1}]', 'sum') $$,
     pg_temp.id('center_a')),
  '42501', null, 'custom types need the academics flag'
);
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.exam_types), 4, 'another center sees only the presets');
select throws_ok(
  format($$ insert into public.courses (center_id, name, exam_type_id) values (%L, 'Stolen', %L) $$,
         pg_temp.id('center_b'), pg_temp.id('custom')),
  'invalid_exam_type', 'a course can''t use another center''s custom type'
);
select pg_temp.login(pg_temp.id('owner_a'));
select lives_ok(
  format($$ update public.courses set exam_type_id = %L where id = %L $$, pg_temp.preset('ielts'), pg_temp.id('course')),
  'the IELTS course gets the IELTS preset'
);

-- ---------------------------------------------------------------------------
-- Group entry: a 15-student IELTS mock by the teacher
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select is(
  public.save_group_scores(pg_temp.id('g1'), pg_temp.preset('ielts'), 'mock', pg_temp.d('today') - 7,
    (select jsonb_agg(pg_temp.ielts(format('s%s', lpad(n::text, 2, '0')), 6.5, 6.5, 5.0, 7.0)) from generate_series(1, 15) n))
    - 'notified',
  '{"saved": 15, "deleted": 0}'::jsonb, 'the teacher saves a 15-student mock'
);
select is((pg_temp.result('s01')).total_score, 6.5::numeric, '6.5, 6.5, 5.0, 7.0 → 6.25 → 6.5');
select is((select count(*)::int from public.exam_results where group_id = pg_temp.id('g1')), 15, 'one row per student');

select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'mock', %L, %L) $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today') - 7, jsonb_build_array(pg_temp.ielts('s02', 7.3, 6, 6, 6))),
  'exam_score_invalid', '7.3 is rejected (off the 0.5 step)'
);
select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'mock', %L, %L) $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today') - 7, jsonb_build_array(pg_temp.ielts('s02', 10, 6, 6, 6))),
  'exam_score_invalid', '10 is rejected (out of range)'
);
select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'mock', %L, %L) $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today') - 7, jsonb_build_array(pg_temp.ielts('s16', 6, 6, 6, 6))),
  'student_not_expected', 'a student from another group is rejected'
);
select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'mock', %L, '[]') $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today') + 1),
  'invalid_dates', 'no scores for a future day'
);
select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'official', %L, '[]') $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today')),
  'invalid_exam_result', 'official results aren''t entered per group'
);
select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'mock', %L, '[]') $$, pg_temp.id('g2'), pg_temp.preset('ielts'),
         pg_temp.d('today')),
  '42501', null, 'a teacher can''t enter scores for another teacher''s group'
);
select throws_ok(
  format($$ insert into public.exam_results (center_id, student_id, exam_type_id, group_id, kind, taken_on, section_scores)
            values (%L, %L, %L, %L, 'mock', %L, '{"listening": 9}') $$,
         pg_temp.id('center_a'), pg_temp.id('s02'), pg_temp.preset('ielts'), pg_temp.id('g1'), pg_temp.d('today')),
  '42501', null, 'results are written only through the RPCs'
);

-- Re-entry edits the same rows; a cleared row deletes; partial rows have no total.
select is(
  public.save_group_scores(pg_temp.id('g1'), pg_temp.preset('ielts'), 'mock', pg_temp.d('today') - 7,
    jsonb_build_array(
      pg_temp.ielts('s01', 6.5, 6.5, 5.5, 6.0),
      pg_temp.ielts('s02', 6.5, 6.5, 5.0, 7.0),
      jsonb_build_object('studentId', pg_temp.id('s03'), 'scores', '{"listening": null, "reading": null}'::jsonb),
      jsonb_build_object('studentId', pg_temp.id('s04'), 'scores', '{"listening": 7, "reading": 7.5}'::jsonb)
    )) - 'notified',
  '{"saved": 2, "deleted": 1}'::jsonb, 're-entry: s01 and s04 change, s02 is unchanged, s03 is cleared'
);
select is((select count(*)::int from public.exam_results where group_id = pg_temp.id('g1')), 14, 're-entry doesn''t duplicate');
select is((pg_temp.result('s01')).total_score, 6.0::numeric, '6.5, 6.5, 5.5, 6.0 → 6.125 → 6.0');
select is((pg_temp.result('s04')).total_score, null, 'a partial mock has no total');
select is((pg_temp.result('s04')).section_scores, '{"listening": 7, "reading": 7.5}'::jsonb, 'only the entered sections are kept');

-- ---------------------------------------------------------------------------
-- score_posted
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
select is(
  (select string_agg(case when guardian_id is not null then 'guardian' else 'student' end || ':' || status, ' '
                     order by guardian_id nulls first)
   from public.notification_outbox where template_key = 'score_posted' and dedupe_key like format('score:%s:%%', (pg_temp.result('s01')).id)),
  'student:pending guardian:pending', 's01''s result is queued once for the student and once for the mother'
);
select is(
  (select count(*)::int from public.notification_outbox where template_key = 'score_posted' and status = 'cancelled'
     and dedupe_key like format('score:%s:%%', (pg_temp.result('s01')).id)),
  0, 'the re-save reused the waiting rows'
);
select ok(
  (select bool_and(send_after between now() + interval '9 minutes' and now() + interval '11 minutes')
   from public.notification_outbox where template_key = 'score_posted' and center_id = pg_temp.id('center_a')),
  'messages wait 10 minutes'
);
select is(
  (select payload ->> 'total' || ' | ' || (payload -> 'sections' ->> 'en')
   from public.notification_outbox
   where template_key = 'score_posted' and student_id = pg_temp.id('s01')),
  '6.0 | Listening 6.5 · Reading 6.5 · Writing 5.5 · Speaking 6.0', 'the payload has the new total and sections'
);
select is(
  (select count(*)::int from public.notification_outbox
   where template_key = 'score_posted' and student_id = pg_temp.id('s03') and status = 'pending'),
  0, 'nothing waits for the cleared row'
);
select is(
  (select count(*)::int from public.notification_outbox where template_key = 'score_posted' and status = 'pending'
     and center_id = pg_temp.id('center_a')),
  15, '15 waiting messages: 14 students + the mother'
);

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t2'));
select is((select count(*)::int from public.exam_results), 0, 'another teacher sees none of G1''s scores');
select pg_temp.login(pg_temp.id('adm_ro'));
select is((select count(*)::int from public.exam_results), 14, 'an admin without academics reads the branch''s scores');
select throws_ok(
  format($$ select public.save_group_scores(%L, %L, 'mock', %L, '[]') $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today')),
  '42501', null, 'but can''t enter scores'
);
select pg_temp.login(pg_temp.id('adm_a2'));
select is((select count(*)::int from public.exam_results), 0, 'an admin of another branch sees nothing');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.exam_results) + (select count(*)::int from public.student_targets), 0,
  'another center sees nothing');
select is((select count(*)::int from public.score_entries(pg_temp.id('center_a'))), 0, 'and no score entries');

select pg_temp.login(pg_temp.id('t1'));
select is(
  (select kind || ' ' || students || ' ' || average_total from public.score_entries(pg_temp.id('center_a'))),
  'mock 14 6.5', 'the Scores page lists the entry with its average'
);

-- ---------------------------------------------------------------------------
-- Custom types freeze once used
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm'));
select lives_ok(
  format($$ select public.save_group_scores(%L, %L, 'diagnostic', %L, %L) $$, pg_temp.id('g1'), pg_temp.id('custom'),
         pg_temp.d('today') - 20,
         jsonb_build_array(jsonb_build_object('studentId', pg_temp.id('s05'), 'scores', '{"grammar": 40, "vocab": 35}'::jsonb))),
  'the academic admin enters a custom diagnostic'
);
select is((select total_score from public.exam_results where exam_type_id = pg_temp.id('custom')), 75.0::numeric,
  'sum total');
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  format($$ update public.exam_types set total_rule = 'average' where id = %L $$, pg_temp.id('custom')),
  'exam_type_in_use', 'a used type''s rule can''t change'
);
select lives_ok(
  format($$ update public.exam_types set name = 'Grammar check' where id = %L $$, pg_temp.id('custom')),
  'but it can be renamed'
);

-- ---------------------------------------------------------------------------
-- Official results, targets and the gap table
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('t1'));
select lives_ok(
  format($$ select public.save_group_scores(%L, %L, 'diagnostic', %L, %L) $$, pg_temp.id('g1'), pg_temp.preset('ielts'),
         pg_temp.d('today') - 50, jsonb_build_array(pg_temp.ielts('s02', 5, 5.5, 5, 5.5))),
  'a diagnostic for s02 seven weeks ago'
);
select throws_ok(
  format($$ select public.save_official_result(%L, %L, %L, '{"listening": 7}', %L) $$, pg_temp.id('s02'),
         pg_temp.preset('ielts'), pg_temp.d('today') - 1, pg_temp.id('center_b') || '/certificates/x.pdf'),
  'invalid_exam_result', 'a certificate must be in the center''s own folder'
);
select pg_temp.put('official', public.save_official_result(pg_temp.id('s02'), pg_temp.preset('ielts'),
  pg_temp.d('today') - 1, '{"listening": 7.5, "reading": 7, "writing": 6, "speaking": 6.5}',
  pg_temp.id('center_a') || '/certificates/s02.pdf')::text);
select is((select total_score::text || ' ' || kind || ' ' || (group_id is null)::text from public.exam_results
           where id = pg_temp.id('official')), '7.0 official true', 'the student''s teacher records an official 7.0');
select is(public.save_official_result(pg_temp.id('s02'), pg_temp.preset('ielts'), pg_temp.d('today') - 1,
  '{"listening": 7.5, "reading": 7.5, "writing": 6, "speaking": 6.5}'), pg_temp.id('official'),
  'the same day edits the same official result');
select is((select certificate_path from public.exam_results where id = pg_temp.id('official')),
  pg_temp.id('center_a') || '/certificates/s02.pdf', 'and keeps the certificate');
select throws_ok(
  format($$ select public.save_official_result(%L, %L, %L, '{"listening": 7}') $$, pg_temp.id('s16'),
         pg_temp.preset('ielts'), pg_temp.d('today')),
  '42501', null, 'not for another teacher''s student'
);

select throws_ok(
  format($$ select public.set_student_target(%L, %L, 10) $$, pg_temp.id('s02'), pg_temp.preset('ielts')),
  'invalid_target', 'a target beyond 9 is rejected'
);
select lives_ok(
  format($$ select public.set_student_target(%L, %L, 7.5, %L) $$, pg_temp.id('s02'), pg_temp.preset('ielts'),
         pg_temp.d('today') + 40),
  'the teacher sets s02''s target 7.5 with an exam date'
);
select is(
  (select format('%s %s %s %s %s %s', results_count, latest_total, previous_total, target_total, gap, uplift)
   from public.group_scores(pg_temp.id('g1'), pg_temp.preset('ielts')) where student_id = pg_temp.id('s02')),
  '3 7.0 6.5 7.5 0.5 1.5', 'gap table: latest 7.0 after the mock 6.5, gap 0.5, uplift 1.5 from the 5.5 diagnostic'
);
select is(
  (select count(*)::int from public.group_scores(pg_temp.id('g1'), pg_temp.preset('ielts'))), 15,
  'every student of the group is listed'
);
select is(
  (select format('%s %s', results_count, latest_total) from public.group_scores(pg_temp.id('g1'), pg_temp.preset('ielts'))
   where student_id = pg_temp.id('s03')),
  '0 ', 'a student without results has an empty row'
);
select lives_ok(
  format($$ select public.set_student_target(%L, %L, null, null) $$, pg_temp.id('s03'), pg_temp.preset('ielts')),
  'clearing a target that doesn''t exist is fine'
);
select pg_temp.login(pg_temp.id('t2'));
select throws_ok(
  format($$ select * from public.group_scores(%L, %L) $$, pg_temp.id('g1'), pg_temp.preset('ielts')),
  '42501', null, 'another teacher can''t read the gap table'
);

-- Deleting cancels the waiting message.
select pg_temp.login(pg_temp.id('owner_a'));
select lives_ok(format($$ select public.delete_exam_result(%L) $$, pg_temp.id('official')), 'the owner deletes the official result');
select pg_temp.as_admin();
select is(
  (select string_agg(distinct status::text, ',') from public.notification_outbox
   where dedupe_key like format('score:%s:%%', pg_temp.id('official'))),
  'cancelled', 'its waiting message is cancelled'
);

-- ---------------------------------------------------------------------------
-- Convert → target
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm'));
select pg_temp.put('lead', public.create_lead(pg_temp.id('a1'), 'Dilnoza Rahimova', '+998940000031',
  p_goal => 'IELTS 7.0', p_target_score => 7.0)::text);
select pg_temp.put('converted', (public.convert_lead(pg_temp.id('lead'), pg_temp.id('g1'), pg_temp.d('today')) ->> 'studentId'));
select is(
  (select target_total from public.student_targets where student_id = pg_temp.id('converted')
     and exam_type_id = pg_temp.preset('ielts')),
  7.0::numeric, 'converting a lead with a target score writes the IELTS target'
);
select pg_temp.put('lead2', public.create_lead(pg_temp.id('a1'), 'Big Target', null, p_target_score => 1450)::text);
select lives_ok(
  format($$ select public.convert_lead(%L, %L, %L) $$, pg_temp.id('lead2'), pg_temp.id('g1'), pg_temp.d('today')),
  'a target that doesn''t fit the type never blocks the conversion'
);
select is(
  (select count(*)::int from public.student_targets t join public.leads l on l.converted_student_id = t.student_id
   where l.id = pg_temp.id('lead2')),
  0, 'and writes no target'
);

select * from finish();
rollback;
