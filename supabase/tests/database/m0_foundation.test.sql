-- M0 · Foundation: RLS, invariants and RPCs. Run with `pnpm db:test`.
-- Each check asserts what a role CAN'T do as well as what it can (04-rules §1).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers (pg_temp: they disappear with the session)
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

-- Number of rows a statement changed (as the current role, so RLS applies).
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

-- Remember ids between steps.
create function pg_temp.put(k text, v text) returns void language sql as $$ select set_config('t.' || k, v, true); $$;
create function pg_temp.get(k text) returns text language sql as $$ select current_setting('t.' || k); $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select current_setting('t.' || k)::uuid; $$;

-- ---------------------------------------------------------------------------
-- Every public table has RLS enabled
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has RLS enabled'
);

-- ---------------------------------------------------------------------------
-- Fixtures: two centers, staff in center A, an outsider
-- ---------------------------------------------------------------------------
select pg_temp.put('owner_a', pg_temp.new_user('+998900000001', 'Owner A')::text);
select pg_temp.put('owner_b', pg_temp.new_user('+998900000002', 'Owner B')::text);
select pg_temp.put('admin_a', pg_temp.new_user('+998900000003', 'Admin A')::text);
select pg_temp.put('teacher_a', pg_temp.new_user('+998900000004', 'Teacher A')::text);
select pg_temp.put('outsider', pg_temp.new_user('+998900000005', 'Outsider')::text);

select is(
  (select phone from public.profiles where id = pg_temp.id('owner_a')),
  '+998900000001',
  'signing up creates a profile with the E.164 phone'
);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('center_a', public.create_center('Center A', 'Asia/Tashkent', 'uz', 'Chilonzor')::text);
select pg_temp.put('branch_a1', (select id from public.branches where center_id = pg_temp.id('center_a'))::text);
select lives_ok(
  $$ insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Yunusobod', 'Asia/Tashkent') $$,
  'owner can add a branch'
);
select pg_temp.put('branch_a2', (select id from public.branches where center_id = pg_temp.id('center_a') and name = 'Yunusobod')::text);
insert into public.rooms (center_id, branch_id, name, capacity) values (pg_temp.id('center_a'), pg_temp.id('branch_a1'), 'Room 1', 12);

select pg_temp.put('admin_token', public.create_invite(
  pg_temp.id('center_a'), 'admin', 'Admin A', '+998900000003',
  array[pg_temp.id('branch_a1')], array['students', 'staff', 'settings']));
select pg_temp.put('teacher_token', public.create_invite(
  pg_temp.id('center_a'), 'teacher', 'Teacher A', '+998900000004', array[pg_temp.id('branch_a1')]));

select pg_temp.login(pg_temp.id('owner_b'));
select pg_temp.put('center_b', public.create_center('Center B', 'Asia/Tashkent', 'ru', 'Main')::text);

-- ---------------------------------------------------------------------------
-- create_center
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.memberships where center_id = pg_temp.id('center_a') and role = 'owner' and status = 'active'),
  1, 'create_center makes the caller the active owner'
);
select is(
  (select status::text from public.centers where id = pg_temp.id('center_a')), 'trial',
  'a new center starts in trial'
);
select ok(
  (select trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'
   from public.centers where id = pg_temp.id('center_a')),
  'trial lasts 14 days'
);

select pg_temp.login(pg_temp.id('outsider'));
select throws_ok(
  $$ select public.create_center('Broken', 'Mars/Olympus', 'uz', 'Main') $$,
  '23514', null, 'create_center rejects an invalid timezone'
);
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.centers where name = 'Broken'), 0,
  'a failed create_center leaves no center behind'
);
select is(
  (select count(*)::int from public.memberships where profile_id = pg_temp.id('outsider')), 0,
  'a failed create_center leaves no membership behind'
);

select pg_temp.login(null);
select throws_ok(
  $$ select public.create_center('Anon', 'Asia/Tashkent', 'uz', 'Main') $$,
  '42501', 'not_authenticated', 'create_center needs a signed-in user'
);

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('outsider'));
select results_eq(
  $$ select center_name, role::text, is_expired from public.get_invite(pg_temp.get('teacher_token')) $$,
  $$ values ('Center A'::text, 'teacher'::text, false) $$,
  'get_invite shows the center and role'
);
select throws_ok(
  $$ select public.accept_invite(pg_temp.get('teacher_token')) $$,
  'P0001', 'invite_phone_mismatch', 'an invite only works for the invited phone'
);

select pg_temp.login(pg_temp.id('admin_a'));
select is(public.accept_invite(pg_temp.get('admin_token')), pg_temp.id('center_a'), 'the invited admin can accept');
select throws_ok(
  $$ select public.accept_invite(pg_temp.get('admin_token')) $$,
  'P0001', 'invite_invalid', 'an invite link works only once'
);

