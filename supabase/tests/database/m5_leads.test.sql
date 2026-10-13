-- M5 · Leads CRM: pipeline moves, timeline and follow-ups, duplicates, trials on the sheet, convert, merge,
-- lost reasons and RLS. Run with `pnpm db:test`.
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

create function pg_temp.lesson(p_starts timestamptz) returns text language sql as $$
  insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at, teacher_membership_id,
                              status, is_manually_edited)
  select g.center_id, g.branch_id, g.id, (p_starts at time zone 'Asia/Tashkent')::date, p_starts,
         p_starts + interval '90 minutes', g.teacher_membership_id, 'scheduled', true
  from public.groups g where g.id = pg_temp.id('g1')
  returning id::text;
$$;

create function pg_temp.lead(p_name text, p_phone text default null) returns text language sql as $$
  select public.create_lead(pg_temp.id('a1'), p_name, p_phone)::text;
$$;

create function pg_temp.status(p_lead text) returns text language sql as $$
  select status::text from public.leads where id = pg_temp.id(p_lead);
$$;

create function pg_temp.reason(p_key text) returns uuid language sql as $$
  select id from public.lost_reasons where center_id = pg_temp.id('center_a') and system_key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998930000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998930000002', 'Owner B')::text);
select pg_temp.put('adm', pg_temp.new_user('+998930000003', 'Lead Admin')::text);
select pg_temp.put('adm_no', pg_temp.new_user('+998930000004', 'Admin Without Leads')::text);
select pg_temp.put('adm_a2', pg_temp.new_user('+998930000005', 'Admin Other Branch')::text);
select pg_temp.put('t1', pg_temp.new_user('+998930000006', 'Teacher One')::text);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Leads A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent');
select pg_temp.put('a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);
select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Leads B', 'Asia/Tashkent', 'ru', 'Main')::text);

select pg_temp.put('m_adm', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm'), 'admin', 'Lead Admin',
  '+998930000003', array[pg_temp.id('a1')], array['leads', 'students', 'attendance'])::text);
select pg_temp.put('m_adm_no', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_no'), 'admin', 'Admin Without Leads',
  '+998930000004', array[pg_temp.id('a1')], array['students'])::text);
select pg_temp.put('m_adm_a2', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('adm_a2'), 'admin', 'Admin Other Branch',
  '+998930000005', array[pg_temp.id('a2')], array['leads', 'students'])::text);
select pg_temp.put('m_t1', pg_temp.hire(pg_temp.id('center_a'), pg_temp.id('t1'), 'teacher', 'Teacher One',
  '+998930000006', array[pg_temp.id('a1')])::text);

select pg_temp.as_admin();
select pg_temp.put('today', private.today_in('Asia/Tashkent')::text);
update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00' where id = pg_temp.id('center_a');
insert into public.courses (center_id, name) values (pg_temp.id('center_a'), 'English');
select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('g1', public.create_group(
  pg_temp.id('a1'), (select id from public.courses where center_id = pg_temp.id('center_a')), 'G1',
  pg_temp.d('today') - 30, p_teacher_membership_id => pg_temp.id('m_t1'), p_price_amount => 60000000)::text);
select pg_temp.as_admin();
select pg_temp.put('l_now', pg_temp.lesson(now() + interval '1 day'));
select pg_temp.put('l_f1', pg_temp.lesson(now() + interval '2 days'));
select pg_temp.put('l_f2', pg_temp.lesson(now() + interval '3 days'));
select pg_temp.put('l_f3', pg_temp.lesson(now() + interval '4 days'));
select pg_temp.lesson(now() + make_interval(days => d)) from generate_series(5, 16) d;
select pg_temp.put('l_past', pg_temp.lesson(now() - interval '3 days'));

-- Ali (own phone) in G1; Bobur's mother has the phone +998930000019.
insert into public.students (center_id, branch_id, full_name, phone)
values (pg_temp.id('center_a'), pg_temp.id('a1'), 'Ali Valiyev', '+998930000011'),
       (pg_temp.id('center_a'), pg_temp.id('a1'), 'Bobur Karimov', null);
