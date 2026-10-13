-- M4c · staff screens: `student_overview.telegram_linked` and `notification_overview`. Run with `pnpm db:test`.
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

select pg_temp.put('owner', pg_temp.new_user('+998960000001', 'Owner')::text);
select pg_temp.put('stranger', pg_temp.new_user('+998960000002', 'Stranger')::text);
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('center', public.create_center('Screens Center', 'Asia/Tashkent', 'uz', 'Main')::text);
select pg_temp.as_admin();
insert into public.courses (center_id, name) values (pg_temp.id('center'), 'English');
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('group', public.create_group(
  (select id from public.branches where center_id = pg_temp.id('center')),
  (select id from public.courses where center_id = pg_temp.id('center') limit 1), 'G', current_date)::text);
select pg_temp.as_admin();
insert into public.students (center_id, branch_id, full_name, phone)
select pg_temp.id('center'), b.id, n, p
from public.branches b, (values ('Ali', '+998960000011'), ('Vali', null), ('Gani', null)) v (n, p)
where b.center_id = pg_temp.id('center');
select pg_temp.put('ali', (select id from public.students where full_name = 'Ali' and center_id = pg_temp.id('center'))::text);
select pg_temp.put('vali', (select id from public.students where full_name = 'Vali' and center_id = pg_temp.id('center'))::text);
select pg_temp.put('gani', (select id from public.students where full_name = 'Gani' and center_id = pg_temp.id('center'))::text);
insert into public.guardians (center_id, full_name, phone) values (pg_temp.id('center'), 'Mother', '+998960000019');
insert into public.student_guardians (center_id, student_id, guardian_id)
select pg_temp.id('center'), pg_temp.id('vali'), g.id from public.guardians g where g.phone = '+998960000019';
select pg_temp.login(pg_temp.id('owner'));
select public.enroll(s, pg_temp.id('group'), current_date)
from unnest(array[pg_temp.id('ali'), pg_temp.id('vali'), pg_temp.id('gani')]) s;
select pg_temp.as_admin();
select count(*) from worker.link_contact(8001, 8001, '+998960000011', 'uz');
select count(*) from worker.link_contact(8002, 8002, '+998960000019', 'ru');

select pg_temp.login(pg_temp.id('owner'));
select is(
  (select string_agg(full_name || ':' || telegram_linked, ' ' order by full_name) from public.student_overview
   where center_id = pg_temp.id('center')),
  'Ali:true Gani:false Vali:true', 'a student counts as linked through their own link or a guardian''s'
);
select is(public.notification_overview(pg_temp.id('center')),
  '{"activeStudents": 3, "reachedStudents": 2, "linkedStudents": 1, "linkedGuardians": 1, "linkedStaff": 0, "smsThisMonth": 0}'::jsonb,
  'the overview counts who the bot reaches');
select pg_temp.login(pg_temp.id('stranger'));
select throws_ok(format($$ select public.notification_overview(%L) $$, pg_temp.id('center')), '42501', null,
  'only the center''s staff admins read it');

select * from finish();
rollback;
