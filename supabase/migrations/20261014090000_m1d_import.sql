-- M1d · Onboarding wizard and Excel import
-- Spec: docs/spec/10-platform-onboarding.md (wizard, Excel import), 01-tech-stack.md (storage buckets and the
-- `{center_id}/…` path rule). Import is all-or-nothing: one RPC call per job, in one transaction. Rows that match
-- existing data are skipped, never overwritten, so re-importing a file creates no duplicates.

-- ---------------------------------------------------------------------------
-- Storage buckets (guarded: PGlite has no `storage` schema)
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('center-assets', 'center-assets', true), ('imports', 'imports', false)
    on conflict (id) do nothing;

    -- center-assets/{center_id}/…: logos. Public read (shown on pages); owners write.
    execute $sql$
      create policy center_assets_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'center-assets'
        and private.is_owner(((storage.foldername(name))[1])::uuid)
      )
    $sql$;
    execute $sql$
      create policy center_assets_update on storage.objects for update to authenticated
      using (bucket_id = 'center-assets' and private.is_owner(((storage.foldername(name))[1])::uuid))
      with check (bucket_id = 'center-assets' and private.is_owner(((storage.foldername(name))[1])::uuid))
    $sql$;

    -- imports/{center_id}/…: uploaded Excel files. Only staff with `import` in that center.
    execute $sql$
      create policy imports_read on storage.objects for select to authenticated
      using (bucket_id = 'imports' and private.has_perm(((storage.foldername(name))[1])::uuid, 'import'))
    $sql$;
    execute $sql$
      create policy imports_write on storage.objects for insert to authenticated
      with check (bucket_id = 'imports' and private.has_perm(((storage.foldername(name))[1])::uuid, 'import'))
    $sql$;
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Import RPCs. The web app parses and validates the file (and shows row/column errors); these functions are
-- the final word: any database error aborts the whole job.
-- ---------------------------------------------------------------------------
create function private.import_job_for(p_job_id uuid, p_kind text)
returns public.import_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  select j.* into v_job from public.import_jobs j where j.id = p_job_id for update;
  if not found or v_job.kind <> p_kind then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_job.center_id);
  perform private.require(private.has_perm(v_job.center_id, 'import'));
  if v_job.status = 'imported' then
    raise exception 'import_done';
  end if;
  return v_job;
end;
$$;

