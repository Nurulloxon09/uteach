-- M7f · username login: logins from the hidden Auth email, phones as contact only, invites proven by the link,
-- password resets by the owner and the super-admin. Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- What the sign-up server action does: an email account, the phone and name in user_metadata.
create function pg_temp.new_login(p_email text, p_name text, p_phone text, p_meta jsonb default '{}')
returns uuid
language sql
as $$
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
                          raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, now(), extensions.crypt('old-pass-1', extensions.gen_salt('bf', 10)),
          jsonb_build_object('full_name', p_name, 'phone', p_phone) || p_meta, '{}'::jsonb, now(), now())
  returning id;
$$;

-- An old phone account (before M7f, and every other test file).
create function pg_temp.new_phone_user(p_phone text, p_name text)
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

create function pg_temp.password_is(p_uid uuid, p_password text)
returns boolean
language sql
as $$
  select encrypted_password = extensions.crypt(p_password, encrypted_password) from auth.users where id = p_uid;
$$;

-- ---------------------------------------------------------------------------
-- Logins
-- ---------------------------------------------------------------------------
select pg_temp.put('owner', pg_temp.new_login('dilnoza.k@login.uteach.invalid', 'Dilnoza K', '+998901110001')::text);
select is(
  (select username::text || ' ' || phone || ' ' || full_name from public.profiles where id = pg_temp.id('owner')),
  'dilnoza.k +998901110001 Dilnoza K',
  'the login is the part of the hidden email before the domain; the phone comes from the sign-up form'
);

select pg_temp.put('teacher', pg_temp.new_login('Aziz_T@LOGIN.uteach.invalid', 'Aziz T', '+998901110002',
                                                '{"username": "dilnoza.k"}')::text);
select is(
  (select username::text from public.profiles where id = pg_temp.id('teacher')), 'aziz_t',
  'logins are stored lower-case, and a username in user_metadata is ignored'
);

select throws_ok(
  $$ select pg_temp.new_login('DILNOZA.K@login.uteach.invalid', 'Copy', '+998901110003') $$,
  '23505', null, 'logins are unique, whatever the case'
);
select throws_ok(
  $$ select pg_temp.new_login('someone@gmail.com', 'Someone', '+998901110004') $$,
  'P0001', 'username_required', 'an account without a login address is refused'
);
select throws_ok(
  $$ select pg_temp.new_login('ab@login.uteach.invalid', 'Too Short', '+998901110005') $$,
  '23514', null, 'a login breaking the rules is refused (3–32 characters)'
);

select pg_temp.put('same_phone', pg_temp.new_login('aziz.copy@login.uteach.invalid', 'Same Phone', '+998901110002')::text);
select is(
  (select count(*)::int from public.profiles where phone = '+998901110002'), 2,
  'phones are contact only now: two accounts can share one'
);

select pg_temp.put('old', pg_temp.new_phone_user('+998901110009', 'Old Account')::text);
select is(
  (select username::text from public.profiles where id = pg_temp.id('old')), 'u998901110009',
  'a phone account without a login gets u + its digits (as the migration gave existing accounts)'
);
select is_empty(
  $$ select 1 from auth.users u join public.profiles p on p.id = u.id
     where u.email is not null and u.email <> p.username::text || '@login.uteach.invalid'
       and u.email like '%@login.uteach.invalid' $$,
  'every login address matches its profile login'
);

-- ---------------------------------------------------------------------------
-- Invites: the link is the proof, whatever the phone
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner'));
select pg_temp.put('center', public.create_center('Login Center', 'Asia/Tashkent', 'uz', 'Main')::text);
select pg_temp.put('branch', (select id from public.branches where center_id = pg_temp.id('center'))::text);
select pg_temp.put('token', public.create_invite(
  pg_temp.id('center'), 'teacher', 'Aziz T', '+998909999999', array[pg_temp.id('branch')]));

select pg_temp.login(pg_temp.id('teacher'));
select is(public.accept_invite(pg_temp.get('token')), pg_temp.id('center'),
          'an invite is accepted by whoever has the link, with another phone');
select throws_ok(
  $$ select public.accept_invite(pg_temp.get('token')) $$,
  'P0001', 'invite_invalid', 'the link still works only once'
);

select pg_temp.as_admin();
select pg_temp.put('membership', (select id from public.memberships
                                  where center_id = pg_temp.id('center') and profile_id = pg_temp.id('teacher'))::text);
