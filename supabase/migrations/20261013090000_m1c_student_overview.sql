-- M1c · Students list
-- Spec: docs/spec/12-students-groups.md (students list: search by name, phone and guardian phone; filters by
-- branch, group, course and active/inactive) and 02-data-model.md (`student_overview`).
-- A plain view with security_invoker: every row and every joined table is still filtered by the caller's RLS,
-- so teachers (no access to students) see nothing here either.

create view public.student_overview
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
  ) as search_text
from public.students s;

revoke all on public.student_overview from anon, authenticated;
grant select on public.student_overview to authenticated;
