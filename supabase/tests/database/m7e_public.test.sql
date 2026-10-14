-- M7e · Public pages: anon reads only public, unarchived plans through public_plans(); the table stays closed.
-- Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.plans (code, name, student_limit, branch_limit, price_amount, is_public, sort_order)
values ('m7e_hidden', 'Hidden', 10, 1, 100000, false, 90),
       ('m7e_archived', 'Archived', 10, 1, 100000, true, 91);
update public.plans set archived_at = now() where code = 'm7e_archived';

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok($$ select 1 from public.plans $$, '42501', null, 'anon cannot read plans directly');
select ok((select count(*) from public.public_plans()) >= 3, 'anon sees the public plans');
select is(
  (select count(*) from public.public_plans() where code in ('trial', 'm7e_hidden', 'm7e_archived'))::int, 0,
  'trial, hidden and archived plans are left out');
select is(
  (select array_agg(code order by sort_order) from public.public_plans() where code in ('starter', 'growth', 'pro')),
  array['starter', 'growth', 'pro'],
  'plans come in sort order');
select is(
  (select student_limit from public.public_plans() where code = 'pro'), null::integer,
  'an unlimited plan has no student limit');

select set_config('role', 'authenticated', true);
select ok((select count(*) from public.public_plans()) >= 3, 'signed-in people can call it too');

select set_config('role', 'postgres', true);
select is(
  pg_get_function_result('public.public_plans()'::regprocedure),
  'TABLE(code text, name text, student_limit integer, branch_limit integer, price_amount bigint, currency character, sort_order smallint)',
  'only the public columns are returned (no features, ids or dates)');
select ok(not has_table_privilege('anon', 'public.plans', 'select'), 'anon still has no select on plans');

select * from finish();
rollback;