create function private.finish_import_job(p_job_id uuid, p_rows integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.import_jobs
  set status = 'imported', imported_at = now(), row_count = p_rows, error_count = 0, errors = '[]'
  where id = p_job_id;
$$;

-- Students (+ one guardian each). Rows: [{fullName, phone, birthDate, gender, school, branchId, externalRef,
-- guardianName, guardianPhone, relation}]. A row matching a student by external_ref, else by phone + normalised
-- name, is skipped. Returns {created, skipped}.
create function public.import_students(p_job_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_row jsonb;
  v_student uuid;
  v_guardian uuid;
  v_branch uuid;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  v_job := private.import_job_for(p_job_id, 'students');

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_branch := (v_row ->> 'branchId')::uuid;
    perform private.require(private.has_branch(v_job.center_id, v_branch));

    select s.id into v_student
    from public.students s
    where s.center_id = v_job.center_id
      and (
        (nullif(v_row ->> 'externalRef', '') is not null and s.external_ref = v_row ->> 'externalRef')
        or (
          nullif(v_row ->> 'phone', '') is not null and s.phone = v_row ->> 'phone'
          and private.normalize_name(s.full_name) = private.normalize_name(v_row ->> 'fullName')
        )
      )
    limit 1;
    if found then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.students (center_id, branch_id, full_name, phone, birth_date, gender, school, external_ref)
    values (
      v_job.center_id, v_branch, trim(v_row ->> 'fullName'), nullif(v_row ->> 'phone', ''),
      nullif(v_row ->> 'birthDate', '')::date, nullif(v_row ->> 'gender', ''), nullif(trim(v_row ->> 'school'), ''),
      nullif(trim(v_row ->> 'externalRef'), '')
    )
    returning id into v_student;
    v_created := v_created + 1;

    if nullif(v_row ->> 'guardianPhone', '') is not null then
      select g.id into v_guardian from public.guardians g
      where g.center_id = v_job.center_id and g.phone = v_row ->> 'guardianPhone';
      if not found then
        insert into public.guardians (center_id, full_name, phone)
        values (v_job.center_id, coalesce(nullif(trim(v_row ->> 'guardianName'), ''), v_row ->> 'guardianPhone'), v_row ->> 'guardianPhone')
        returning id into v_guardian;
      end if;
      insert into public.student_guardians (center_id, student_id, guardian_id, relation, is_primary)
      values (v_job.center_id, v_student, v_guardian, coalesce(nullif(v_row ->> 'relation', ''), 'parent'), true)
      on conflict (student_id, guardian_id) do nothing;
    end if;
  end loop;

  perform private.finish_import_job(p_job_id, jsonb_array_length(p_rows));
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- Groups (+ price and weekly times). Rows: [{name, branchId, courseId, levelId, teacherId, roomId, startDate,
-- endDate, capacity, price, cycleLessons, rules: [{weekday, startTime, durationMinutes}]}]. A group with the same
-- name in the branch is skipped. Without a teacher the times are kept but no lessons are made until one is set.
create function public.import_groups(p_job_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_row jsonb;
  v_rule jsonb;
  v_group uuid;
  v_branch uuid;
  v_teacher uuid;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  v_job := private.import_job_for(p_job_id, 'groups');

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_branch := (v_row ->> 'branchId')::uuid;
    perform private.require(private.has_branch(v_job.center_id, v_branch));
    if exists (
      select 1 from public.groups g
      where g.branch_id = v_branch and lower(g.name) = lower(trim(v_row ->> 'name')) and g.archived_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_teacher := nullif(v_row ->> 'teacherId', '')::uuid;
    insert into public.groups (
      center_id, branch_id, course_id, level_id, name, teacher_membership_id, room_id, capacity, start_date, end_date
    )
    values (
      v_job.center_id, v_branch, (v_row ->> 'courseId')::uuid, nullif(v_row ->> 'levelId', '')::uuid,
      trim(v_row ->> 'name'), v_teacher, nullif(v_row ->> 'roomId', '')::uuid,
      nullif(v_row ->> 'capacity', '')::smallint, (v_row ->> 'startDate')::date, nullif(v_row ->> 'endDate', '')::date
    )
    returning id into v_group;
    v_created := v_created + 1;

    if nullif(v_row ->> 'price', '') is not null then
      perform private.require(private.has_perm(v_job.center_id, 'billing'));
      insert into public.group_prices (center_id, group_id, price_amount, cycle_lessons, effective_from)
      values (
        v_job.center_id, v_group, (v_row ->> 'price')::bigint,
        coalesce(nullif(v_row ->> 'cycleLessons', '')::smallint, 12), (v_row ->> 'startDate')::date
      );
    end if;

    if v_teacher is not null then
      perform private.apply_schedule_rules(v_group, coalesce(v_row -> 'rules', '[]'));
    else
      for v_rule in select value from jsonb_array_elements(coalesce(v_row -> 'rules', '[]')) loop
        insert into public.group_schedule_rules (center_id, group_id, weekday, start_time, duration_minutes, valid_from)
        values (
          v_job.center_id, v_group, (v_rule ->> 'weekday')::smallint, (v_rule ->> 'startTime')::time,
          (v_rule ->> 'durationMinutes')::smallint, (v_row ->> 'startDate')::date
        );
      end loop;
    end if;
  end loop;

  perform private.finish_import_job(p_job_id, jsonb_array_length(p_rows));
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- Enrollments. Rows: [{studentId, groupId, startDate}]. A student already in the group is skipped.
create function public.import_enrollments(p_job_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_row jsonb;
  v_group public.groups;
  v_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  v_job := private.import_job_for(p_job_id, 'enrollments');

  for v_row in select value from jsonb_array_elements(p_rows) loop
    select g.* into v_group from public.groups g
    where g.id = (v_row ->> 'groupId')::uuid and g.center_id = v_job.center_id;
    if not found then
      raise exception 'not_found';
    end if;
    perform private.require(private.has_branch(v_job.center_id, v_group.branch_id));

    if exists (
      select 1 from public.enrollments e
      where e.student_id = (v_row ->> 'studentId')::uuid and e.group_id = v_group.id and e.status <> 'ended'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.enrollments (center_id, student_id, group_id, start_date)
    values (v_job.center_id, (v_row ->> 'studentId')::uuid, v_group.id, (v_row ->> 'startDate')::date)
    returning id into v_id;
    perform private.on_enrollment_change(v_id, 'enroll');
    v_created := v_created + 1;
  end loop;

  perform private.finish_import_job(p_job_id, jsonb_array_length(p_rows));
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

revoke all on function public.import_students(uuid, jsonb) from public, anon;
revoke all on function public.import_groups(uuid, jsonb) from public, anon;
revoke all on function public.import_enrollments(uuid, jsonb) from public, anon;
grant execute on function public.import_students(uuid, jsonb) to authenticated;
grant execute on function public.import_groups(uuid, jsonb) to authenticated;
grant execute on function public.import_enrollments(uuid, jsonb) to authenticated;
