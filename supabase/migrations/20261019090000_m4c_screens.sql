-- M4c · staff screens for notifications: what the Students list, Settings → Telegram and Settings →
-- Notifications read. Spec: docs/spec/17-telegram-notifications.md, 12-students-groups.md (filter "Telegram not
-- linked"), 05-ui.md (M4 plan).

-- The students list gains `telegram_linked`: the student or one of their guardians has a live Telegram link.
-- (Appended last: `create or replace view` keeps the existing columns.)
create or replace view public.student_overview
with (security_invoker = true)
as
select
  s.id,
  s.center_id,
  s.branch_id,
  s.full_name,
  s.phone,
  s.birth_date,
  s.gender,
  s.school,
  s.external_ref,
  s.archived_at,
  s.created_at,
  -- Active = at least one active or frozen enrollment (12).
  exists (
    select 1 from public.enrollments e where e.student_id = s.id and e.status <> 'ended'
  ) as is_active,
  coalesce(
    (select array_agg(distinct e.group_id) from public.enrollments e
      where e.student_id = s.id and e.status <> 'ended'),
    '{}'
  ) as group_ids,
  coalesce(
    (select array_agg(distinct g.course_id) from public.enrollments e
      join public.groups g on g.id = e.group_id
      where e.student_id = s.id and e.status <> 'ended'),
    '{}'
  ) as course_ids,
  -- What the list search looks in: name, the student's phone and the guardians' phones.
  concat_ws(
    ' ',
    s.full_name,
    s.phone,
    (select string_agg(gd.phone, ' ') from public.student_guardians sg
      join public.guardians gd on gd.id = sg.guardian_id
      where sg.student_id = s.id)
  ) as search_text,
  exists (
    select 1 from public.telegram_links l
    where l.unlinked_at is null
      and (l.student_id = s.id
           or l.guardian_id in (select sg.guardian_id from public.student_guardians sg where sg.student_id = s.id))
  ) as telegram_linked
from public.students s;

-- Settings → Telegram and Notifications: who the bot reaches and this month's SMS. Owners and admins.
-- {activeStudents, reachedStudents, linkedGuardians, linkedStudents, linkedStaff, smsThisMonth}
create function public.notification_overview(p_center_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require(private.is_staff_admin(p_center_id));
  return (
    with active as (
      select s.id from public.students s
      where s.center_id = p_center_id and s.archived_at is null
        and s.branch_id = any (private.my_branch_ids(p_center_id))
        and exists (select 1 from public.enrollments e where e.student_id = s.id and e.status <> 'ended')
    ),
    live as (
      select l.* from public.telegram_links l where l.center_id = p_center_id and l.unlinked_at is null
    )
    select jsonb_build_object(
      'activeStudents', (select count(*) from active),
      'reachedStudents', (
        select count(*) from active a
        where exists (
          select 1 from live l
          where l.student_id = a.id
             or l.guardian_id in (select sg.guardian_id from public.student_guardians sg where sg.student_id = a.id)
        )
      ),
      'linkedStudents', (select count(distinct l.student_id) from live l),
      'linkedGuardians', (select count(distinct l.guardian_id) from live l),
      'linkedStaff', (select count(distinct l.membership_id) from live l),
      'smsThisMonth', private.sms_sent_this_month(p_center_id)
    )
  );
end;
$$;

revoke all on public.student_overview from anon, authenticated;
grant select on public.student_overview to authenticated;
revoke all on function public.notification_overview(uuid) from public, anon;
grant execute on function public.notification_overview(uuid) to authenticated;
