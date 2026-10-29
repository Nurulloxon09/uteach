-- M7g · staff profile and my profile (30-milestones M7g plan).
-- `memberships.phone` is the center's contact phone for a staff member (each center keeps its own, like
-- display_name). People may change their own profile phone (contact only since M7f).

-- ---------------------------------------------------------------------------
-- memberships.phone
-- ---------------------------------------------------------------------------
alter table public.memberships
  add column phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');

update public.memberships m
set phone = coalesce(m.invited_phone, (select p.phone from public.profiles p where p.id = m.profile_id));

-- New rows: the invite phone, else the person's profile phone (create_center's owner row).
create function private.memberships_default_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null then
    new.phone := coalesce(new.invited_phone, (select p.phone from public.profiles p where p.id = new.profile_id));
  end if;
  return new;
end;
$$;

create trigger memberships_default_phone before insert on public.memberships
  for each row execute function private.memberships_default_phone();

-- Who may change it is the existing memberships_update policy (owners; admins with `staff` for teachers in
-- their branches).
grant update (phone) on public.memberships to authenticated;

-- ---------------------------------------------------------------------------
-- profiles.phone: your own, from My profile (the row policy is own-row only)
-- ---------------------------------------------------------------------------
grant update (phone) on public.profiles to authenticated;
