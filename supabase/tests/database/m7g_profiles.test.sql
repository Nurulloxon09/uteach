-- M7g · staff profile and my profile: memberships.phone (default, who may change it) and your own profile phone.
-- Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function pg_temp.new_user(p_login text, p_name text, p_phone text)
returns uuid
language sql
as $$
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data,
                          created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_login || '@login.uteach.invalid', now(),
          jsonb_build_object('full_name', p_name, 'phone', p_phone), now(), now())
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

create function pg_temp.affected(p_sql text)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function pg_temp.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, true); $$;
create function pg_temp.get(k text) returns text language sql as $$ select current_setting('t.' || k); $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid; $$;

create function pg_temp.member(p_center text, p_profile text)
returns uuid
language sql
as $$
  select id from public.memberships where center_id = pg_temp.id(p_center) and profile_id = pg_temp.id(p_profile);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: center A (owner, admin with `staff` on branch 1, teachers on branches 1 and 2), center B
-- ---------------------------------------------------------------------------
select pg_temp.put('owner', pg_temp.new_user('g.owner', 'Owner', '+998901230001')::text);
select pg_temp.put('admin', pg_temp.new_user('g.admin', 'Admin', '+998901230002')::text);
select pg_temp.put('teacher1', pg_temp.new_user('g.teacher1', 'Teacher One', '+998901230003')::text);
select pg_temp.put('teacher2', pg_temp.new_user('g.teacher2', 'Teacher Two', '+998901230004')::text);
select pg_temp.put('owner_b', pg_temp.new_user('g.ownerb', 'Owner B', '+998901230005')::text);

select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('center', public.create_center('Profiles A', 'Asia/Tashkent', 'uz', 'One')::text);
select pg_temp.put('b1', (select id from public.branches where center_id = pg_temp.id('center'))::text);
insert into public.branches (center_id, name, timezone) values (pg_temp.id('center'), 'Two', 'Asia/Tashkent');
select pg_temp.put('b2', (select id from public.branches where center_id = pg_temp.id('center') and name = 'Two')::text);
select pg_temp.put('admin_token', public.create_invite(
  pg_temp.id('center'), 'admin', 'Admin', '+998907770002', array[pg_temp.id('b1')], array['staff']));
select pg_temp.put('t1_token', public.create_invite(
  pg_temp.id('center'), 'teacher', 'Teacher One', '+998907770003', array[pg_temp.id('b1')]));
select pg_temp.put('t2_token', public.create_invite(
  pg_temp.id('center'), 'teacher', 'Teacher Two', '+998907770004', array[pg_temp.id('b2')]));
select pg_temp.login(pg_temp.id('admin'));
select public.accept_invite(pg_temp.get('admin_token'));
select pg_temp.login(pg_temp.id('teacher1'));
select public.accept_invite(pg_temp.get('t1_token'));
select pg_temp.login(pg_temp.id('teacher2'));
select public.accept_invite(pg_temp.get('t2_token'));
select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Profiles B', 'Asia/Tashkent', 'uz', 'Main')::text);

select pg_temp.as_admin();
select pg_temp.put('m_owner', pg_temp.member('center', 'owner')::text);
select pg_temp.put('m_t1', pg_temp.member('center', 'teacher1')::text);
select pg_temp.put('m_t2', pg_temp.member('center', 'teacher2')::text);

-- ---------------------------------------------------------------------------
-- The phone a membership starts with
-- ---------------------------------------------------------------------------
select is(
  (select phone from public.memberships where id = pg_temp.id('m_owner')), '+998901230001',
  'the owner''s membership takes the phone from their profile'
);
select is(
  (select phone from public.memberships where id = pg_temp.id('m_t1')), '+998907770003',
  'an invited member keeps the phone they were invited with'
);
select is_empty(
  $$ select 1 from public.memberships where phone is null $$,
  'every membership has a contact phone'
);

-- ---------------------------------------------------------------------------
-- Who may change a staff member's phone
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner'));
select is(
  pg_temp.affected(format($$ update public.memberships set phone = '+998935550001' where id = %L $$, pg_temp.id('m_t2'))),
  1, 'the owner changes any member''s phone'
);
select throws_ok(
  format($$ update public.memberships set phone = '12345' where id = %L $$, pg_temp.id('m_t2')),
  '23514', null, 'the phone must be a full international number'
);

select pg_temp.login(pg_temp.id('admin'));
select is(
  pg_temp.affected(format($$ update public.memberships set phone = '+998935550002' where id = %L $$, pg_temp.id('m_t1'))),
  1, 'an admin with `staff` changes a teacher''s phone in their branch'
);
select is(
  pg_temp.affected(format($$ update public.memberships set phone = '+998935550003' where id = %L $$, pg_temp.id('m_t2'))),
  0, '... but not a teacher in another branch'
);
select is(
  pg_temp.affected(format($$ update public.memberships set phone = '+998935550004' where id = %L $$, pg_temp.id('m_owner'))),
  0, '... and not the owner'
);

select pg_temp.login(pg_temp.id('teacher1'));
select is(
  pg_temp.affected(format($$ update public.memberships set phone = '+998935550005' where id = %L $$, pg_temp.id('m_t1'))),
  0, 'a teacher can''t change the center''s record of their phone'
);

select pg_temp.login(pg_temp.id('owner_b'));
select is(
  pg_temp.affected(format($$ update public.memberships set phone = '+998935550006' where id = %L $$, pg_temp.id('m_t1'))),
  0, 'the owner of another center can''t'
);

select pg_temp.as_admin();
select results_eq(
  $$ select phone from public.memberships where id in (pg_temp.id('m_t1'), pg_temp.id('m_t2'), pg_temp.id('m_owner'))
     order by phone $$,
  $$ values ('+998901230001'::text), ('+998935550001'::text), ('+998935550002'::text) $$,
  'only the allowed changes were saved'
);

-- ---------------------------------------------------------------------------
-- My profile: your own phone, nobody else's
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('teacher1'));
select is(
  pg_temp.affected(format($$ update public.profiles set phone = '+998946660001', full_name = 'Teacher Uno' where id = %L $$,
                          pg_temp.id('teacher1'))),
  1, 'you change your own name and phone'
);
select is(
  pg_temp.affected(format($$ update public.profiles set phone = '+998946660002' where id = %L $$, pg_temp.id('teacher2'))),
  0, 'you can''t change someone else''s profile'
);
select throws_ok(
  format($$ update public.profiles set username = 'hacker' where id = %L $$, pg_temp.id('teacher1')),
  '42501', null, 'you can''t change your login'
);
select throws_ok(
  format($$ update public.profiles set is_super_admin = true where id = %L $$, pg_temp.id('teacher1')),
  '42501', null, 'you can''t make yourself a super-admin'
);

select pg_temp.as_admin();
select is(
  (select full_name || ' ' || phone from public.profiles where id = pg_temp.id('teacher1')),
  'Teacher Uno +998946660001', 'the profile change is saved'
);

select * from finish();
rollback;