select pg_temp.put('ali', (select id from public.students where full_name = 'Ali Valiyev' and center_id = pg_temp.id('center_a'))::text);
select pg_temp.put('bobur', (select id from public.students where full_name = 'Bobur Karimov' and center_id = pg_temp.id('center_a'))::text);
insert into public.guardians (center_id, full_name, phone) values (pg_temp.id('center_a'), 'Mother', '+998930000019');
insert into public.student_guardians (center_id, student_id, guardian_id, is_primary)
select pg_temp.id('center_a'), pg_temp.id('bobur'), g.id, true from public.guardians g where g.phone = '+998930000019' and g.center_id = pg_temp.id('center_a');
select pg_temp.login(pg_temp.id('owner_a'));
select public.enroll(pg_temp.id('ali'), pg_temp.id('g1'), pg_temp.d('today'));

-- ---------------------------------------------------------------------------
-- Lost reasons
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
select is(
  (select string_agg(system_key, ' ' order by sort_order) from public.lost_reasons where center_id = pg_temp.id('center_a')),
  'price schedule location competitor no_response other', 'every new center gets the six lost reasons'
);
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.lost_reasons), 6, 'members read their own center''s reasons only');
select pg_temp.login(pg_temp.id('adm'));
select throws_ok(
  format($$ insert into public.lost_reasons (center_id, label) values (%L, 'Moved away') $$, pg_temp.id('center_a')),
  '42501', null, 'adding a reason needs the settings flag'
);
select pg_temp.login(pg_temp.id('owner_a'));
select lives_ok(
  format($$ insert into public.lost_reasons (center_id, label, sort_order) values (%L, 'Moved away', 7) $$,
         pg_temp.id('center_a')),
  'the owner adds a custom reason'
);

-- ---------------------------------------------------------------------------
-- Create, visibility, RLS
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm'));
select pg_temp.put('lead1', public.create_lead(pg_temp.id('a1'), 'Dilnoza Rahimova', '+998930000031', 'instagram',
  p_goal => 'IELTS 7.0', p_note => 'Wants evening classes')::text);
select is(pg_temp.status('lead1'), 'new', 'a new lead starts as new');
select is((select assigned_membership_id from public.leads where id = pg_temp.id('lead1')), pg_temp.id('m_adm'),
  'the creator is the default assignee');
select is(
  (select string_agg(kind || ':' || coalesce(body, ''), ' | ' order by kind) from public.lead_activities
   where lead_id = pg_temp.id('lead1')),
  'note:Wants evening classes | system:created', 'creating writes the system row and the first note'
);
select throws_ok(
  format($$ update public.leads set status = 'won' where id = %L $$, pg_temp.id('lead1')),
  '42501', null, 'status can''t be updated directly'
);
select lives_ok(
  format($$ update public.leads set goal = 'IELTS 7.5' where id = %L $$, pg_temp.id('lead1')),
  'plain fields are updated directly'
);
select throws_ok(
  format($$ update public.leads set assigned_membership_id = %L where id = %L $$, pg_temp.id('m_t1'), pg_temp.id('lead1')),
  'invalid_assignee', 'a teacher can''t be the assignee'
);

select pg_temp.login(pg_temp.id('adm_no'));
select throws_ok(format($$ select public.create_lead(%L, 'X') $$, pg_temp.id('a1')), '42501', null,
  'an admin without the leads flag can''t create leads');
select is((select count(*)::int from public.leads), 0, 'an admin without the leads flag sees no leads');
select pg_temp.login(pg_temp.id('adm_a2'));
select is((select count(*)::int from public.leads), 0, 'an admin of another branch sees no leads');
select is((select count(*)::int from public.lead_activities), 0, '… and no timeline');
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.leads), 0, 'teachers see no leads');
select throws_ok(format($$ select * from public.lead_duplicates(%L, '+998930000031') $$, pg_temp.id('center_a')),
  '42501', null, 'teachers can''t run the duplicate check');
select pg_temp.login(pg_temp.id('owner_b'));
select is((select count(*)::int from public.leads), 0, 'another center sees no leads');
select throws_ok(format($$ select public.move_lead(%L, 'contacted') $$, pg_temp.id('lead1')), '42501', null,
  'another center can''t move a lead');
select pg_temp.login(pg_temp.id('owner_a'));
select is((select count(*)::int from public.leads), 1, 'the owner sees the lead');

