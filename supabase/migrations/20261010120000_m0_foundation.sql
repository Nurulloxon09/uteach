-- M0 · Foundation
-- Spec: docs/spec/02-data-model.md (Platform: profiles, centers, branches, rooms, memberships;
-- System: audit_log) and docs/spec/03-roles-permissions.md.
-- Only the columns M0 uses are created; later milestones add theirs in their own migrations.

-- ---------------------------------------------------------------------------
-- Extensions & schemas
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Helper functions live in `private`, which PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'admin', 'teacher');
create type public.membership_status as enum ('invited', 'active', 'disabled');
create type public.center_status as enum ('trial', 'active', 'past_due', 'read_only', 'cancelled');

-- ---------------------------------------------------------------------------
-- Generic helpers (no table access)
-- ---------------------------------------------------------------------------
create function private.is_valid_timezone(p_tz text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), 40), ''),
    'center'
  );
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  locale text not null default 'uz' check (locale in ('uz', 'ru', 'en')),
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- A profile is created for every new auth user (staff sign up with phone + password).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, full_name, phone, locale)
  values (
    new.id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    '+' || new.phone,
    case when v_locale in ('uz', 'ru', 'en') then v_locale else 'uz' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- centers
-- ---------------------------------------------------------------------------
create table public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug extensions.citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  country_code char(2) not null default 'UZ',
  currency char(3) not null default 'UZS',
  default_locale text not null default 'uz' check (default_locale in ('uz', 'ru', 'en')),
  timezone text not null default 'Asia/Tashkent' check (private.is_valid_timezone(timezone)),
  status public.center_status not null default 'trial',
  trial_ends_at timestamptz,
  settings jsonb not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger centers_updated_at before update on public.centers
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  name text not null check (length(trim(name)) between 1 and 120),
  address text,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  timezone text not null check (private.is_valid_timezone(timezone)),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of composite foreign keys, so children can't point at another center's branch.
  unique (center_id, id)
);

create unique index branches_name_live on public.branches (center_id, lower(name))
  where archived_at is null;

create trigger branches_updated_at before update on public.branches
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  capacity smallint check (capacity is null or capacity > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, branch_id) references public.branches (center_id, id)
);

create unique index rooms_name_live on public.rooms (branch_id, lower(name))
  where archived_at is null;

create trigger rooms_updated_at before update on public.rooms
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  profile_id uuid references public.profiles (id),
  role public.membership_role not null,
  status public.membership_status not null default 'invited',
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  invited_phone text check (invited_phone is null or invited_phone ~ '^\+[1-9][0-9]{6,14}$'),
  invite_token_hash text,
  invite_expires_at timestamptz,
  branch_ids uuid[] not null default '{}',
  permissions text[] not null default '{}' check (
    permissions <@ array[
      'students', 'leads', 'attendance', 'payments', 'billing', 'broadcasts', 'academics',
      'adjustments', 'discounts', 'void', 'refunds', 'import', 'staff', 'settings',
      'cash_closing', 'finance', 'payroll', 'analytics'
    ]::text[]
  ),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'invited' or profile_id is not null),
  check (status <> 'invited' or invited_phone is not null)
);

create unique index memberships_center_profile on public.memberships (center_id, profile_id)
  where profile_id is not null;
create unique index memberships_pending_phone on public.memberships (center_id, invited_phone)
  where status = 'invited';
create unique index memberships_invite_token on public.memberships (invite_token_hash)
  where invite_token_hash is not null;
create index memberships_profile on public.memberships (profile_id);

create trigger memberships_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();

-- branch_ids must all be branches of the same center.
create function private.check_membership_branches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.branch_ids) as b (id)
    where not exists (
      select 1 from public.branches br where br.id = b.id and br.center_id = new.center_id
    )
  ) then
    raise exception 'invalid_branch';
  end if;
  return new;
end;
$$;

create trigger memberships_check_branches before insert or update of branch_ids on public.memberships
  for each row execute function private.check_membership_branches();

