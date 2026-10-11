-- M1d · Excel import RPCs: permissions, re-import without duplicates, all-or-nothing. Run with `pnpm db:test`.
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
create function pg_temp.new_job(p_kind text) returns uuid language sql as $$
  insert into public.import_jobs (center_id, kind, file_path)
  values (pg_temp.id('center'), p_kind, pg_temp.id('center')::text || '/' || gen_random_uuid() || '.xlsx')
  returning id;
$$;

select pg_temp.put('owner', pg_temp.new_user('+998920000001', 'Owner')::text);
select pg_temp.put('admin', pg_temp.new_user('+998920000002', 'Admin No Import')::text);
select pg_temp.put('other', pg_temp.new_user('+998920000003', 'Other Owner')::text);

select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('center', public.create_center('Import Center', 'Asia/Tashkent', 'uz', 'Main')::text);
select pg_temp.put('branch', (select id from public.branches where center_id = pg_temp.id('center'))::text);
insert into public.courses (center_id, name) values (pg_temp.id('center'), 'IELTS');
select pg_temp.put('course', (select id from public.courses where center_id = pg_temp.id('center'))::text);
select pg_temp.put('admin_token', public.create_invite(
  pg_temp.id('center'), 'admin', 'Admin No Import', '+998920000002', array[pg_temp.id('branch')], array['students']));
select pg_temp.login(pg_temp.id('admin'));
select public.accept_invite(current_setting('t.admin_token'));
select pg_temp.login(pg_temp.id('other'));
select public.create_center('Other', 'Asia/Tashkent', 'uz', 'Main');

-- Students ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('job1', pg_temp.new_job('students')::text);
select pg_temp.put('rows', jsonb_build_array(
  jsonb_build_object('fullName', 'Ali Valiyev', 'phone', '+998931000001', 'branchId', pg_temp.id('branch'),
                     'externalRef', 'S-1', 'guardianName', 'Malika', 'guardianPhone', '+998901000001'),
  jsonb_build_object('fullName', 'Vali Valiyev', 'phone', '+998931000002', 'branchId', pg_temp.id('branch'),
                     'externalRef', 'S-2', 'guardianName', 'Malika', 'guardianPhone', '+998901000001'),
  jsonb_build_object('fullName', 'Gulnoza Karimova', 'branchId', pg_temp.id('branch'), 'birthDate', '2012-05-01')
)::text);
select is(
  public.import_students(pg_temp.id('job1'), current_setting('t.rows')::jsonb),
  '{"created": 3, "skipped": 0}'::jsonb, 'a students file imports every new row'
);
select is((select status from public.import_jobs where id = pg_temp.id('job1')), 'imported', 'the job is marked imported');
select is((select count(*)::int from public.guardians where center_id = pg_temp.id('center')), 1,
  'siblings in the file share one guardian');
select throws_ok(
  format($$ select public.import_students(%L, '[]') $$, pg_temp.id('job1')),
  'P0001', 'import_done', 'a job imports only once'
);

select pg_temp.put('job2', pg_temp.new_job('students')::text);
select is(
  public.import_students(pg_temp.id('job2'), current_setting('t.rows')::jsonb),
  '{"created": 1, "skipped": 2}'::jsonb,
  're-importing the same file skips matched rows (external ref, or phone + name)'
);
select is((select count(*)::int from public.students where center_id = pg_temp.id('center') and full_name = 'Ali Valiyev'), 1,
  'no duplicate students');

-- All or nothing: one bad row (a branch of another center) rolls everything back.
select pg_temp.put('job3', pg_temp.new_job('students')::text);
select throws_ok(
  format($$ select public.import_students(%L, %L::jsonb) $$, pg_temp.id('job3'), jsonb_build_array(
    jsonb_build_object('fullName', 'New One', 'branchId', pg_temp.id('branch')),
    jsonb_build_object('fullName', 'Bad Phone', 'phone', 'not-a-phone', 'branchId', pg_temp.id('branch'))
  )),
  '23514', null, 'a row the database rejects fails the job'
);
select is((select count(*)::int from public.students where full_name = 'New One'), 0, 'and nothing from it is written');

-- Groups and enrollments ----------------------------------------------------------------
select pg_temp.put('job4', pg_temp.new_job('groups')::text);
select is(
  public.import_groups(pg_temp.id('job4'), jsonb_build_array(
    jsonb_build_object('name', 'IELTS A', 'branchId', pg_temp.id('branch'), 'courseId', pg_temp.id('course'),
                       'startDate', '2026-09-01', 'price', '60000000',
                       'rules', jsonb_build_array(jsonb_build_object('weekday', 1, 'startTime', '18:00', 'durationMinutes', 90)))
  )),
  '{"created": 1, "skipped": 0}'::jsonb, 'a groups file imports with price and weekly times'
);
select pg_temp.as_admin();
select is((select count(*)::int from public.group_schedule_rules r join public.groups g on g.id = r.group_id where g.name = 'IELTS A'), 1,
  'without a teacher the weekly times are kept');
select is((select count(*)::int from public.lessons l join public.groups g on g.id = l.group_id where g.name = 'IELTS A'), 0,
  'but no lessons are made until a teacher is set');
select pg_temp.put('group', (select id from public.groups where name = 'IELTS A')::text);

select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('job5', pg_temp.new_job('enrollments')::text);
select is(
  public.import_enrollments(pg_temp.id('job5'), jsonb_build_array(
    jsonb_build_object('studentId', (select id from public.students where external_ref = 'S-1'), 'groupId', pg_temp.id('group'), 'startDate', '2026-09-01'),
    jsonb_build_object('studentId', (select id from public.students where external_ref = 'S-2'), 'groupId', pg_temp.id('group'), 'startDate', '2026-09-01')
  )),
  '{"created": 2, "skipped": 0}'::jsonb, 'an enrollments file imports'
);
select pg_temp.put('job6', pg_temp.new_job('enrollments')::text);
select is(
  (public.import_enrollments(pg_temp.id('job6'), jsonb_build_array(
    jsonb_build_object('studentId', (select id from public.students where external_ref = 'S-1'), 'groupId', pg_temp.id('group'), 'startDate', '2026-09-01')
  )) ->> 'skipped')::int,
  1, 'a student already in the group is skipped'
);

-- Permissions ----------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin'));
select throws_ok(
  $$ insert into public.import_jobs (center_id, kind, file_path) values (pg_temp.id('center'), 'students', pg_temp.id('center')::text || '/x.xlsx') $$,
  '42501', null, 'staff without `import` cannot start an import'
);
select is((select count(*)::int from public.import_jobs), 0, 'nor see import jobs');

select pg_temp.login(pg_temp.id('other'));
select throws_ok(
  $$ select public.import_students(pg_temp.new_job('students'), '[]') $$,
  '42501', null, 'another center cannot even create a job here'
);
select throws_ok(
  format($$ select public.import_students(%L, '[]') $$, pg_temp.id('job3')),
  '42501', 'forbidden', 'nor run one of its jobs'
);

select * from finish();
rollback;