-- ---------------------------------------------------------------------------
-- Moves
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm'));
select lives_ok(format($$ select public.move_lead(%L, 'contacted') $$, pg_temp.id('lead1')), 'new → contacted');
select is(
  (select from_status || '→' || to_status from public.lead_activities
   where lead_id = pg_temp.id('lead1') and kind = 'status_change'),
  'new→contacted', 'every move writes a status_change activity'
);
select throws_ok(format($$ select public.move_lead(%L, 'won') $$, pg_temp.id('lead1')), 'invalid_lead_move',
  'won only through convert');
select throws_ok(format($$ select public.move_lead(%L, 'trial_scheduled') $$, pg_temp.id('lead1')), 'trial_required',
  'trial_scheduled only through schedule_trial');
select throws_ok(format($$ select public.move_lead(%L, 'contacted') $$, pg_temp.id('lead1')), 'invalid_lead_move',
  'moving to the same status is refused');
select throws_ok(format($$ select public.move_lead(%L, 'lost') $$, pg_temp.id('lead1')), 'lost_reason_required',
  'lost needs a reason');
select throws_ok(
  format($$ select public.move_lead(%L, 'lost', %L) $$, pg_temp.id('lead1'),
         (select id from public.lost_reasons where center_id = pg_temp.id('center_b') limit 1)),
  'lost_reason_required', 'another center''s reason doesn''t count'
);
select lives_ok(
  format($$ select public.move_lead(%L, 'lost', %L, 'Too expensive') $$, pg_temp.id('lead1'), pg_temp.reason('price')),
  'contacted → lost with a reason'
);
select is((select lost_note from public.leads where id = pg_temp.id('lead1')), 'Too expensive', 'the note is kept');
select throws_ok(format($$ select public.move_lead(%L, 'trial_done') $$, pg_temp.id('lead1')), 'invalid_lead_move',
  'a lost lead only reopens to new or contacted');
select lives_ok(format($$ select public.move_lead(%L, 'contacted') $$, pg_temp.id('lead1')), 'lost → contacted');
select is((select lost_reason_id from public.leads where id = pg_temp.id('lead1')), null,
  'reopening clears the reason');
select pg_temp.as_admin();
select throws_ok(
  format($$ update public.leads set status = 'lost', lost_reason_id = null where id = %L $$, pg_temp.id('lead1')),
  '23514', null, 'the database itself rejects lost without a reason'
);
select throws_ok(
  format($$ update public.leads set status = 'won' where id = %L $$, pg_temp.id('lead1')),
  '23514', null, '… and won without a student'
);
-- Parity with canMoveLead in packages/core/src/leads.ts (same matrix string in leads.test.ts).
select is(
  (select string_agg(f::text || '>' || coalesce(
     (select string_agg(t::text, ',' order by t) from unnest(enum_range(null::public.lead_status)) t
      where private.lead_move_allowed(f, t)), '-'), ' ' order by f)
   from unnest(enum_range(null::public.lead_status)) f),
  'new>contacted,trial_done,lost contacted>new,trial_done,lost trial_scheduled>new,contacted,trial_done,lost '
  || 'trial_done>new,contacted,lost won>- lost>new,contacted',
  'the move table matches packages/core'
);

-- ---------------------------------------------------------------------------
-- Timeline and follow-ups
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm'));
select throws_ok(format($$ select public.add_lead_activity(%L, 'note', '  ') $$, pg_temp.id('lead1')),
  'invalid_activity', 'an empty note is refused');
select throws_ok(format($$ select public.add_lead_activity(%L, 'call', 'Called') $$, pg_temp.id('lead1')),
  'invalid_activity', 'a call needs an outcome');
select throws_ok(format($$ select public.add_lead_activity(%L, 'status_change') $$, pg_temp.id('lead1')),
  'invalid_activity', 'status changes can''t be added by hand');
select lives_ok(format($$ select public.add_lead_activity(%L, 'call', 'No answer twice', 'no_answer') $$,
  pg_temp.id('lead1')), 'a call with its outcome');
select pg_temp.put('task_old', public.add_lead_activity(pg_temp.id('lead1'), 'task', 'Call back',
  p_due_at => now() - interval '1 hour')::text);
select pg_temp.put('task_new', public.add_lead_activity(pg_temp.id('lead1'), 'task', 'Send prices',
  p_due_at => now() + interval '3 days')::text);
