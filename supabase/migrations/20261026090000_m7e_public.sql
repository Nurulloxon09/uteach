-- M7e · Public pages: visitors read the public plans through one function; `plans` itself stays closed to anon.

create function public.public_plans()
returns table (
  code text,
  name text,
  student_limit integer,
  branch_limit integer,
  price_amount bigint,
  currency char(3),
  sort_order smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.name, p.student_limit, p.branch_limit, p.price_amount, p.currency, p.sort_order
  from public.plans p
  where p.is_public and p.archived_at is null and p.code <> 'trial'
  order by p.sort_order, p.price_amount, p.code;
$$;

revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated, service_role;
