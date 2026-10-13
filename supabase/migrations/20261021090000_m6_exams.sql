-- M6 · Exam scores (data layer): exam types (global presets + custom), results entered per group or as official
-- certificates, targets, the `score_posted` notification, and certificates in the `attachments` bucket.
-- Spec: docs/spec/16-exam-scores.md, 02-data-model.md (Exams), 03-roles-permissions.md, 17 and the M6 plan in
-- 30-milestones.md.

create type public.exam_result_kind as enum ('diagnostic', 'mock', 'official');

-- ---------------------------------------------------------------------------
-- Scoring rules. Mirror `packages/core/exams` (`examSectionsError`, `validateScores`, `examTotal`); both are
-- tested with packages/core/src/exams.fixtures.json. Values carry at most one decimal, so the arithmetic runs
-- on whole tenths.
-- ---------------------------------------------------------------------------
create function private.is_tenths(p_value numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value * 10 = trunc(p_value * 10);
$$;

-- A type's sections: 1–8 sections `{key, label {uz, ru, en}, min, max, step}` with unique keys,
-- 0 ≤ min < max ≤ 9999, a step of whole tenths that divides the range; `none` has exactly one section.
-- Returns the error code, or null when valid.
create function private.exam_sections_error(p_sections jsonb, p_rule text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_section jsonb;
  v_keys text[] := '{}';
  v_key text;
  v_min numeric;
  v_max numeric;
  v_step numeric;
begin
  if p_rule is null or p_rule not in ('ielts_band', 'sum', 'average', 'none') then
    return 'total_rule';
  end if;
  if jsonb_typeof(p_sections) is distinct from 'array' or jsonb_array_length(p_sections) not between 1 and 8 then
    return 'section_count';
  end if;
  if p_rule = 'none' and jsonb_array_length(p_sections) <> 1 then
    return 'none_needs_one_section';
  end if;
  for v_section in select e from jsonb_array_elements(p_sections) e loop
    v_key := v_section ->> 'key';
    if jsonb_typeof(v_section) <> 'object' or v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,29}$'
       or v_key = any (v_keys) then
      return 'section_key';
    end if;
    v_keys := v_keys || v_key;
    if jsonb_typeof(v_section -> 'label') is distinct from 'object'
       or length(trim(v_section -> 'label' ->> 'uz')) not between 1 and 40
       or length(trim(v_section -> 'label' ->> 'ru')) not between 1 and 40
       or length(trim(v_section -> 'label' ->> 'en')) not between 1 and 40 then
      return 'section_label';
    end if;
    if jsonb_typeof(v_section -> 'min') is distinct from 'number'
       or jsonb_typeof(v_section -> 'max') is distinct from 'number'
       or jsonb_typeof(v_section -> 'step') is distinct from 'number' then
      return 'section_decimals';
    end if;
    v_min := (v_section ->> 'min')::numeric;
    v_max := (v_section ->> 'max')::numeric;
    v_step := (v_section ->> 'step')::numeric;
    if not (private.is_tenths(v_min) and private.is_tenths(v_max) and private.is_tenths(v_step)) then
      return 'section_decimals';
    end if;
    if v_min < 0 or v_max > 9999 or v_min >= v_max then
      return 'section_range';
    end if;
    if v_step < 0.1 or mod(v_max - v_min, v_step) <> 0 then
      return 'section_step';
    end if;
  end loop;
  return null;
end;
$$;

-- Every invalid entered value, by section key: unknown_section, not_a_number, out_of_range, off_step.
-- Null values are "not entered" and skipped. An empty object = valid.
create function private.exam_score_errors(p_sections jsonb, p_scores jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_errors jsonb := '{}';
  v_key text;
  v_value jsonb;
  v_section jsonb;
  v_v numeric;
  v_min numeric;
begin
  if jsonb_typeof(p_scores) is distinct from 'object' then
    return jsonb_build_object('', 'not_a_number');
  end if;
  for v_key, v_value in select e.key, e.value from jsonb_each(p_scores) e loop
    continue when jsonb_typeof(v_value) = 'null';
    select s into v_section from jsonb_array_elements(p_sections) s where s ->> 'key' = v_key;
    if v_section is null then
      v_errors := v_errors || jsonb_build_object(v_key, 'unknown_section');
    elsif jsonb_typeof(v_value) <> 'number' then
      v_errors := v_errors || jsonb_build_object(v_key, 'not_a_number');
    else
      v_v := (v_value #>> '{}')::numeric;
      v_min := (v_section ->> 'min')::numeric;
      if v_v < v_min or v_v > (v_section ->> 'max')::numeric then
        v_errors := v_errors || jsonb_build_object(v_key, 'out_of_range');
      elsif not private.is_tenths(v_v) or mod(v_v - v_min, (v_section ->> 'step')::numeric) <> 0 then
        v_errors := v_errors || jsonb_build_object(v_key, 'off_step');
      end if;
    end if;
    v_section := null;
  end loop;
  return v_errors;
end;
$$;

-- The total by the rule (16), or null until every section has a value. ielts_band: the mean of the bands; .25
-- rounds up to .5 and .75 up to the next whole band, else to the nearest half band. sum: exact. average: one
-- decimal, half up. none: the single section's value.
create function private.exam_total(p_sections jsonb, p_rule text, p_scores jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer := 0;
  v_sum bigint := 0;
  v_first bigint;
  v_section jsonb;
  v_value jsonb;
  v_t bigint;
  v_eighths numeric;
  v_whole numeric;
  v_rest numeric;
begin
  for v_section in select e from jsonb_array_elements(p_sections) e loop
    v_value := p_scores -> (v_section ->> 'key');
    if v_value is null or jsonb_typeof(v_value) <> 'number' then
      return null;
    end if;
    v_t := round((v_value #>> '{}')::numeric * 10);
    v_first := coalesce(v_first, v_t);
    v_sum := v_sum + v_t;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    return null;
  end if;
  case p_rule
    when 'ielts_band' then
      v_eighths := (v_sum * 8)::numeric / (v_n * 10);
      v_whole := floor(v_eighths / 8);
      v_rest := v_eighths - v_whole * 8;
      return (v_whole + case when v_rest < 2 then 0 when v_rest < 6 then 0.5 else 1 end)::numeric(6, 1);
    when 'sum' then
      return (v_sum / 10.0)::numeric(6, 1);
    when 'average' then
      return (floor((2 * v_sum + v_n)::numeric / (2 * v_n)) / 10)::numeric(6, 1);
    when 'none' then
      return (v_first / 10.0)::numeric(6, 1);
    else
      raise exception 'invalid total rule %', p_rule;
  end case;
end;
$$;

-- A total for display: IELTS keeps its decimal (7.0); other whole totals drop it (1370, 63).
create function private.score_text(p_value numeric, p_rule text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when p_rule <> 'ielts_band' and p_value = trunc(p_value) then trunc(p_value)::text
    else p_value::numeric(6, 1)::text
  end;
$$;

-- ---------------------------------------------------------------------------
-- exam_types (center_id null = global preset, read-only)
-- ---------------------------------------------------------------------------
create table public.exam_types (
  id uuid primary key default gen_random_uuid(),
  center_id uuid references public.centers (id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  sections jsonb not null,
  total_rule text not null check (total_rule in ('ielts_band', 'sum', 'average', 'none')),
  total_min numeric(6, 1) not null,
  total_max numeric(6, 1) not null,
  meta jsonb not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_min < total_max),
  check (center_id is not null or archived_at is null)
);

create unique index exam_types_code on public.exam_types
  (coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
create unique index exam_types_name_live on public.exam_types (center_id, lower(name))
  where center_id is not null and archived_at is null;

create trigger exam_types_updated_at before update on public.exam_types
  for each row execute function private.set_updated_at();

-- Validates the sections, fills the total range and a custom code, and freezes sections and rule once results
-- exist (M6 plan), so stored totals never change meaning.
create function private.exam_types_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error text;
  v_mins jsonb;
  v_maxes jsonb;
begin
  if tg_op = 'UPDATE' and new.center_id is distinct from old.center_id then
    raise exception 'invalid_exam_type';
  end if;
  if tg_op = 'INSERT' and new.center_id is not null then
    new.code := 'c_' || left(replace(new.id::text, '-', ''), 12);
  end if;
  new.name := trim(new.name);
  v_error := private.exam_sections_error(new.sections, new.total_rule);
  if v_error is not null then
    raise exception 'invalid_exam_type' using detail = v_error;
  end if;
  if tg_op = 'UPDATE' and (new.sections is distinct from old.sections or new.total_rule <> old.total_rule)
     and exists (select 1 from public.exam_results r where r.exam_type_id = new.id) then
    raise exception 'exam_type_in_use';
  end if;
  select jsonb_object_agg(s ->> 'key', s -> 'min'), jsonb_object_agg(s ->> 'key', s -> 'max')
  into v_mins, v_maxes
  from jsonb_array_elements(new.sections) s;
  new.total_min := private.exam_total(new.sections, new.total_rule, v_mins);
  new.total_max := private.exam_total(new.sections, new.total_rule, v_maxes);
  return new;
end;
$$;

create trigger exam_types_check before insert or update on public.exam_types
  for each row execute function private.exam_types_check();

-- A type a center may use: a preset or its own.
create function private.exam_type_for(p_center_id uuid, p_exam_type_id uuid)
returns public.exam_types
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.exam_types;
begin
  select t.* into v_type from public.exam_types t
  where t.id = p_exam_type_id and (t.center_id is null or t.center_id = p_center_id);
  if not found then
    raise exception 'invalid_exam_type';
  end if;
  return v_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- courses.exam_type_id (the M1 note in 02)
-- ---------------------------------------------------------------------------
alter table public.courses add column exam_type_id uuid references public.exam_types (id);

create function private.courses_check_exam_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.exam_type_id is not null and (tg_op = 'INSERT' or new.exam_type_id is distinct from old.exam_type_id) then
    perform private.exam_type_for(new.center_id, new.exam_type_id);
  end if;
  return new;
end;
$$;

create trigger courses_check_exam_type before insert or update of exam_type_id on public.courses
  for each row execute function private.courses_check_exam_type();

-- ---------------------------------------------------------------------------
-- exam_results
-- ---------------------------------------------------------------------------
create table public.exam_results (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  exam_type_id uuid not null references public.exam_types (id),
  group_id uuid,
  kind public.exam_result_kind not null,
  taken_on date not null,
  section_scores jsonb not null,
  total_score numeric(6, 1),
  certificate_path text check (certificate_path is null or length(certificate_path) <= 300),
  note text check (note is null or length(note) <= 500),
  entered_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, group_id) references public.groups (center_id, id),
  constraint exam_results_entry_key unique nulls not distinct (student_id, exam_type_id, group_id, taken_on, kind),
  check ((kind = 'official') = (group_id is null)),
  check (certificate_path is null or kind = 'official')
);

create index exam_results_student on public.exam_results (student_id, exam_type_id, taken_on);
create index exam_results_group on public.exam_results (group_id, taken_on desc) where group_id is not null;
create index exam_results_center on public.exam_results (center_id, taken_on desc);

create trigger exam_results_updated_at before update on public.exam_results
  for each row execute function private.set_updated_at();

-- Validates the scores against the type (`exam_score_invalid`), drops empty values and computes the total.
create function private.exam_results_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.exam_types;
begin
  if tg_op = 'UPDATE' and (new.exam_type_id <> old.exam_type_id or new.student_id <> old.student_id) then
    raise exception 'invalid_exam_result';
  end if;
  v_type := private.exam_type_for(new.center_id, new.exam_type_id);
  if private.exam_score_errors(v_type.sections, new.section_scores) <> '{}' then
    raise exception 'exam_score_invalid' using detail = private.exam_score_errors(v_type.sections, new.section_scores)::text;
  end if;
  new.section_scores := jsonb_strip_nulls(new.section_scores);
  if new.section_scores = '{}' then
    raise exception 'exam_score_invalid';
  end if;
  new.total_score := private.exam_total(v_type.sections, v_type.total_rule, new.section_scores);
  if new.certificate_path is not null and new.certificate_path not like new.center_id::text || '/certificates/%' then
    raise exception 'invalid_exam_result';
  end if;
  return new;
end;
$$;

create trigger exam_results_check before insert or update on public.exam_results
  for each row execute function private.exam_results_check();

-- The four presets (16, sources checked in the M6 plan). Same rules as EXAM_PRESETS in packages/core (parity test).
insert into public.exam_types (center_id, code, name, sections, total_rule, total_min, total_max, meta) values
  (null, 'ielts', 'IELTS', '[
    {"key": "listening", "label": {"uz": "Tinglash", "ru": "Аудирование", "en": "Listening"}, "min": 0, "max": 9, "step": 0.5},
    {"key": "reading", "label": {"uz": "Oʻqish", "ru": "Чтение", "en": "Reading"}, "min": 0, "max": 9, "step": 0.5},
    {"key": "writing", "label": {"uz": "Yozish", "ru": "Письмо", "en": "Writing"}, "min": 0, "max": 9, "step": 0.5},
    {"key": "speaking", "label": {"uz": "Gapirish", "ru": "Говорение", "en": "Speaking"}, "min": 0, "max": 9, "step": 0.5}
  ]', 'ielts_band', 0, 0, '{}'),
  (null, 'sat', 'SAT', '[
    {"key": "reading_writing", "label": {"uz": "Oʻqish va yozish", "ru": "Чтение и письмо", "en": "Reading and Writing"}, "min": 200, "max": 800, "step": 10},
    {"key": "math", "label": {"uz": "Matematika", "ru": "Математика", "en": "Math"}, "min": 200, "max": 800, "step": 10}
  ]', 'sum', 0, 0, '{}'),
  (null, 'cefr', 'CEFR (Multilevel)', '[
    {"key": "listening", "label": {"uz": "Tinglash", "ru": "Аудирование", "en": "Listening"}, "min": 0, "max": 75, "step": 1},
    {"key": "reading", "label": {"uz": "Oʻqish", "ru": "Чтение", "en": "Reading"}, "min": 0, "max": 75, "step": 1},
    {"key": "writing", "label": {"uz": "Yozish", "ru": "Письмо", "en": "Writing"}, "min": 0, "max": 75, "step": 1},
    {"key": "speaking", "label": {"uz": "Gapirish", "ru": "Говорение", "en": "Speaking"}, "min": 0, "max": 75, "step": 1}
  ]', 'average', 0, 0, '{"grades": "cefr"}'),
  (null, 'milliy', 'Milliy sertifikat', '[
    {"key": "score", "label": {"uz": "Ball", "ru": "Балл", "en": "Score"}, "min": 0, "max": 75, "step": 0.1}
  ]', 'none', 0, 0, '{"grades": "milliy"}');

-- ---------------------------------------------------------------------------
-- student_targets
-- ---------------------------------------------------------------------------
create table public.student_targets (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  exam_type_id uuid not null references public.exam_types (id),
  target_total numeric(6, 1),
  target_sections jsonb,
  exam_date date,
  baseline_total numeric(6, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, student_id) references public.students (center_id, id),
  unique (student_id, exam_type_id),
  check (target_total is not null or exam_date is not null)
);

create trigger student_targets_updated_at before update on public.student_targets
  for each row execute function private.set_updated_at();

-- Totals within the type's range; target sections valid for the type (`invalid_target`).
create function private.student_targets_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.exam_types;
begin
  v_type := private.exam_type_for(new.center_id, new.exam_type_id);
  if (new.target_total is not null and new.target_total not between v_type.total_min and v_type.total_max)
     or (new.baseline_total is not null and new.baseline_total not between v_type.total_min and v_type.total_max)
     or (new.target_sections is not null
         and private.exam_score_errors(v_type.sections, new.target_sections) <> '{}') then
    raise exception 'invalid_target';
  end if;
  new.target_sections := nullif(jsonb_strip_nulls(new.target_sections), '{}');
  return new;
end;
$$;

create trigger student_targets_check before insert or update on public.student_targets
  for each row execute function private.student_targets_check();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
-- Reads a student's scores: branch staff, or a teacher of one of the student's groups.
create function private.sees_scores(p_center_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_branch_admin(p_center_id, private.student_branch(p_student_id))
    or private.teaches_student(p_student_id);
$$;

-- Writes a student's scores and targets: owners, branch admins with `academics`, the student's teachers.
create function private.can_score_student(p_center_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.is_branch_admin(p_center_id, private.student_branch(p_student_id))
          and private.has_perm(p_center_id, 'academics'))
    or private.teaches_student(p_student_id);
$$;

-- Enters a group's scores: owners, admins of the group's branch with `academics`, the group's teachers.
create function private.can_score_group(p_center_id uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.is_branch_admin(p_center_id, private.group_branch(p_group_id))
          and private.has_perm(p_center_id, 'academics'))
    or private.teaches_group(p_group_id);
$$;

-- ---------------------------------------------------------------------------
-- RLS. Results and targets are written through the RPCs only.
-- ---------------------------------------------------------------------------
alter table public.exam_types enable row level security;
alter table public.exam_results enable row level security;
alter table public.student_targets enable row level security;

create policy exam_types_select on public.exam_types
  for select to authenticated using (center_id is null or private.is_member(center_id));
create policy exam_types_insert on public.exam_types
  for insert to authenticated
  with check (
    center_id is not null and private.has_perm(center_id, 'academics') and private.center_writable(center_id)
  );
create policy exam_types_update on public.exam_types
  for update to authenticated
  using (center_id is not null and private.has_perm(center_id, 'academics') and private.center_writable(center_id))
  with check (
    center_id is not null and private.has_perm(center_id, 'academics') and private.center_writable(center_id)
  );

create policy exam_results_select on public.exam_results
  for select to authenticated
  using (
    private.sees_scores(center_id, student_id) or (group_id is not null and private.teaches_group(group_id))
  );

create policy student_targets_select on public.student_targets
  for select to authenticated using (private.sees_scores(center_id, student_id));

revoke all on public.exam_types, public.exam_results, public.student_targets from anon, authenticated;
grant select on public.exam_types, public.exam_results, public.student_targets to authenticated;
grant insert (center_id, name, sections, total_rule) on public.exam_types to authenticated;
grant update (name, sections, total_rule, archived_at) on public.exam_types to authenticated;

grant select (exam_type_id) on public.courses to authenticated;
grant insert (exam_type_id) on public.courses to authenticated;
grant update (exam_type_id) on public.courses to authenticated;

-- ---------------------------------------------------------------------------
-- score_posted (17, M6 plan): Telegram only, to the student and guardians, 10 minutes after a save. A re-save
-- inside that window replaces the waiting message; once sent, a correction doesn't send again.
-- ---------------------------------------------------------------------------
create function private.notify_score(p_result public.exam_results)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.exam_types;
  v_target public.student_targets;
  v_sections jsonb;
  v_base text := format('score:%s', p_result.id);
begin
  select t.* into v_type from public.exam_types t where t.id = p_result.exam_type_id;
  select st.* into v_target from public.student_targets st
  where st.student_id = p_result.student_id and st.exam_type_id = p_result.exam_type_id;
  -- One line of sections per language; the renderer picks the recipient's.
  select jsonb_object_agg(l.locale, l.line) into v_sections
  from (
    select loc.locale,
           string_agg(
             format('%s %s', s.section -> 'label' ->> loc.locale,
                    private.score_text((p_result.section_scores ->> (s.section ->> 'key'))::numeric,
                                       case when v_type.total_rule = 'ielts_band' then 'ielts_band' else 'sum' end)),
             ' · ' order by s.ord
           ) as line
    from unnest(array['uz', 'ru', 'en']) loc (locale)
    cross join jsonb_array_elements(v_type.sections) with ordinality s (section, ord)
    where p_result.section_scores ? (s.section ->> 'key')
    group by loc.locale
  ) l;

  perform private.cancel_pending_notifications(p_result.center_id, v_base || ':');
  return private.enqueue_notification(
    p_result.center_id,
    'score_posted',
    p_result.student_id,
    jsonb_build_object(
      'studentId', p_result.student_id,
      'resultId', p_result.id,
      'student', (select s.full_name from public.students s where s.id = p_result.student_id),
      'center', (select c.name from public.centers c where c.id = p_result.center_id),
      'exam', v_type.name,
      'kind', p_result.kind,
      'date', p_result.taken_on::text,
      'sections', v_sections,
      'hasTotal', p_result.total_score is not null,
      'total', coalesce(private.score_text(p_result.total_score, v_type.total_rule), ''),
      'hasTarget', v_target.target_total is not null,
      'target', coalesce(private.score_text(v_target.target_total, v_type.total_rule), '')
    ),
    v_base,
    now() + interval '10 minutes',
    'student_and_guardians'
  );
end;
$$;

insert into public.notification_templates (center_id, key, channel, locale, body) values
  (null, 'score_posted', 'telegram', 'uz',
   '📊 {student}: {exam}, {kind, select, mock {sinov imtihoni} diagnostic {diagnostik test} other {rasmiy natija}} ({date})
{sections}{hasTotal, select, true {
Umumiy ball: {total}} other {}}{hasTarget, select, true {
Maqsad: {target}} other {}}
{center}'),
  (null, 'score_posted', 'telegram', 'ru',
   '📊 {student}: {exam}, {kind, select, mock {пробный экзамен} diagnostic {диагностика} other {официальный результат}} ({date})
{sections}{hasTotal, select, true {
Общий балл: {total}} other {}}{hasTarget, select, true {
Цель: {target}} other {}}
{center}'),
  (null, 'score_posted', 'telegram', 'en',
   '📊 {student}: {exam}, {kind, select, mock {mock exam} diagnostic {diagnostic test} other {official result}} ({date})
{sections}{hasTotal, select, true {
Overall: {total}} other {}}{hasTarget, select, true {
Target: {target}} other {}}
{center}');

-- ---------------------------------------------------------------------------
-- RPCs: entering scores
-- ---------------------------------------------------------------------------
-- Saves a group's diagnostic or mock (16): one row per student `{studentId, scores: {section: value | null}}`.
-- Upserts by (student, type, group, day, kind); a row with no values deletes that student's result. Students
-- must be in the group (not ended) or already have a result in this entry. Changed results queue
-- `score_posted`. Returns {saved, deleted, notified}.
create function public.save_group_scores(
  p_group_id uuid,
  p_exam_type_id uuid,
  p_kind public.exam_result_kind,
  p_taken_on date,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_type public.exam_types;
  v_row jsonb;
  v_student uuid;
  v_scores jsonb;
  v_old public.exam_results;
  v_new public.exam_results;
  v_saved integer := 0;
  v_deleted integer := 0;
  v_notified integer := 0;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(private.can_score_group(v_group.center_id, p_group_id));
  perform private.require_writable(v_group.center_id);
  if p_kind not in ('diagnostic', 'mock') or p_taken_on is null then
    raise exception 'invalid_exam_result';
  end if;
  if p_taken_on > private.today_in((select b.timezone from public.branches b where b.id = v_group.branch_id)) then
    raise exception 'invalid_dates';
  end if;
  v_type := private.exam_type_for(v_group.center_id, p_exam_type_id);
  if v_type.archived_at is not null then
    raise exception 'invalid_exam_type';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'invalid_exam_result';
  end if;

  for v_row in select e from jsonb_array_elements(p_rows) e loop
    v_student := (v_row ->> 'studentId')::uuid;
    v_scores := coalesce(v_row -> 'scores', '{}');
    if jsonb_typeof(v_scores) <> 'object' then
      raise exception 'exam_score_invalid';
    end if;
    v_scores := jsonb_strip_nulls(v_scores);

    v_old := null;
    select r.* into v_old from public.exam_results r
    where r.student_id = v_student and r.exam_type_id = p_exam_type_id and r.group_id = p_group_id
      and r.taken_on = p_taken_on and r.kind = p_kind
    for update;
    if v_old.id is null and not exists (
      select 1 from public.enrollments e
      where e.student_id = v_student and e.group_id = p_group_id and e.status <> 'ended'
    ) then
      raise exception 'student_not_expected';
    end if;

    if v_scores = '{}' then
      if v_old.id is not null then
        delete from public.exam_results where id = v_old.id;
        perform private.cancel_pending_notifications(v_group.center_id, format('score:%s:', v_old.id));
        v_deleted := v_deleted + 1;
      end if;
      continue;
    end if;

    if v_old.id is null then
      insert into public.exam_results (
        center_id, student_id, exam_type_id, group_id, kind, taken_on, section_scores, entered_by
      )
      values (v_group.center_id, v_student, p_exam_type_id, p_group_id, p_kind, p_taken_on, v_scores, auth.uid())
      returning * into v_new;
    elsif v_old.section_scores is distinct from v_scores then
      update public.exam_results
      set section_scores = v_scores, entered_by = auth.uid()
      where id = v_old.id
      returning * into v_new;
    else
      continue;
    end if;
    v_saved := v_saved + 1;
    v_notified := v_notified + private.notify_score(v_new);
  end loop;

  return jsonb_build_object('saved', v_saved, 'deleted', v_deleted, 'notified', v_notified);
end;
$$;

-- Records or edits an official result (16) on the student profile, with an optional certificate in
-- attachments/{center_id}/certificates/…. Same day and type → the same row. Queues `score_posted`.
create function public.save_official_result(
  p_student_id uuid,
  p_exam_type_id uuid,
  p_taken_on date,
  p_scores jsonb,
  p_certificate_path text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_type public.exam_types;
  v_old public.exam_results;
  v_new public.exam_results;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(private.can_score_student(v_student.center_id, p_student_id));
  perform private.require_writable(v_student.center_id);
  if p_taken_on is null
     or p_taken_on > private.today_in((select b.timezone from public.branches b where b.id = v_student.branch_id)) then
    raise exception 'invalid_dates';
  end if;
  v_type := private.exam_type_for(v_student.center_id, p_exam_type_id);
  if jsonb_typeof(p_scores) is distinct from 'object' then
    raise exception 'exam_score_invalid';
  end if;

  select r.* into v_old from public.exam_results r
  where r.student_id = p_student_id and r.exam_type_id = p_exam_type_id and r.group_id is null
    and r.taken_on = p_taken_on and r.kind = 'official'
  for update;

  if v_old.id is null then
    insert into public.exam_results (
      center_id, student_id, exam_type_id, kind, taken_on, section_scores, certificate_path, note, entered_by
    )
    values (
      v_student.center_id, p_student_id, p_exam_type_id, 'official', p_taken_on, p_scores,
      nullif(trim(p_certificate_path), ''), nullif(trim(p_note), ''), auth.uid()
    )
    returning * into v_new;
  else
    update public.exam_results
    set section_scores = p_scores,
        certificate_path = coalesce(nullif(trim(p_certificate_path), ''), certificate_path),
        note = nullif(trim(p_note), ''),
        entered_by = auth.uid()
    where id = v_old.id
    returning * into v_new;
    if v_new.section_scores is not distinct from v_old.section_scores then
      return v_new.id;
    end if;
  end if;
  perform private.notify_score(v_new);
  return v_new.id;
end;
$$;

-- Deletes one result (and its waiting notification).
create function public.delete_exam_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.exam_results;
begin
  select r.* into v_result from public.exam_results r where r.id = p_result_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    case when v_result.group_id is null then private.can_score_student(v_result.center_id, v_result.student_id)
         else private.can_score_group(v_result.center_id, v_result.group_id) end
  );
  perform private.require_writable(v_result.center_id);
  delete from public.exam_results where id = p_result_id;
  perform private.cancel_pending_notifications(v_result.center_id, format('score:%s:', p_result_id));
end;
$$;

-- Sets a student's target for an exam type (16): target total, optional sections, planned exam day, optional
-- baseline. No target and no exam day removes it. Returns the target id (null when removed).
create function public.set_student_target(
  p_student_id uuid,
  p_exam_type_id uuid,
  p_target_total numeric,
  p_exam_date date default null,
  p_baseline_total numeric default null,
  p_target_sections jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_id uuid;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(private.can_score_student(v_student.center_id, p_student_id));
  perform private.require_writable(v_student.center_id);
  perform private.exam_type_for(v_student.center_id, p_exam_type_id);

  if p_target_total is null and p_exam_date is null then
    delete from public.student_targets where student_id = p_student_id and exam_type_id = p_exam_type_id;
    return null;
  end if;
  insert into public.student_targets as t (
    center_id, student_id, exam_type_id, target_total, target_sections, exam_date, baseline_total
  )
  values (
    v_student.center_id, p_student_id, p_exam_type_id, p_target_total, p_target_sections, p_exam_date,
    p_baseline_total
  )
  on conflict (student_id, exam_type_id) do update
  set target_total = excluded.target_total,
      target_sections = excluded.target_sections,
      exam_date = excluded.exam_date,
      baseline_total = excluded.baseline_total
  returning t.id into v_id;
  return v_id;
end;
$$;

-- Converting a lead with a target score writes the student's target (M6 plan) when the group's course has an
-- exam type (else the lead's course) and the score fits that type. Never blocks the conversion.
create function private.leads_won_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.exam_types;
begin
  select t.* into v_type
  from public.exam_types t
  where t.id = coalesce(
    (select c.exam_type_id from public.enrollments e
     join public.groups g on g.id = e.group_id
     join public.courses c on c.id = g.course_id
     where e.student_id = new.converted_student_id
     order by e.created_at desc limit 1),
    (select c.exam_type_id from public.courses c where c.id = new.interested_course_id)
  );
  if v_type.id is not null and new.target_score between v_type.total_min and v_type.total_max then
    insert into public.student_targets (center_id, student_id, exam_type_id, target_total)
    values (new.center_id, new.converted_student_id, v_type.id, new.target_score)
    on conflict (student_id, exam_type_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger leads_won_target after update of status on public.leads
  for each row when (new.status = 'won' and old.status <> 'won' and new.target_score is not null)
  execute function private.leads_won_target();

-- ---------------------------------------------------------------------------
-- RPCs: reading
-- ---------------------------------------------------------------------------
-- The group's gap table (16): every student in the group (not ended) with their latest result of the type,
-- the one before it (trend), how many results they have, the target, the gap to it, the baseline and uplift.
-- Baseline = target.baseline_total, else the first diagnostic, else the first result. Names only, so teachers
-- read it too.
create function public.group_scores(p_group_id uuid, p_exam_type_id uuid)
returns table (
  student_id uuid,
  full_name text,
  results_count integer,
  latest_on date,
  latest_kind public.exam_result_kind,
  latest_total numeric,
  latest_sections jsonb,
  previous_total numeric,
  target_total numeric,
  exam_date date,
  gap numeric,
  baseline_total numeric,
  uplift numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_group public.groups;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    private.is_branch_admin(v_group.center_id, v_group.branch_id) or private.teaches_group(p_group_id)
  );
  perform private.exam_type_for(v_group.center_id, p_exam_type_id);
  return query
  with students as (
    select distinct on (e.student_id) e.student_id, s.full_name
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.group_id = p_group_id and e.status <> 'ended'
  ),
  totals as (
    select r.student_id, r.taken_on, r.kind, r.total_score, r.section_scores,
           row_number() over (partition by r.student_id order by r.taken_on desc, r.created_at desc) as recent,
           row_number() over (partition by r.student_id
                              order by (r.kind = 'diagnostic') desc, r.taken_on, r.created_at) as first,
           count(*) over (partition by r.student_id) as n
    from public.exam_results r
    where r.exam_type_id = p_exam_type_id and r.total_score is not null
      and r.student_id in (select st.student_id from students st)
  )
  select st.student_id, st.full_name,
         coalesce(latest.n, 0)::integer,
         latest.taken_on, latest.kind, latest.total_score, latest.section_scores,
         prev.total_score,
         tg.target_total, tg.exam_date,
         tg.target_total - latest.total_score,
         coalesce(tg.baseline_total, base.total_score),
         latest.total_score - coalesce(tg.baseline_total, base.total_score)
  from students st
  left join totals latest on latest.student_id = st.student_id and latest.recent = 1
  left join totals prev on prev.student_id = st.student_id and prev.recent = 2
  left join totals base on base.student_id = st.student_id and base.first = 1
  left join public.student_targets tg on tg.student_id = st.student_id and tg.exam_type_id = p_exam_type_id
  order by st.full_name;
end;
$$;

-- Recent score entries (the Exams / Scores page): one row per group, type, kind and day, with the number of
-- students and the average total. Runs as the caller, so RLS limits it to what they may see.
create function public.score_entries(
  p_center_id uuid,
  p_from date default null,
  p_to date default null,
  p_group_id uuid default null,
  p_exam_type_id uuid default null
)
returns table (
  group_id uuid,
  group_name text,
  exam_type_id uuid,
  exam_name text,
  kind public.exam_result_kind,
  taken_on date,
  students integer,
  average_total numeric
)
language sql
stable
set search_path = ''
as $$
  select r.group_id, g.name, r.exam_type_id, t.name, r.kind, r.taken_on, count(*)::integer,
         round(avg(r.total_score), 1)
  from public.exam_results r
  join public.groups g on g.id = r.group_id
  join public.exam_types t on t.id = r.exam_type_id
  where r.center_id = p_center_id
    and r.group_id is not null
    and (p_from is null or r.taken_on >= p_from)
    and (p_to is null or r.taken_on <= p_to)
    and (p_group_id is null or r.group_id = p_group_id)
    and (p_exam_type_id is null or r.exam_type_id = p_exam_type_id)
  group by r.group_id, g.name, r.exam_type_id, t.name, r.kind, r.taken_on
  order by r.taken_on desc, g.name
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- Storage: attachments/{center_id}/certificates/… (01). Private; staff who may see the center's scores read,
-- and anyone who may enter them uploads. Guarded: PGlite has no `storage` schema.
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('attachments', 'attachments', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $sql$
      create policy attachments_certificates_read on storage.objects for select to authenticated
      using (
        bucket_id = 'attachments' and (storage.foldername(name))[2] = 'certificates'
        and private.is_member(((storage.foldername(name))[1])::uuid)
      )
    $sql$;
    execute $sql$
      create policy attachments_certificates_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'attachments' and (storage.foldername(name))[2] = 'certificates'
        and private.is_member(((storage.foldername(name))[1])::uuid)
        and private.center_writable(((storage.foldername(name))[1])::uuid)
      )
    $sql$;
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function
  public.save_group_scores(uuid, uuid, public.exam_result_kind, date, jsonb),
  public.save_official_result(uuid, uuid, date, jsonb, text, text),
  public.delete_exam_result(uuid),
  public.set_student_target(uuid, uuid, numeric, date, numeric, jsonb),
  public.group_scores(uuid, uuid),
  public.score_entries(uuid, date, date, uuid, uuid)
from public, anon;

grant execute on function
  public.save_group_scores(uuid, uuid, public.exam_result_kind, date, jsonb),
  public.save_official_result(uuid, uuid, date, jsonb, text, text),
  public.delete_exam_result(uuid),
  public.set_student_target(uuid, uuid, numeric, date, numeric, jsonb),
  public.group_scores(uuid, uuid),
  public.score_entries(uuid, date, date, uuid, uuid)
to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