select is((select next_follow_up_at from public.leads where id = pg_temp.id('lead1')),
  (select due_at from public.lead_activities where id = pg_temp.id('task_old')), 'next follow-up = earliest open task');
select is((select string_agg(body || ':' || is_overdue, ' ') from public.my_follow_ups(pg_temp.id('center_a'))),
  'Call back:true', 'my follow-ups: the overdue task, not the one in 3 days');
select pg_temp.login(pg_temp.id('owner_a'));
select is((select count(*)::int from public.my_follow_ups(pg_temp.id('center_a'))), 0,
  'other people''s tasks aren''t in my follow-ups');
select pg_temp.login(pg_temp.id('adm'));
select lives_ok(format($$ select public.complete_lead_task(%L) $$, pg_temp.id('task_old')), 'the task is done');
select is((select next_follow_up_at from public.leads where id = pg_temp.id('lead1')),
  (select due_at from public.lead_activities where id = pg_temp.id('task_new')), 'the next open task takes over');
select is((select count(*)::int from public.my_follow_ups(pg_temp.id('center_a'))), 0, 'done tasks leave the widget');
select throws_ok(
  format($$ select public.add_lead_activity(%L, 'task', 'X', p_due_at => now(), p_assigned_membership_id => %L) $$,
         pg_temp.id('lead1'), pg_temp.id('m_t1')),
  'invalid_assignee', 'tasks go to owners and admins only'
);

-- ---------------------------------------------------------------------------
-- Duplicates
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(kind || ':' || full_name, ' ') from public.lead_duplicates(pg_temp.id('center_a'), '+998930000011')),
  'student:Ali Valiyev', 'a student''s phone is a duplicate'
);
select is(
  (select string_agg(kind || ':' || full_name, ' ') from public.lead_duplicates(pg_temp.id('center_a'), '+998930000019')),
  'guardian:Bobur Karimov', 'a guardian''s phone points at their student'
);
select is(
  (select string_agg(kind || ':' || full_name, ' ') from public.lead_duplicates(pg_temp.id('center_a'), '+998930000031')),
  'lead:Dilnoza Rahimova', 'another lead with the phone'
);
select is(
  (select count(*)::int from public.lead_duplicates(pg_temp.id('center_a'), '+998930000031', pg_temp.id('lead1'))),
  0, 'the lead being edited isn''t its own duplicate'
);
select pg_temp.login(pg_temp.id('adm_a2'));
select is((select count(*)::int from public.lead_duplicates(pg_temp.id('center_a'), '+998930000011')), 0,
  'duplicates are looked up in the caller''s branches only');

-- ---------------------------------------------------------------------------
-- Trials
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm'));
select throws_ok(format($$ select public.schedule_trial(%L, %L) $$, pg_temp.id('lead1'), pg_temp.id('l_past')),
  'lesson_not_upcoming', 'a trial goes on an upcoming lesson');
select pg_temp.put('trial1', public.schedule_trial(pg_temp.id('lead1'), pg_temp.id('l_now'))::text);
select is(pg_temp.status('lead1'), 'trial_scheduled', 'scheduling a trial moves the lead');
select pg_temp.put('trial_x', public.schedule_trial(pg_temp.id('lead1'), pg_temp.id('l_f3'))::text);
select is(
  (select string_agg(lesson_id::text || ':' || status, ' ') from public.lead_trials
   where lead_id = pg_temp.id('lead1') and status = 'scheduled'),
  pg_temp.id('l_f3')::text || ':scheduled', 'rescheduling keeps one open trial'
);
select pg_temp.put('trial1', public.schedule_trial(pg_temp.id('lead1'), pg_temp.id('l_now'))::text);
select is((select count(*)::int from public.lead_trials where lead_id = pg_temp.id('lead1') and status = 'scheduled'), 1,
  '… and back again');
select pg_temp.as_admin();
select throws_ok(
  format($$ insert into public.lead_trials (center_id, lead_id, lesson_id) values (%L, %L, %L) $$,
         pg_temp.id('center_a'), pg_temp.id('lead1'), pg_temp.id('l_f2')),
  '23505', null, 'the database allows one open trial per lead'
);

-- The trial lesson starts now; the teacher marks it.
update public.lessons set starts_at = now() - interval '10 minutes', ends_at = now() + interval '80 minutes',
  local_date = pg_temp.d('today') where id = pg_temp.id('l_now');