-- ---------------------------------------------------------------------------
-- audit_log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  center_id uuid references public.centers (id),
  actor_profile_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'super_admin', 'system', 'provider')),
  action text not null,
  table_name text,
  row_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_center_at on public.audit_log (center_id, at desc);

create function private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_append_only();

-- Generic row audit: stores only the changed columns (never updated_at or invite tokens).
create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full jsonb := to_jsonb(coalesce(new, old));
  v_before jsonb;
  v_after jsonb;
  v_key text;
  v_uid uuid := auth.uid();
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - 'updated_at' - 'invite_token_hash';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - 'updated_at' - 'invite_token_hash';
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_after) loop
      if v_after -> v_key is not distinct from v_before -> v_key then
        v_after := v_after - v_key;
        v_before := v_before - v_key;
      end if;
    end loop;
    if v_after = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (center_id, actor_profile_id, actor_kind, action, table_name, row_id, before, after)
  values (
    case when tg_table_name = 'centers' then (v_full ->> 'id')::uuid else (v_full ->> 'center_id')::uuid end,
    v_uid,
    case when v_uid is null then 'system' else 'user' end,
    lower(tg_op),
    tg_table_name,
    (v_full ->> 'id')::uuid,
    v_before,
    v_after
  );
  return null;
end;
$$;

create trigger centers_audit after insert or update or delete on public.centers
  for each row execute function private.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- RLS helpers (03-roles-permissions.md). security definer so they can read