select pg_temp.as_admin();
update public.memberships set invite_expires_at = now() - interval '1 minute'
where invite_token_hash = encode(extensions.digest(pg_temp.get('teacher_token'), 'sha256'), 'hex');
select pg_temp.login(pg_temp.id('teacher_a'));
select throws_ok(
  $$ select public.accept_invite(pg_temp.get('teacher_token')) $$,
  'P0001', 'invite_expired', 'an expired invite is rejected'
);

select pg_temp.login(pg_temp.id('owner_a'));
select pg_temp.put('teacher_token', public.regenerate_invite(
  (select id from public.memberships where center_id = pg_temp.id('center_a') and invited_phone = '+998900000004')));
select pg_temp.login(pg_temp.id('teacher_a'));
select is(public.accept_invite(pg_temp.get('teacher_token')), pg_temp.id('center_a'), 'a regenerated invite works');

select pg_temp.as_admin();
select results_eq(
  $$ select role::text, status::text from public.memberships where profile_id = pg_temp.id('teacher_a') $$,
  $$ values ('teacher'::text, 'active'::text) $$,
  'the accepting user gets exactly the invited role'
);

select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'teacher', 'Again', '+998900000004') $$,
  'P0001', 'already_member', 'cannot invite someone who is already a member'
);
select lives_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'teacher', 'Pending', '+998900000011', array[pg_temp.id('branch_a1')]) $$,
  'owner can invite a teacher'
);
select throws_ok(
  $$ update public.memberships set status = 'active' where invited_phone = '+998900000011' $$,
  '42501', 'use_accept_invite', 'a pending invite cannot be activated directly'
);

-- ---------------------------------------------------------------------------
-- Center isolation: center B's owner sees and changes nothing in center A
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_b'));
select is_empty($$ select 1 from public.centers where id = pg_temp.id('center_a') $$, 'other center: centers hidden');
select is_empty($$ select 1 from public.branches where center_id = pg_temp.id('center_a') $$, 'other center: branches hidden');
select is_empty($$ select 1 from public.rooms where center_id = pg_temp.id('center_a') $$, 'other center: rooms hidden');
select is_empty($$ select 1 from public.memberships where center_id = pg_temp.id('center_a') $$, 'other center: memberships hidden');
select is_empty($$ select 1 from public.audit_log where center_id = pg_temp.id('center_a') $$, 'other center: audit log hidden');
select is_empty($$ select 1 from public.profiles where id = pg_temp.id('owner_a') $$, 'other people''s profiles hidden');

select is(
  pg_temp.affected($$ update public.centers set name = 'hacked' where id = pg_temp.id('center_a') $$),
  0, 'other center: cannot rename the center'
);
select is(
  pg_temp.affected($$ update public.branches set name = 'hacked' where center_id = pg_temp.id('center_a') $$),
  0, 'other center: cannot edit branches'
);
select is(
  pg_temp.affected($$ update public.memberships set status = 'disabled' where center_id = pg_temp.id('center_a') $$),
  0, 'other center: cannot disable staff'
);
select throws_ok(
  $$ insert into public.branches (center_id, name, timezone) values (pg_temp.id('center_a'), 'Evil', 'Asia/Tashkent') $$,
  '42501', null, 'other center: cannot add a branch'
);
select throws_ok(
  $$ insert into public.rooms (center_id, branch_id, name) values (pg_temp.id('center_a'), pg_temp.id('branch_a1'), 'Evil') $$,
  '42501', null, 'other center: cannot add a room'
);
select throws_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'admin', 'Spy', '+998900000077') $$,
  '42501', 'forbidden', 'other center: cannot invite staff'
);
select throws_ok(
  $$ insert into public.rooms (center_id, branch_id, name) values (pg_temp.id('center_b'), pg_temp.id('branch_a1'), 'Cross') $$,
  '23503', null, 'a room cannot point at another center''s branch'
);