select pg_temp.login(pg_temp.id('t1'));
select is(
  (select string_agg(full_name || ':' || (lead_trial_id is not null) || ':' || is_expected, ' | ')
   from public.attendance_sheet(pg_temp.id('l_now'))),
  'Ali Valiyev:false:true | Dilnoza Rahimova:true:true', 'the guest is on the sheet after the students'
);
select is((select count(*)::int from public.lead_trials), 0, 'teachers can''t read lead_trials');
select lives_ok(
  format($$ select public.save_attendance(%L, %L::jsonb) $$, pg_temp.id('l_now'),
         jsonb_build_array(jsonb_build_object('studentId', pg_temp.id('ali'), 'status', 'present'),
                           jsonb_build_object('leadTrialId', pg_temp.id('trial1'), 'status', 'present'))),
  'the teacher marks the student and the guest present'
);
select pg_temp.as_admin();
select is((select status::text from public.lead_trials where id = pg_temp.id('trial1')), 'attended',
  'present → trial attended');
select is(pg_temp.status('lead1'), 'trial_done', 'present → the lead moves to trial_done');
select pg_temp.login(pg_temp.id('t1'));
select is(
  (select expected || '/' || marked || '/' || present from public.lesson_attendance_stats(array[pg_temp.id('l_now')])),
  '1/1/1', 'lesson stats leave the guest out'
);
select lives_ok(
  format($$ select public.save_attendance(%L, %L::jsonb) $$, pg_temp.id('l_now'),
         jsonb_build_array(jsonb_build_object('leadTrialId', pg_temp.id('trial1'), 'status', 'absent'))),
  'the teacher corrects the guest to absent'
);
select pg_temp.as_admin();
select is((select status::text from public.lead_trials where id = pg_temp.id('trial1')), 'no_show', 'absent → no_show');
select is(pg_temp.status('lead1'), 'trial_scheduled', 'the lead goes back to trial_scheduled');
select is(
  (select count(*)::int from public.notification_outbox where dedupe_key like '%' || pg_temp.id('trial1')::text || '%'),
  0, 'a guest never gets an absence alert'
);
select pg_temp.login(pg_temp.id('t1'));
select lives_ok(format($$ select public.save_trial_feedback(%L, 'Level B1, recommend G1') $$, pg_temp.id('trial1')),
  'the teacher leaves feedback');
select is((select trial_feedback from public.attendance_sheet(pg_temp.id('l_now')) where lead_trial_id is not null),
  'Level B1, recommend G1', 'the sheet shows it');
select throws_ok(
  format($$ select public.save_attendance(%L, %L::jsonb) $$, pg_temp.id('l_now'),
         jsonb_build_array(jsonb_build_object('leadTrialId', gen_random_uuid(), 'status', 'present'))),
  'student_not_expected', 'an unknown guest can''t be marked'
);
select pg_temp.login(pg_temp.id('owner_a'));
select is(
  (select count(*)::int from public.attendance_matrix(pg_temp.id('g1'), pg_temp.d('today'), pg_temp.d('today'))
   where full_name = 'Dilnoza Rahimova'),
  0, 'the matrix leaves guests out'
);

-- A cancelled lesson cancels its trials.
select pg_temp.login(pg_temp.id('adm'));
select pg_temp.put('lead2', pg_temp.lead('Jasur Aliyev', '+998930000019'));
select pg_temp.put('trial2', public.schedule_trial(pg_temp.id('lead2'), pg_temp.id('l_f2'))::text);
select pg_temp.as_admin();
update public.lessons set status = 'cancelled' where id = pg_temp.id('l_f2');
select is((select status::text from public.lead_trials where id = pg_temp.id('trial2')), 'cancelled',
  'cancelling the lesson cancels the trial');
select is(pg_temp.status('lead2'), 'contacted', 'the lead goes back to contacted');
select pg_temp.login(pg_temp.id('t1'));
select is((select count(*)::int from public.attendance_sheet(pg_temp.id('l_f2'))), 1,
  'a cancelled guest leaves the sheet');

-- ---------------------------------------------------------------------------
-- Convert
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('adm_no'));
select throws_ok(format($$ select public.convert_lead(%L, %L) $$, pg_temp.id('lead2'), pg_temp.id('g1')), '42501', null,
  'convert needs the leads flag');
