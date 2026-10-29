-- M7f · username login (30-milestones M7f plan, 10 "Auth").
-- People log in with a login name + password. Supabase Auth keeps email + password underneath: the Auth email is
-- the hidden `{username}@login.uteach.invalid` (packages/core `loginEmail`). Accounts are created only by the
-- sign-up server action (service role); public Auth sign-ups are off in config.toml.
-- The phone stays on the profile as contact information, no longer unique and no longer verified.

-- ---------------------------------------------------------------------------
-- profiles.username, existing accounts get `u` + their phone digits
-- ---------------------------------------------------------------------------
alter table public.profiles add column username extensions.citext;

update public.profiles set username = 'u' || regexp_replace(phone, '\D', '', 'g');

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_key unique (username),
  add constraint profiles_username_check check (username::text ~ '^[a-z0-9][a-z0-9._]{2,31}$');

alter table public.profiles drop constraint profiles_phone_key;

-- The matching Auth email, so existing accounts can log in with their new login.
update auth.users u
set email = p.username::text || '@login.uteach.invalid',
    email_confirmed_at = coalesce(u.email_confirmed_at, now())
from public.profiles p
where p.id = u.id and u.email is null;

-- ---------------------------------------------------------------------------
-- New users: the login is the part of the hidden Auth email before `@login.uteach.invalid`, so the two can never
-- disagree. A phone account (tests, old rows) falls back to `u` + digits; any other account is refused.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := new.raw_user_meta_data ->> 'locale';
  v_username text := case when lower(new.email) like '%@login.uteach.invalid'
                          then split_part(lower(new.email), '@', 1) end;
  v_phone text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), '+' || new.phone);
begin
  if v_username is null and new.phone is not null then
    v_username := 'u' || regexp_replace(new.phone, '\D', '', 'g');
  end if;
  if v_username is null then
    raise exception 'username_required';
  end if;
  if v_phone is null then
    raise exception 'phone_required';
  end if;

  insert into public.profiles (id, full_name, phone, username, locale)
  values (
    new.id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_phone,
    v_username,
    case when v_locale in ('uz', 'ru', 'en') then v_locale else 'uz' end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites: the secret, single-use, 7-day link is the proof; phones are no longer compared.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.memberships;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_m
  from public.memberships
  where invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status = 'invited'
  for update;
  if not found then
    raise exception 'invite_invalid';
  end if;
  if v_m.invite_expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if exists (
    select 1 from public.memberships where center_id = v_m.center_id and profile_id = v_uid
  ) then
    raise exception 'already_member';
  end if;

  update public.memberships
  set profile_id = v_uid, status = 'active', invite_token_hash = null, invite_expires_at = null
  where id = v_m.id;

  return v_m.center_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Password resets without SMS: the owner for their staff, the super-admin for anyone (via /admin).
-- The same rules as the sign-up form (8–72 characters, a letter and a digit); old sessions end.
-- ---------------------------------------------------------------------------
create function private.set_password(p_uid uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_password is null or length(p_password) < 8 or length(p_password) > 72
     or p_password !~ '[a-zA-Z]' or p_password !~ '[0-9]' then
    raise exception 'password_weak';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = p_uid;
  if not found then
    raise exception 'not_found';
  end if;
  delete from auth.sessions where user_id = p_uid;
end;
$$;

revoke all on function private.set_password(uuid, text) from public;

-- Owner → an active or disabled member of their center (not themselves: they use "Change password").
create function public.set_member_password(p_membership_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.memberships;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_m from public.memberships where id = p_membership_id;
  if not found or v_m.profile_id is null
     or not private.is_owner(v_m.center_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_m.profile_id = v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.set_password(v_m.profile_id, p_password);
  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, row_id)
  values (v_m.center_id, v_uid, 'user', 'set_password', 'memberships', v_m.id);
end;
$$;

-- Super-admin → any account (owners who forgot theirs ask uteach). Called by /admin with the service role.
create function public.admin_set_password(p_actor uuid, p_profile_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  perform private.set_password(p_profile_id, p_password);
  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, row_id)
  values (null, p_actor, 'super_admin', 'set_password', 'profiles', p_profile_id);
end;
$$;

revoke all on function public.set_member_password(uuid, text) from public, anon;
grant execute on function public.set_member_password(uuid, text) to authenticated;
revoke all on function public.admin_set_password(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_password(uuid, uuid, text) to service_role;

-- Owners see their staff's logins on the Staff page (profiles stay readable only by their owner otherwise).
create function public.member_logins(p_center_id uuid)
returns table (membership_id uuid, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, p.username::text
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where m.center_id = p_center_id and private.is_owner(p_center_id);
$$;

revoke all on function public.member_logins(uuid) from public, anon;
grant execute on function public.member_logins(uuid) to authenticated;

-- /admin support view: the center's people with their logins, for "Set new password" (the open is already
-- audited as `support_view`).
create function public.admin_center_logins(p_actor uuid, p_center_id uuid)
returns table (profile_id uuid, name text, role public.membership_role, status public.membership_status,
               username text, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.act_as_super_admin(p_actor);
  return query
    select m.profile_id, m.display_name, m.role, m.status, p.username::text, u.last_sign_in_at
    from public.memberships m
    left join public.profiles p on p.id = m.profile_id
    left join auth.users u on u.id = m.profile_id
    where m.center_id = p_center_id
    order by m.role, m.display_name;
end;
$$;

revoke all on function public.admin_center_logins(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_center_logins(uuid, uuid) to service_role;
