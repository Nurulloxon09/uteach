-- M6c (30-milestones M6, 17 § Menu): the bot's Scores item. Raw numbers per exam type; the bot formats them
-- with `packages/core/exams` (totals, CEFR level, Milliy grade, gap, arrows).

-- Every exam type the student has a result or a target for:
-- [{code, name, totalRule, sections: [{key, label}], latest: {kind, takenOn, scores, total} | null,
--   target: {total, examDate} | null, recent: [{takenOn, kind, total}] (last five with a total, oldest first)}].
create function worker.bot_scores(p_telegram_user_id bigint, p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform worker.require_subject(p_telegram_user_id, p_student_id);
  return coalesce((
    select jsonb_agg(x.j order by x.last_on desc nulls last, x.name)
    from (
      select t.name,
             (select max(r.taken_on) from public.exam_results r
              where r.student_id = p_student_id and r.exam_type_id = t.id) as last_on,
             jsonb_build_object(
               'code', t.code,
               'name', t.name,
               'totalRule', t.total_rule,
               'sections', (select jsonb_agg(jsonb_build_object('key', s ->> 'key', 'label', s -> 'label') order by o)
                            from jsonb_array_elements(t.sections) with ordinality e (s, o)),
               'latest', (select jsonb_build_object('kind', r.kind, 'takenOn', to_char(r.taken_on, 'YYYY-MM-DD'),
                                                    'scores', r.section_scores, 'total', r.total_score)
                          from public.exam_results r
                          where r.student_id = p_student_id and r.exam_type_id = t.id
                          order by r.taken_on desc, r.created_at desc limit 1),
               'target', (select jsonb_build_object('total', st.target_total,
                                                    'examDate', to_char(st.exam_date, 'YYYY-MM-DD'))
                          from public.student_targets st
                          where st.student_id = p_student_id and st.exam_type_id = t.id),
               'recent', coalesce((
                 select jsonb_agg(jsonb_build_object('takenOn', to_char(y.taken_on, 'YYYY-MM-DD'), 'kind', y.kind,
                                                     'total', y.total_score) order by y.taken_on, y.created_at)
                 from (select r.taken_on, r.kind, r.total_score, r.created_at
                       from public.exam_results r
                       where r.student_id = p_student_id and r.exam_type_id = t.id and r.total_score is not null
                       order by r.taken_on desc, r.created_at desc limit 5) y
               ), '[]')
             ) as j
      from public.exam_types t
      where exists (select 1 from public.exam_results r where r.student_id = p_student_id and r.exam_type_id = t.id)
         or exists (select 1 from public.student_targets st
                    where st.student_id = p_student_id and st.exam_type_id = t.id)
    ) x
  ), '[]');
end;
$$;

revoke all on function worker.bot_scores(bigint, uuid) from public;
grant execute on function worker.bot_scores(bigint, uuid) to uteach_worker;