-- memberships without recursing into its own policies.
-- ---------------------------------------------------------------------------
create function private.is_member(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.center_id = p_center_id and m.profile_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create function private.is_owner(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.center_id = p_center_id and m.profile_id = (select auth.uid())
      and m.status = 'active' and m.role = 'owner'
  );
$$;

create function private.is_staff_admin(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.center_id = p_center_id and m.profile_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin')
  );
$$;

create function private.has_branch(p_center_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.center_id = p_center_id and m.profile_id = (select auth.uid()) and m.status = 'active'
      and (m.role = 'owner' or p_branch_id = any (m.branch_ids))
  );
$$;

create function private.has_perm(p_center_id uuid, p_flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.center_id = p_center_id and m.profile_id = (select auth.uid()) and m.status = 'active'
      and (m.role = 'owner' or (m.role = 'admin' and p_flag = any (m.permissions)))
  );
$$;

create function private.my_membership_id(p_center_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.memberships m
  where m.center_id = p_center_id and m.profile_id = (select auth.uid()) and m.status = 'active';
$$;

-- Branches in the caller's scope: all of the center's branches for owners.
create function private.my_branch_ids(p_center_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.role = 'owner' then
      coalesce((select array_agg(b.id) from public.branches b where b.center_id = p_center_id), '{}')
    else m.branch_ids
  end
  from public.memberships m
  where m.center_id = p_center_id and m.profile_id = (select auth.uid()) and m.status = 'active';
$$;

create function private.center_writable(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.centers c
    where c.id = p_center_id and c.status not in ('read_only', 'cancelled')
  );
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Membership invariants
-- ---------------------------------------------------------------------------
-- Users can't change their own role, and invites can only be activated through accept_invite().
create function private.guard_membership_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.profile_id = (select auth.uid()) and new.role <> old.role then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;
  if old.status = 'invited' and new.status = 'active' and current_user = 'authenticated' then
    raise exception 'use_accept_invite' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger memberships_guard before update on public.memberships
  for each row execute function private.guard_membership_update();

-- Every center keeps at least one active owner (checked at commit).
create function private.ensure_center_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.center_id = old.center_id and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'last_owner';
  end if;
  return null;
end;
$$;

create constraint trigger memberships_keep_owner
  after update or delete on public.memberships
  deferrable initially deferred
  for each row execute function private.ensure_center_has_owner();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.centers enable row level security;
alter table public.branches enable row level security;
alter table public.rooms enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

-- profiles: only your own row. Staff names come from memberships.display_name.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- centers: members read; owners edit. Created only through create_center().
create policy centers_select_member on public.centers
  for select to authenticated
  using (private.is_member(id));
create policy centers_update_owner on public.centers
  for update to authenticated
  using (private.is_owner(id) and private.center_writable(id))
  with check (private.is_owner(id) and private.center_writable(id));

-- branches: members read; owners write.
create policy branches_select_member on public.branches
  for select to authenticated
  using (private.is_member(center_id));
create policy branches_insert_owner on public.branches
  for insert to authenticated
  with check (private.is_owner(center_id) and private.center_writable(center_id));
create policy branches_update_owner on public.branches
  for update to authenticated
  using (private.is_owner(center_id) and private.center_writable(center_id))
  with check (private.is_owner(center_id) and private.center_writable(center_id));

-- rooms: members read; owner, or admin with `settings` in that branch, write.
create policy rooms_select_member on public.rooms
  for select to authenticated
  using (private.is_member(center_id));
create policy rooms_insert_settings on public.rooms
  for insert to authenticated
  with check (
    private.has_perm(center_id, 'settings')
    and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  );
create policy rooms_update_settings on public.rooms
  for update to authenticated
  using (
    private.has_perm(center_id, 'settings')
    and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  )
  with check (
    private.has_perm(center_id, 'settings')
    and private.has_branch(center_id, branch_id)
    and private.center_writable(center_id)
  );

-- memberships: owners and admins see the center's staff; everyone sees their own rows.
-- Owners manage everyone; admins with `staff` manage teachers inside their branches.
-- Inserts happen only through create_invite() / create_center().
create policy memberships_select on public.memberships
  for select to authenticated
  using (private.is_staff_admin(center_id) or profile_id = (select auth.uid()));
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    private.center_writable(center_id)
    and (
      private.is_owner(center_id)
      or (
        private.has_perm(center_id, 'staff')
        and role = 'teacher'
        and branch_ids <@ private.my_branch_ids(center_id)
      )
    )
  )
  with check (
    private.center_writable(center_id)
    and (
      private.is_owner(center_id)
      or (
        private.has_perm(center_id, 'staff')
        and role = 'teacher'
        and branch_ids <@ private.my_branch_ids(center_id)
      )
    )
  );

-- audit_log: owners read their center's log. Rows are written only by triggers.
create policy audit_log_select_owner on public.audit_log
  for select to authenticated
  using (private.is_owner(center_id));

-- ---------------------------------------------------------------------------
-- Table privileges: nothing for anon; column-scoped writes for authenticated.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.centers, public.branches, public.rooms,
  public.memberships, public.audit_log from anon, authenticated;

grant select on public.profiles, public.centers, public.branches, public.rooms,
  public.memberships, public.audit_log to authenticated;

grant update (full_name, locale) on public.profiles to authenticated;
grant update (name, default_locale, timezone, settings) on public.centers to authenticated;
grant insert (center_id, name, address, phone, timezone) on public.branches to authenticated;
grant update (name, address, phone, timezone, archived_at) on public.branches to authenticated;
grant insert (center_id, branch_id, name, capacity) on public.rooms to authenticated;
grant update (name, capacity, archived_at) on public.rooms to authenticated;
grant update (display_name, role, status, branch_ids, permissions, color) on public.memberships
  to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates a center, its owner membership and first branch in one transaction (10-platform).
create function public.create_center(
  p_name text,
  p_timezone text,
  p_locale text,
  p_branch_name text,
  p_branch_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_full_name text;
  v_center_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select p.full_name into v_full_name from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'profile_missing';
  end if;

  insert into public.centers (name, slug, default_locale, timezone, status, trial_ends_at)
  values (
    trim(p_name),
    private.slugify(p_name) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
    p_locale,
    p_timezone,
    'trial',
    now() + interval '14 days'
  )
  returning id into v_center_id;

  insert into public.memberships (center_id, profile_id, role, status, display_name)
  values (v_center_id, v_uid, 'owner', 'active', coalesce(nullif(trim(v_full_name), ''), 'Owner'));

  insert into public.branches (center_id, name, address, timezone)
  values (v_center_id, trim(p_branch_name), nullif(trim(p_branch_address), ''), p_timezone);

  return v_center_id;
end;
$$;

-- Can the caller invite / manage a membership with this role and these branches?
create function private.can_manage_membership(
  p_center_id uuid,
  p_role public.membership_role,
  p_branch_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner(p_center_id)
    or (
      p_role = 'teacher'
      and private.has_perm(p_center_id, 'staff')
      and coalesce(p_branch_ids, '{}') <@ coalesce(private.my_branch_ids(p_center_id), '{}')
    );
$$;

revoke all on function private.can_manage_membership(uuid, public.membership_role, uuid[]) from public;
grant execute on function private.can_manage_membership(uuid, public.membership_role, uuid[])
  to authenticated, service_role;

-- Invites a staff member by phone. Returns the raw one-time token; only its hash is stored.
create function public.create_invite(
  p_center_id uuid,
  p_role public.membership_role,
  p_display_name text,
  p_phone text,
  p_branch_ids uuid[] default '{}',
  p_permissions text[] default '{}',
  p_color text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not private.center_writable(p_center_id) then
    raise exception 'center_read_only' using errcode = '42501';
  end if;
  if not private.can_manage_membership(p_center_id, p_role, p_branch_ids) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.center_id = p_center_id and p.phone = p_phone
  ) then
    raise exception 'already_member';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.center_id = p_center_id and m.invited_phone = p_phone and m.status = 'invited'
  ) then
    raise exception 'already_invited';
  end if;

  insert into public.memberships (
    center_id, role, status, display_name, invited_phone, invite_token_hash, invite_expires_at,
    branch_ids, permissions, color
  )
  values (
    p_center_id, p_role, 'invited', trim(p_display_name), p_phone,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days',
    case when p_role = 'owner' then '{}' else coalesce(p_branch_ids, '{}') end,
    case when p_role = 'admin' then coalesce(p_permissions, '{}') else '{}' end,
    p_color
  );

  return v_token;
end;
$$;

-- Issues a fresh token for a pending invite (the old link stops working).
create function public.regenerate_invite(p_membership_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if not found or v_m.status <> 'invited' then
    raise exception 'invite_invalid';
  end if;
  if not private.center_writable(v_m.center_id)
     or not private.can_manage_membership(v_m.center_id, v_m.role, v_m.branch_ids) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.memberships
  set invite_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      invite_expires_at = now() + interval '7 days'
  where id = p_membership_id;

  return v_token;
end;
$$;

-- What the invite page shows before sign-in. The phone is masked.
create function public.get_invite(p_token text)
returns table (
  center_name text,
  role public.membership_role,
  display_name text,
  phone_hint text,
  is_expired boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.name,
    m.role,
    m.display_name,
    left(m.invited_phone, 4) || repeat('•', greatest(length(m.invited_phone) - 6, 0)) || right(m.invited_phone, 2),
    m.invite_expires_at < now()
  from public.memberships m
  join public.centers c on c.id = m.center_id
  where m.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and m.status = 'invited';
$$;

-- Accepts an invite for the signed-in user. The user's phone must be the invited phone.
create function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.memberships;
  v_phone text;
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

  select p.phone into v_phone from public.profiles p where p.id = v_uid;
  if v_phone is distinct from v_m.invited_phone then
    raise exception 'invite_phone_mismatch';
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

revoke all on function public.create_center(text, text, text, text, text) from public, anon;
revoke all on function public.create_invite(uuid, public.membership_role, text, text, uuid[], text[], text) from public, anon;
revoke all on function public.regenerate_invite(uuid) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.get_invite(text) from public;

grant execute on function public.create_center(text, text, text, text, text) to authenticated;
grant execute on function public.create_invite(uuid, public.membership_role, text, text, uuid[], text[], text) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.get_invite(text) to anon, authenticated;