select pg_temp.put('owner_membership', (select id from public.memberships
                                        where center_id = pg_temp.id('center') and profile_id = pg_temp.id('owner'))::text);

-- ---------------------------------------------------------------------------
-- Owners see their staff's logins
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner'));
select results_eq(
  $$ select username from public.member_logins(pg_temp.id('center')) order by username $$,
  $$ values ('aziz_t'::text), ('dilnoza.k'::text) $$,
  'the owner sees every member''s login'
);
select pg_temp.login(pg_temp.id('teacher'));
select is_empty(
  $$ select 1 from public.member_logins(pg_temp.id('center')) $$,
  'a teacher sees no logins'
);
select pg_temp.login(pg_temp.id('same_phone'));
select is_empty(
  $$ select 1 from public.member_logins(pg_temp.id('center')) $$,
  'someone from outside the center sees no logins'
);

-- ---------------------------------------------------------------------------
-- Owner sets a staff member's password
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), pg_temp.id('teacher'), now(), now());

select pg_temp.login(pg_temp.id('teacher'));
select throws_ok(
  $$ select public.set_member_password(pg_temp.id('owner_membership'), 'new-pass-1') $$,
  '42501', 'forbidden', 'a teacher can''t set the owner''s password'
);
select pg_temp.login(pg_temp.id('same_phone'));
select throws_ok(
  $$ select public.set_member_password(pg_temp.id('membership'), 'new-pass-1') $$,
  '42501', 'forbidden', 'someone from another center can''t set it'
);
select pg_temp.login(pg_temp.id('owner'));
select throws_ok(
  $$ select public.set_member_password(pg_temp.id('owner_membership'), 'new-pass-1') $$,
  '42501', 'forbidden', 'owners change their own password from the account menu instead'
);
select throws_ok(
  $$ select public.set_member_password(pg_temp.id('membership'), 'short1') $$,
  'P0001', 'password_weak', 'a short password is refused'
);
select throws_ok(
  $$ select public.set_member_password(pg_temp.id('membership'), 'onlyletters') $$,
  'P0001', 'password_weak', 'a password without digits is refused'
);
select lives_ok(
  $$ select public.set_member_password(pg_temp.id('membership'), 'new-pass-1') $$,
  'the owner sets a new password for the teacher'
);

select pg_temp.as_admin();
select ok(pg_temp.password_is(pg_temp.id('teacher'), 'new-pass-1'), 'the new password works (bcrypt, as Auth checks it)');
select ok(not pg_temp.password_is(pg_temp.id('teacher'), 'old-pass-1'), 'the old one doesn''t');
select is_empty(
  $$ select 1 from auth.sessions where user_id = pg_temp.id('teacher') $$,
  'the teacher''s old sessions end'
);
select is(
  (select count(*)::int from public.audit_log
   where action = 'set_password' and row_id = pg_temp.id('membership') and actor_profile_id = pg_temp.id('owner')),
  1, 'the reset is in the center''s audit log'
);

-- ---------------------------------------------------------------------------
-- Super-admin sets any password (service role only)
-- ---------------------------------------------------------------------------
select pg_temp.login(pg_temp.id('owner'));
select throws_ok(
  $$ select public.admin_set_password(pg_temp.id('owner'), pg_temp.id('teacher'), 'new-pass-2') $$,
  '42501', null, 'signed-in users can''t call the admin function'
);

select pg_temp.as_admin();
select set_config('role', 'service_role', true);
select throws_ok(
  $$ select public.admin_set_password(pg_temp.id('owner'), pg_temp.id('teacher'), 'new-pass-2') $$,
  '42501', 'forbidden', 'the actor must be a super-admin'
);
select pg_temp.as_admin();
update public.profiles set is_super_admin = true where id = pg_temp.id('old');
select set_config('role', 'service_role', true);
select lives_ok(
  $$ select public.admin_set_password(pg_temp.id('old'), pg_temp.id('owner'), 'owner-pass-9') $$,
  'the super-admin sets the owner''s new password'
);
select pg_temp.as_admin();
select ok(pg_temp.password_is(pg_temp.id('owner'), 'owner-pass-9'), 'the owner''s new password works');
select is(
  (select actor_kind from public.audit_log where action = 'set_password' and row_id = pg_temp.id('owner')),
  'super_admin', 'the reset is audited as the super-admin'
);

select * from finish();
rollback;