-- ---------------------------------------------------------------------------
-- Admin: branch-scoped, flags decide extra rights
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('admin_a'));
select isnt_empty($$ select 1 from public.centers where id = pg_temp.id('center_a') $$, 'admin sees their center');
select lives_ok(
  $$ insert into public.rooms (center_id, branch_id, name) values (pg_temp.id('center_a'), pg_temp.id('branch_a1'), 'Room 2') $$,
  'admin with settings can add a room in their branch'
);
select throws_ok(
  $$ insert into public.rooms (center_id, branch_id, name) values (pg_temp.id('center_a'), pg_temp.id('branch_a2'), 'Room X') $$,
  '42501', null, 'admin cannot add a room outside their branches'
);
select is(
  pg_temp.affected($$ update public.branches set name = 'Renamed' where center_id = pg_temp.id('center_a') $$),
  0, 'admin cannot edit branches (owner only)'
);
select is(
  pg_temp.affected($$ update public.centers set name = 'Renamed' where id = pg_temp.id('center_a') $$),
  0, 'admin cannot edit center settings'
);
select lives_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'teacher', 'Teacher 2', '+998900000006', array[pg_temp.id('branch_a1')]) $$,
  'admin with staff can invite a teacher to their branch'
);
select throws_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'teacher', 'Teacher 3', '+998900000007', array[pg_temp.id('branch_a2')]) $$,
  '42501', 'forbidden', 'admin cannot invite a teacher to another branch'
);
select throws_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'admin', 'Admin 2', '+998900000008', array[pg_temp.id('branch_a1')]) $$,
  '42501', 'forbidden', 'admin cannot invite another admin'
);
select is(
  pg_temp.affected($$ update public.memberships set role = 'owner' where profile_id = pg_temp.id('admin_a') $$),
  0, 'admin cannot promote themself'
);
select is_empty($$ select 1 from public.audit_log $$, 'admin cannot read the audit log');

-- ---------------------------------------------------------------------------
-- Teacher: own membership only, no settings writes
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('teacher_a'));
select is(
  (select count(*)::int from public.memberships), 1,
  'teacher sees only their own membership (no colleagues'' permissions)'
);
select is(
  pg_temp.affected($$ update public.centers set name = 'Renamed' where id = pg_temp.id('center_a') $$),
  0, 'teacher cannot edit center settings'
);
select throws_ok(
  $$ insert into public.rooms (center_id, branch_id, name) values (pg_temp.id('center_a'), pg_temp.id('branch_a1'), 'Room T') $$,
  '42501', null, 'teacher cannot add rooms'
);
select throws_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'teacher', 'Friend', '+998900000009') $$,
  '42501', 'forbidden', 'teacher cannot invite staff'
);
select is(
  pg_temp.affected($$ update public.memberships set permissions = array['billing'] where profile_id = pg_temp.id('teacher_a') $$),
  0, 'teacher cannot grant themself flags'
);

-- ---------------------------------------------------------------------------
-- Owner rules: own role, last owner, disabling members
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner_a'));
select throws_ok(
  $$ update public.memberships set role = 'admin' where profile_id = pg_temp.id('owner_a') $$,
  '42501', 'cannot_change_own_role', 'nobody can change their own role'
);
set constraints all immediate;
select throws_ok(
  $$ update public.memberships set status = 'disabled' where profile_id = pg_temp.id('owner_a') and center_id = pg_temp.id('center_a') $$,
  'P0001', 'last_owner', 'the last owner cannot be disabled'
);
set constraints all deferred;

select is(
  pg_temp.affected($$ update public.memberships set status = 'disabled' where profile_id = pg_temp.id('admin_a') $$),
  1, 'owner can disable an admin'
);
select pg_temp.login(pg_temp.id('admin_a'));
select is_empty($$ select 1 from public.centers where id = pg_temp.id('center_a') $$, 'a disabled member loses access to the center');
select is_empty($$ select 1 from public.branches where center_id = pg_temp.id('center_a') $$, 'a disabled member loses access to branches');
select throws_ok(
  $$ select public.create_invite(pg_temp.id('center_a'), 'teacher', 'Late', '+998900000010', array[pg_temp.id('branch_a1')]) $$,
  '42501', 'forbidden', 'a disabled member cannot invite'
);

-- ---------------------------------------------------------------------------
-- Profiles & audit log
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('teacher_a'));
select throws_ok(
  $$ update public.profiles set is_super_admin = true where id = pg_temp.id('teacher_a') $$,
  '42501', null, 'users cannot make themselves super-admin'
);
select is(
  pg_temp.affected($$ update public.profiles set full_name = 'Teacher Alpha' where id = pg_temp.id('teacher_a') $$),
  1, 'users can edit their own name'
);

select pg_temp.login(pg_temp.id('owner_a'));
select isnt_empty(
  $$ select 1 from public.audit_log where center_id = pg_temp.id('center_a') and table_name = 'memberships' and action = 'update' $$,
  'membership changes are audited and visible to the owner'
);
select is_empty(
  $$ select 1 from public.audit_log where after ? 'invite_token_hash' or before ? 'invite_token_hash' $$,
  'invite token hashes never reach the audit log'
);

select pg_temp.as_admin();
select throws_ok(
  $$ update public.audit_log set action = 'tampered' $$,
  'P0001', 'audit_log is append-only', 'audit_log rows cannot be changed'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  'P0001', 'audit_log is append-only', 'audit_log rows cannot be deleted'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select 1 from public.centers $$, '42501', null, 'anon cannot read centers');
select throws_ok($$ select 1 from public.memberships $$, '42501', null, 'anon cannot read memberships');
select lives_ok($$ select * from public.get_invite('not-a-token') $$, 'anon can look up an invite');

select * from finish();
rollback;