select pg_temp.login(pg_temp.id('adm'));
select pg_temp.put('students_before', (select count(*)::text from public.students where center_id = pg_temp.id('center_a')));
select throws_ok(
  format($$ select public.convert_lead(%L, %L, %L, p_guardian_name => 'Father', p_guardian_phone => '+998930000077',
                                       p_student_id => %L) $$,
         pg_temp.id('lead2'), pg_temp.id('g1'), pg_temp.d('today'), pg_temp.id('ali')),
  'enrollment_exists', 'converting into a group the student is already in fails'
);
select is((select count(*)::text from public.students where center_id = pg_temp.id('center_a')), current_setting('t.students_before'),
  '… and rolls back: no student');
select is((select count(*)::int from public.guardians where phone = '+998930000077' and center_id = pg_temp.id('center_a')), 0, '… no guardian');
select is(pg_temp.status('lead2'), 'contacted', '… and the lead is unchanged');

select pg_temp.put('converted', public.convert_lead(pg_temp.id('lead2'), pg_temp.id('g1'), pg_temp.d('today'),
  p_guardian_name => 'Mother', p_guardian_phone => '+998930000019')::text);
select pg_temp.put('new_student', (current_setting('t.converted')::jsonb ->> 'studentId'));
select is((current_setting('t.converted')::jsonb ->> 'linkedExistingGuardian'), 'true',
  'the guardian is re-used by phone');
select is((select full_name from public.students where id = pg_temp.id('new_student')), 'Jasur Aliyev',
  'the student is prefilled from the lead');
select is(
  (select count(*)::int from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
   where g.phone = '+998930000019' and g.center_id = pg_temp.id('center_a')),
  2, 'siblings share the guardian'
);
select is((select count(*)::int from public.enrollments where student_id = pg_temp.id('new_student')
           and group_id = pg_temp.id('g1')), 1, 'the student is enrolled');
select pg_temp.as_admin();
select ok((select count(*) from public.charges c join public.enrollments e on e.id = c.enrollment_id
           where e.student_id = pg_temp.id('new_student')) >= 1, 'the first cycle charge is created');
select is(pg_temp.status('lead2'), 'won', 'the lead is won');
select is((select converted_student_id from public.leads where id = pg_temp.id('lead2')), pg_temp.id('new_student'),
  '… with the student');
select pg_temp.login(pg_temp.id('adm'));
select throws_ok(format($$ select public.convert_lead(%L, %L) $$, pg_temp.id('lead2'), pg_temp.id('g1')), 'lead_closed',
  'a won lead can''t be converted again');
select throws_ok(format($$ select public.move_lead(%L, 'new') $$, pg_temp.id('lead2')), 'invalid_lead_move',
  'won is final');

-- ---------------------------------------------------------------------------
-- Merge
-- ---------------------------------------------------------------------------
select pg_temp.put('lead3', pg_temp.lead('Kamola', '+998930000041'));
select pg_temp.put('lead4', pg_temp.lead('Kamola Y.'));
select public.add_lead_activity(pg_temp.id('lead4'), 'task', 'Call', p_due_at => now() + interval '1 day');
select throws_ok(format($$ select public.merge_leads(%L, %L) $$, pg_temp.id('lead3'), pg_temp.id('lead3')),
  'merge_same_lead', 'a lead can''t be merged into itself');
select throws_ok(format($$ select public.merge_leads(%L, %L) $$, pg_temp.id('lead2'), pg_temp.id('lead3')),
  'lead_closed', 'a won lead can''t be merged away');
select lives_ok(format($$ select public.merge_leads(%L, %L) $$, pg_temp.id('lead4'), pg_temp.id('lead3')),
  'merge Kamola Y. into Kamola');
select ok((select archived_at is not null from public.leads where id = pg_temp.id('lead4')), 'the source is archived');
select is((select count(*)::int from public.lead_activities where lead_id = pg_temp.id('lead4')), 0,
  'its timeline moved');
select ok((select next_follow_up_at is not null from public.leads where id = pg_temp.id('lead3')),
  'the moved task sets the target''s follow-up');
select throws_ok(format($$ select public.move_lead(%L, 'contacted') $$, pg_temp.id('lead4')), 'lead_archived',
  'an archived lead can''t move');

select * from finish();
rollback;
