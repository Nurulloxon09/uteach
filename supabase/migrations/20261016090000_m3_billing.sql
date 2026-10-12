-- M3 · Billing: lesson-cycle charges, payments with receipt numbers, adjustments, balances (FIFO) and debtors.
-- Spec: docs/spec/15-payments-debts.md, 02-data-model.md (Billing), 03-roles-permissions.md.
-- Money is bigint minor units everywhere; division happens only in private.div_round (half up), as in
-- packages/core/money. Financial rows are never deleted or edited in place: they are voided.

create type public.charge_status as enum ('open', 'void');
create type public.payment_method as enum ('cash', 'card', 'transfer', 'online');
create type public.adjustment_kind as enum (
  'opening_balance', 'waive', 'write_off', 'correction', 'refund', 'promo', 'unused_lessons'
);
create type public.account_kind as enum ('cash', 'terminal', 'bank', 'online');
create type public.billing_mode as enum ('lesson_cycle', 'calendar_month');
create type public.leave_credit_policy as enum ('ask', 'credit', 'no_credit');

-- ---------------------------------------------------------------------------
-- centers: billing settings
-- ---------------------------------------------------------------------------
alter table public.centers
  add column rounding_unit_amount bigint not null default 100000 check (rounding_unit_amount > 0),
  -- Only lesson-cycle billing is built (15); calendar_month waits for a center that needs it.
  add column billing_mode public.billing_mode not null default 'lesson_cycle'
    check (billing_mode = 'lesson_cycle'),
  add column leave_credit_policy public.leave_credit_policy not null default 'ask',
  add column payment_due_days smallint not null default 10 check (payment_due_days between 0 and 90);

grant update (rounding_unit_amount, leave_credit_policy, payment_due_days) on public.centers to authenticated;

-- ---------------------------------------------------------------------------
-- branches.code: the prefix of receipt numbers ({code}-{YYYY}-{000123})
-- ---------------------------------------------------------------------------
alter table public.branches add column code text;

-- A free code for a branch: initials of a multi-word name, else its first 3 letters (A–Z, 0–9 only), else
-- "BR"; a digit is appended while another branch of the center has it.
create function private.suggest_branch_code(p_center_id uuid, p_name text, p_exclude uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_words text[];
  v_base text;
  v_candidate text;
  v_n integer := 1;
begin
  select coalesce(array_agg(w), '{}') into v_words
  from unnest(regexp_split_to_array(upper(coalesce(p_name, '')), '[^A-Z0-9]+')) w
  where w <> '';
  if cardinality(v_words) >= 2 then
    select left(string_agg(left(w, 1), ''), 4) into v_base from unnest(v_words) w;
  elsif cardinality(v_words) = 1 then
    v_base := left(v_words[1], 3);
  end if;
  if v_base is null or length(v_base) < 2 then
    v_base := 'BR';
  end if;
  v_candidate := v_base;
  while exists (
    select 1 from public.branches b
    where b.center_id = p_center_id and b.code = v_candidate and b.id is distinct from p_exclude
  ) loop
    v_n := v_n + 1;
    v_candidate := left(v_base, 4) || v_n::text;
  end loop;
  return v_candidate;
end;
$$;

do $$
declare
  v_branch record;
begin
  for v_branch in select b.id, b.center_id, b.name from public.branches b order by b.created_at, b.id loop
    update public.branches
    set code = private.suggest_branch_code(v_branch.center_id, v_branch.name, v_branch.id)
    where id = v_branch.id;
  end loop;
end;
$$;

-- Empty = "suggest one" (the trigger below fills it in), so inserts that don't know a code stay valid.
alter table public.branches
  alter column code set default '',
  alter column code set not null,
  add constraint branches_code_format check (code ~ '^[A-Z0-9]{2,6}$'),
  add constraint branches_code_key unique (center_id, code);

create function private.branches_default_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is null or trim(new.code) = '' then
    new.code := private.suggest_branch_code(new.center_id, new.name, new.id);
  else
    new.code := upper(trim(new.code));
  end if;
  return new;
end;
$$;

create trigger branches_default_code before insert or update of code on public.branches
  for each row execute function private.branches_default_code();

grant insert (code) on public.branches to authenticated;
grant update (code) on public.branches to authenticated;

-- ---------------------------------------------------------------------------
-- accounts (where money sits); defaults per branch and per center
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid,
  kind public.account_kind not null,
  -- null = the default name for its kind (translated by the app).
  name text check (name is null or length(trim(name)) between 1 and 80),
  provider text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  foreign key (center_id, branch_id) references public.branches (center_id, id),
  check ((kind in ('cash', 'terminal')) = (branch_id is not null))
);

create trigger accounts_updated_at before update on public.accounts
  for each row execute function private.set_updated_at();

create function private.branch_default_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (center_id, branch_id, kind) values
    (new.center_id, new.id, 'cash'),
    (new.center_id, new.id, 'terminal');
  return null;
end;
$$;

create function private.center_default_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (center_id, kind) values (new.id, 'bank');
  return null;
end;
$$;

create trigger branches_default_accounts after insert on public.branches
  for each row execute function private.branch_default_accounts();
create trigger centers_default_accounts after insert on public.centers
  for each row execute function private.center_default_accounts();

insert into public.accounts (center_id, kind) select c.id, 'bank' from public.centers c;
insert into public.accounts (center_id, branch_id, kind)
select b.center_id, b.id, k.kind
from public.branches b
cross join (values ('cash'::public.account_kind), ('terminal'::public.account_kind)) k (kind);

-- ---------------------------------------------------------------------------
-- charges, payments, balance_adjustments, receipt_sequences
-- ---------------------------------------------------------------------------
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  enrollment_id uuid,
  cycle_no integer check (cycle_no is null or cycle_no > 0),
  cycle_start_date date not null,
  cycle_lessons smallint check (cycle_lessons is null or cycle_lessons between 1 and 100),
  due_date date not null,
  price_amount bigint not null check (price_amount >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  amount bigint not null check (amount >= 0),
  status public.charge_status not null default 'open',
  is_manual boolean not null default false,
  calc jsonb not null default '{}',
  reissue_of_id uuid references public.charges (id),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, enrollment_id) references public.enrollments (center_id, id),
  check (is_manual or (enrollment_id is not null and cycle_no is not null and cycle_lessons is not null)),
  check ((status = 'void') = (voided_at is not null)),
  check (status = 'open' or length(trim(coalesce(void_reason, ''))) > 0)
);

-- One open charge per enrollment and cycle: makes generation idempotent; a reissue takes the voided slot.
create unique index charges_cycle_open on public.charges (enrollment_id, cycle_no)
  where status = 'open' and not is_manual;
create index charges_student on public.charges (student_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  student_id uuid not null,
  account_id uuid not null,
  amount bigint not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  receipt_no text not null,
  receipt_path text,
  payer_name text check (payer_name is null or length(payer_name) <= 160),
  note text check (note is null or length(note) <= 500),
  received_by uuid references public.profiles (id),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, id),
  unique (center_id, receipt_no),
  foreign key (center_id, branch_id) references public.branches (center_id, id),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, account_id) references public.accounts (center_id, id),
  check (voided_at is null or length(trim(coalesce(void_reason, ''))) > 0)
);

create index payments_student on public.payments (student_id);
create index payments_center_paid on public.payments (center_id, paid_at desc);

create table public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  student_id uuid not null,
  kind public.adjustment_kind not null,
  -- Positive = in the student's favour (reduces debt).
  amount bigint not null check (amount <> 0),
  charge_id uuid,
  enrollment_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  -- What the system computed (e.g. {"unused": 7, "cycleLessons": 12}).
  details jsonb not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (center_id, student_id) references public.students (center_id, id),
  foreign key (center_id, charge_id) references public.charges (center_id, id),
  foreign key (center_id, enrollment_id) references public.enrollments (center_id, id),
  -- People write a reason; system adjustments (unused lessons, opening balances) carry `details` instead.
  check (kind in ('unused_lessons', 'opening_balance') or length(trim(coalesce(reason, ''))) > 0),
  check (voided_at is null or length(trim(coalesce(void_reason, ''))) > 0)
);

create index balance_adjustments_student on public.balance_adjustments (student_id);

-- Read and incremented only by private.next_receipt_no (no policies: no direct access).
create table public.receipt_sequences (
  center_id uuid not null references public.centers (id),
  branch_id uuid not null,
  year smallint not null,
  next_no integer not null default 1 check (next_no > 0),
  primary key (branch_id, year),
  foreign key (center_id, branch_id) references public.branches (center_id, id)
);

create trigger charges_updated_at before update on public.charges
  for each row execute function private.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();
create trigger balance_adjustments_updated_at before update on public.balance_adjustments
  for each row execute function private.set_updated_at();

create trigger charges_audit after insert or update or delete on public.charges
  for each row execute function private.audit_row();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function private.audit_row();
create trigger balance_adjustments_audit after insert or update or delete on public.balance_adjustments
  for each row execute function private.audit_row();

-- Financial rows are permanent (04-rules §2): no deletes, and an update may only void the row (payments may
-- also get their stored receipt path).
create function private.financial_row_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed text[] := array['status', 'voided_at', 'voided_by', 'void_reason', 'updated_at', 'receipt_path'];
begin
  if tg_op = 'DELETE' then
    raise exception 'financial_rows_permanent';
  end if;
  if (to_jsonb(new) - v_fixed) is distinct from (to_jsonb(old) - v_fixed) then
    raise exception 'financial_rows_permanent';
  end if;
  if (to_jsonb(old) ->> 'voided_at') is not null
     and (to_jsonb(new) - 'receipt_path') is distinct from (to_jsonb(old) - 'receipt_path') then
    raise exception 'already_voided';
  end if;
  return new;
end;
$$;

create function private.financial_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial_rows_permanent';
end;
$$;

create trigger charges_guard before update or delete on public.charges
  for each row execute function private.financial_row_guard();
create trigger payments_guard before update or delete on public.payments
  for each row execute function private.financial_row_guard();
create trigger balance_adjustments_guard before update or delete on public.balance_adjustments
  for each row execute function private.financial_row_guard();
create trigger charges_no_truncate before truncate on public.charges
  for each statement execute function private.financial_no_truncate();
create trigger payments_no_truncate before truncate on public.payments
  for each statement execute function private.financial_no_truncate();
create trigger balance_adjustments_no_truncate before truncate on public.balance_adjustments
  for each statement execute function private.financial_no_truncate();

-- The currency can't change once money has been charged (02: centers.currency).
create function private.centers_currency_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.charges c where c.center_id = new.id) then
    raise exception 'currency_locked';
  end if;
  return new;
end;
$$;

create trigger centers_currency_lock before update of currency on public.centers
  for each row execute function private.centers_currency_lock();

-- ---------------------------------------------------------------------------
-- Pure money helpers (mirrors of packages/core/money and billing; parity-tested)
-- ---------------------------------------------------------------------------
-- a / b rounded half up, for a ≥ 0 (amounts we bill) and b > 0.
create function private.div_round(p_a bigint, p_b bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (2 * p_a + p_b) / (2 * p_b);
$$;

-- computeCycleCharge (15): price → − percent discount (half up) → − fixed discount (not below 0) → rounded half
-- up to the center's unit. Returns every step for the `calc` column.
create function private.compute_cycle_charge(
  p_price bigint,
  p_discount_bp integer,
  p_discount_amount bigint,
  p_rounding_unit bigint
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_pct bigint := private.div_round(p_price * coalesce(p_discount_bp, 0), 10000);
  v_after_pct bigint := p_price - v_pct;
  v_after_fixed bigint := greatest(0, v_after_pct - coalesce(p_discount_amount, 0));
  v_amount bigint := private.div_round(v_after_fixed, p_rounding_unit) * p_rounding_unit;
begin
  return jsonb_build_object(
    'price', p_price,
    'discountBp', coalesce(p_discount_bp, 0),
    'percentOff', v_pct,
    'afterPercent', v_after_pct,
    'fixedOff', coalesce(p_discount_amount, 0),
    'afterFixed', v_after_fixed,
    'roundingUnit', p_rounding_unit,
    'amount', v_amount,
    'discount', p_price - v_after_fixed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cycles (15): billable lessons, numbered, split into cycles of `cycle_lessons`
-- ---------------------------------------------------------------------------
-- An enrollment's billable lessons in time order: not cancelled, billable, inside the enrollment's dates (and
-- p_until), not in a freeze. Attendance doesn't matter: absences count as used lessons.
create function private.billable_lessons(p_enrollment_id uuid, p_until date default null)
returns table (lesson_id uuid, local_date date, seq integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.local_date, (row_number() over (order by l.starts_at, l.id))::integer
  from public.enrollments e
  join public.lessons l on l.group_id = e.group_id
  where e.id = p_enrollment_id
    and l.status <> 'cancelled'
    and l.is_billable
    and l.local_date >= e.start_date
    and (e.end_date is null or l.local_date <= e.end_date)
    and (p_until is null or l.local_date <= p_until)
    and not exists (
      select 1 from public.enrollment_freezes f
      where f.enrollment_id = e.id and l.local_date between f.from_date and f.to_date
    );
$$;

-- Each open cycle charge with its window of billable lessons: how many are in it (in_window, at most
-- cycle_lessons), how many happened by today (used, branch tz), and the first and last lesson dates.
create function private.charge_windows(p_enrollment_id uuid, p_until date default null)
returns table (
  charge_id uuid,
  cycle_no integer,
  cycle_lessons smallint,
  amount bigint,
  in_window integer,
  used integer,
  first_date date,
  last_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select ch.id, ch.cycle_no, ch.cycle_lessons, ch.amount,
           coalesce(sum(ch.cycle_lessons) over (
             order by ch.cycle_no rows between unbounded preceding and 1 preceding
           ), 0)::integer as before
    from public.charges ch
    where ch.enrollment_id = p_enrollment_id and ch.status = 'open' and not ch.is_manual
  ),
  t as (
    select private.today_in(b.timezone) as today
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    join public.branches b on b.id = g.branch_id
    where e.id = p_enrollment_id
  ),
  bl as (
    select * from private.billable_lessons(p_enrollment_id, p_until)
  )
  select c.id, c.cycle_no, c.cycle_lessons, c.amount,
         count(bl.seq)::integer,
         (count(bl.seq) filter (where bl.local_date <= t.today))::integer,
         min(bl.local_date),
         max(bl.local_date)
  from c
  cross join t
  left join bl on bl.seq > c.before and bl.seq <= c.before + c.cycle_lessons
  group by c.id, c.cycle_no, c.cycle_lessons, c.amount, t.today
  order by c.cycle_no;
$$;

-- The price of a cycle starting on p_day: the student's own price, else the group price effective that day;
-- cycle length from the group price (12 when only an own price exists). Null when there is no price.
create function private.cycle_price(p_enrollment_id uuid, p_day date)
returns table (price bigint, cycle_lessons smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(e.price_override_amount, gp.price_amount), coalesce(gp.cycle_lessons, 12::smallint)
  from public.enrollments e
  left join lateral (
    select p.price_amount, p.cycle_lessons from public.group_prices p
    where p.group_id = e.group_id and p.effective_from <= p_day
    order by p.effective_from desc limit 1
  ) gp on true
  where e.id = p_enrollment_id and coalesce(e.price_override_amount, gp.price_amount) is not null;
$$;

-- Creates the next cycle's charge when it's due (15): cycle 1 at the first billable lesson; cycle n+1 once
-- cycle n has all its lessons and the last one is today or earlier, and there is a next billable lesson.
-- Nothing while frozen, after the end, or without a price. Idempotent (unique open cycle). Returns the id.
create function private.create_next_charge(p_enrollment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments;
  v_center public.centers;
  v_today date;
  v_last record;
  v_offset integer;
  v_next date;
  v_price record;
  v_calc jsonb;
  v_cycle integer;
  v_id uuid;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id for update;
  if not found or v_e.status <> 'active' then
    return null;
  end if;
  select c.* into v_center from public.centers c where c.id = v_e.center_id;
  select private.today_in(b.timezone) into v_today
  from public.groups g join public.branches b on b.id = g.branch_id where g.id = v_e.group_id;

  select w.* into v_last from private.charge_windows(p_enrollment_id) w order by w.cycle_no desc limit 1;
  if v_last.charge_id is not null
     and (v_last.in_window < v_last.cycle_lessons or v_last.last_date > v_today) then
    return null;
  end if;
  select coalesce(sum(w.cycle_lessons), 0)::integer, coalesce(max(w.cycle_no), 0)
  into v_offset, v_cycle
  from private.charge_windows(p_enrollment_id) w;

  select b.local_date into v_next from private.billable_lessons(p_enrollment_id) b where b.seq = v_offset + 1;
  if v_next is null then
    return null;
  end if;
  select p.* into v_price from private.cycle_price(p_enrollment_id, v_next) p;
  if v_price.price is null then
    return null;
  end if;

  v_calc := private.compute_cycle_charge(
    v_price.price, v_e.discount_bp, v_e.discount_amount, v_center.rounding_unit_amount
  ) || jsonb_build_object(
    'cycleLessons', v_price.cycle_lessons,
    'priceOverride', v_e.price_override_amount is not null
  );
  insert into public.charges (
    center_id, student_id, enrollment_id, cycle_no, cycle_start_date, cycle_lessons, due_date,
    price_amount, discount_amount, amount, calc, created_by
  )
  values (
    v_e.center_id, v_e.student_id, v_e.id, v_cycle + 1, v_next, v_price.cycle_lessons,
    v_next + v_center.payment_due_days, v_price.price, (v_calc ->> 'discount')::bigint,
    (v_calc ->> 'amount')::bigint, v_calc, null
  )
  on conflict (enrollment_id, cycle_no) where status = 'open' and not is_manual do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Catches an enrollment up: creates every charge that is due by now. Returns how many.
create function private.generate_charges_for(p_enrollment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  while v_count < 60 and private.create_next_charge(p_enrollment_id) is not null loop
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- pg_cron `generate_cycle_charges` (hourly; idempotent).
create function private.generate_cycle_charges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in select e.id from public.enrollments e where e.status = 'active' loop
    v_count := v_count + private.generate_charges_for(v_id);
  end loop;
  return v_count;
end;
$$;

-- What ending on p_end_date leaves unused (15): per partly used cycle, unused lessons and their value
-- (prorated, half up to the tiyin). Cycles with no lesson by then are listed with in_window = 0.
create function private.unused_after(p_enrollment_id uuid, p_end_date date)
returns table (charge_id uuid, in_window integer, cycle_lessons smallint, unused integer, credit bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select w.charge_id, w.in_window, w.cycle_lessons,
         (w.cycle_lessons - w.in_window)::integer,
         case when w.in_window > 0 then
           private.div_round(w.amount * (w.cycle_lessons - w.in_window), w.cycle_lessons)
         else 0 end
  from private.charge_windows(p_enrollment_id, p_end_date) w
  where w.in_window < w.cycle_lessons;
$$;

-- After an end or transfer (15): void cycles that hadn't started by the end date and, when p_credit, credit
-- the unused lessons of the started one.
create function private.close_enrollment_billing(p_enrollment_id uuid, p_credit boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments;
  v_row record;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  for v_row in select * from private.unused_after(p_enrollment_id, v_e.end_date) loop
    if v_row.in_window = 0 then
      update public.charges
      set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = 'enrollment_ended'
      where id = v_row.charge_id;
    elsif p_credit and v_row.credit > 0 then
      insert into public.balance_adjustments (
        center_id, student_id, kind, amount, charge_id, enrollment_id, details
      )
      values (
        v_e.center_id, v_e.student_id, 'unused_lessons', v_row.credit, v_row.charge_id, v_e.id,
        jsonb_build_object('unused', v_row.unused, 'cycleLessons', v_row.cycle_lessons)
      );
    end if;
  end loop;
end;
$$;

-- The M1 billing hook, filled in: new enrollments get their due charges at once. Freezes need nothing (the cycle
-- simply pauses); ends and transfers are settled by close_enrollment_billing in their RPCs.
create or replace function private.on_enrollment_change(p_enrollment_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action in ('enroll', 'transfer_in') then
    perform private.generate_charges_for(p_enrollment_id);
  elsif p_action = 'transfer_out' then
    perform private.close_enrollment_billing(p_enrollment_id, true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------------
-- payments + adjustments − open charges (negative = debt).
create function private.student_balance(p_student_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select sum(p.amount) from public.payments p where p.student_id = p_student_id and p.voided_at is null), 0)
    + coalesce((select sum(a.amount) from public.balance_adjustments a
                where a.student_id = p_student_id and a.voided_at is null), 0)
    - coalesce((select sum(c.amount) from public.charges c where c.student_id = p_student_id and c.status = 'open'), 0)
  )::bigint;
$$;

-- What each open debt item of a student still owes, FIFO (15): items are open charges and negative
-- adjustments (e.g. an imported opening debt), oldest due first; payments and positive adjustments cover them.
create function private.debt_items(p_student_id uuid)
returns table (
  item_id uuid,
  item_kind text,
  charge_id uuid,
  adjustment_id uuid,
  center_id uuid,
  student_id uuid,
  due_date date,
  amount bigint,
  covered bigint,
  outstanding bigint,
  days_overdue integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with items as (
    select c.id, 'charge'::text as kind, c.id as charge_id, null::uuid as adjustment_id, c.center_id,
           c.student_id, c.due_date, c.amount, c.created_at
    from public.charges c
    where c.student_id = p_student_id and c.status = 'open' and c.amount > 0
    union all
    select a.id, 'adjustment', null, a.id, a.center_id, a.student_id,
           (a.created_at at time zone ce.timezone)::date, -a.amount, a.created_at
    from public.balance_adjustments a
    join public.centers ce on ce.id = a.center_id
    where a.student_id = p_student_id and a.voided_at is null and a.amount < 0
  ),
  credit as (
    select (
      coalesce((select sum(p.amount) from public.payments p
                where p.student_id = p_student_id and p.voided_at is null), 0)
      + coalesce((select sum(a.amount) from public.balance_adjustments a
                  where a.student_id = p_student_id and a.voided_at is null and a.amount > 0), 0)
    )::bigint as total
  ),
  ordered as (
    select i.*, coalesce(sum(i.amount) over (
             order by i.due_date, i.created_at, i.id rows between unbounded preceding and 1 preceding
           ), 0)::bigint as before
    from items i
  )
  select o.id, o.kind, o.charge_id, o.adjustment_id, o.center_id, o.student_id, o.due_date, o.amount,
         least(o.amount, greatest(0, cr.total - o.before))::bigint,
         (o.amount - least(o.amount, greatest(0, cr.total - o.before)))::bigint,
         case when o.amount - least(o.amount, greatest(0, cr.total - o.before)) > 0
              then greatest(0, private.today_in(ce.timezone) - o.due_date) else 0 end
  from ordered o
  cross join credit cr
  join public.centers ce on ce.id = o.center_id;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.balance_adjustments enable row level security;
alter table public.receipt_sequences enable row level security;

create policy accounts_select on public.accounts
  for select to authenticated
  using (private.has_perm(center_id, 'billing') or private.has_perm(center_id, 'payments'));

-- Money is visible to staff with `billing` in the student's branch (03). Teachers: nothing.
create policy charges_select on public.charges
  for select to authenticated
  using (
    private.has_perm(center_id, 'billing') and private.has_branch(center_id, private.student_branch(student_id))
  );

create policy payments_select on public.payments
  for select to authenticated
  using (
    (private.has_perm(center_id, 'billing') or private.has_perm(center_id, 'payments'))
    and private.has_branch(center_id, private.student_branch(student_id))
  );

create policy balance_adjustments_select on public.balance_adjustments
  for select to authenticated
  using (
    private.has_perm(center_id, 'billing') and private.has_branch(center_id, private.student_branch(student_id))
  );

revoke all on public.accounts, public.charges, public.payments, public.balance_adjustments,
  public.receipt_sequences from anon, authenticated;
grant select on public.accounts, public.charges, public.payments, public.balance_adjustments to authenticated;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: the RLS above applies)
-- ---------------------------------------------------------------------------
create view public.charge_cycles with (security_invoker = true) as
select ch.id as charge_id, ch.center_id, ch.student_id, ch.enrollment_id, ch.cycle_no, ch.cycle_lessons,
       ch.cycle_start_date, ch.due_date, ch.amount,
       w.first_date as first_lesson_date,
       case when w.in_window = ch.cycle_lessons then w.last_date end as expected_last_date,
       w.used as lessons_used,
       (ch.cycle_lessons - w.used)::integer as lessons_left
from public.charges ch
cross join lateral private.charge_windows(ch.enrollment_id) w
where w.charge_id = ch.id;

create view public.student_balances with (security_invoker = true) as
select s.id as student_id, s.center_id, s.branch_id,
       coalesce(c.total, 0)::bigint as charged,
       coalesce(p.total, 0)::bigint as paid,
       coalesce(a.total, 0)::bigint as adjusted,
       (coalesce(p.total, 0) + coalesce(a.total, 0) - coalesce(c.total, 0))::bigint as balance
from public.students s
left join (
  select x.student_id, sum(x.amount) as total from public.charges x where x.status = 'open' group by x.student_id
) c on c.student_id = s.id
left join (
  select x.student_id, sum(x.amount) as total from public.payments x where x.voided_at is null group by x.student_id
) p on p.student_id = s.id
left join (
  select x.student_id, sum(x.amount) as total from public.balance_adjustments x
  where x.voided_at is null group by x.student_id
) a on a.student_id = s.id
where private.has_perm(s.center_id, 'billing');

create view public.charge_debts with (security_invoker = true) as
select d.*
from public.students s
cross join lateral private.debt_items(s.id) d
where private.has_perm(s.center_id, 'billing');

create view public.debtors with (security_invoker = true) as
select b.student_id, b.center_id, b.branch_id, (-b.balance)::bigint as debt,
       d.oldest_due_date,
       coalesce(d.max_days_overdue, 0) as max_days_overdue,
       coalesce(d.max_days_overdue, 0) > 0 as is_overdue,
       case
         when coalesce(d.max_days_overdue, 0) <= 30 then '0-30'
         when d.max_days_overdue <= 60 then '31-60'
         when d.max_days_overdue <= 90 then '61-90'
         else '90+'
       end as aging_bucket
from public.student_balances b
left join lateral (
  select min(cd.due_date) filter (where cd.outstanding > 0) as oldest_due_date,
         max(cd.days_overdue) as max_days_overdue
  from public.charge_debts cd
  where cd.student_id = b.student_id
) d on true
where b.balance < 0;

revoke all on public.charge_cycles, public.student_balances, public.charge_debts, public.debtors
  from anon, authenticated;
grant select on public.charge_cycles, public.student_balances, public.charge_debts, public.debtors
  to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: payment_received to guardians who receive billing messages (17)
-- ---------------------------------------------------------------------------
-- Adds the 'billing' audience: guardians with receives_billing, else the student.
create or replace function private.enqueue_notification(
  p_center_id uuid,
  p_template_key text,
  p_student_id uuid,
  p_payload jsonb,
  p_dedupe_base text,
  p_send_after timestamptz,
  p_audience text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
  v_send_after timestamptz;
  v_count integer;
begin
  if p_audience not in ('guardians_or_student', 'student_and_guardians', 'billing') then
    raise exception 'invalid audience %', p_audience;
  end if;
  select c.* into v_center from public.centers c where c.id = p_center_id;
  v_send_after := private.apply_quiet_hours(
    coalesce(p_send_after, now()), v_center.timezone, v_center.quiet_hours_start, v_center.quiet_hours_end
  );

  with guardians as (
    select g.id, g.locale
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student_id and g.archived_at is null
      and case when p_audience = 'billing' then sg.receives_billing else sg.receives_notifications end
  ),
  recipients as (
    select null::uuid as student_id, gu.id as guardian_id, coalesce(gu.locale, v_center.default_locale) as locale
    from guardians gu
    union all
    select p_student_id, null::uuid, v_center.default_locale
    where p_audience = 'student_and_guardians' or not exists (select 1 from guardians)
  )
  insert into public.notification_outbox as o (
    center_id, template_key, locale, payload, student_id, guardian_id, dedupe_key, send_after
  )
  select p_center_id, p_template_key, r.locale, p_payload, r.student_id, r.guardian_id,
         p_dedupe_base || ':' || coalesce(r.guardian_id, r.student_id), v_send_after
  from recipients r
  on conflict (center_id, dedupe_key) where dedupe_key is not null do update
  set status = 'pending',
      send_after = excluded.send_after,
      payload = excluded.payload,
      locale = excluded.locale,
      attempts = 0,
      last_error = null,
      locked_at = null
  where o.status = 'cancelled';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

insert into public.notification_templates (center_id, key, channel, locale, body) values
  (null, 'payment_received', 'telegram', 'uz',
   '{student} uchun toʻlov qabul qilindi: {amount}. Kvitansiya {receiptNo}. Balans: {balance}.'),
  (null, 'payment_received', 'telegram', 'ru',
   'Получена оплата за {student}: {amount}. Квитанция {receiptNo}. Баланс: {balance}.'),
  (null, 'payment_received', 'telegram', 'en',
   'Payment received for {student}: {amount}. Receipt {receiptNo}. Balance: {balance}.');

-- ---------------------------------------------------------------------------
-- RPCs: payments and receipts
-- ---------------------------------------------------------------------------
-- The next receipt number of a branch for a year, gap-free: the row lock of `insert … on conflict do update`
-- serialises concurrent payments, and a rolled-back payment rolls its number back too.
create function private.next_receipt_no(p_branch_id uuid, p_year smallint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_no integer;
begin
  select b.* into v_branch from public.branches b where b.id = p_branch_id;
  insert into public.receipt_sequences as s (center_id, branch_id, year, next_no)
  values (v_branch.center_id, p_branch_id, p_year, 2)
  on conflict (branch_id, year) do update set next_no = s.next_no + 1
  returning s.next_no - 1 into v_no;
  return format('%s-%s-%s', v_branch.code, p_year, lpad(v_no::text, 6, '0'));
end;
$$;

-- Records a payment (15): `payments` flag in the student's branch; the account defaults by method (cash →
-- branch cash, card → branch terminal, transfer → center bank); backdating over 7 days needs `void`.
-- Returns {paymentId, receiptNo, balance}. Queues `payment_received`.
create function public.record_payment(
  p_student_id uuid,
  p_amount bigint,
  p_method public.payment_method,
  p_account_id uuid default null,
  p_paid_at timestamptz default null,
  p_payer_name text default null,
  p_note text default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_center public.centers;
  v_branch public.branches;
  v_account public.accounts;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_receipt text;
  v_id uuid;
  v_balance bigint;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_student.center_id);
  select c.* into v_center from public.centers c where c.id = v_student.center_id;
  select b.* into v_branch from public.branches b
  where b.id = coalesce(p_branch_id, v_student.branch_id) and b.center_id = v_student.center_id;
  if not found then
    raise exception 'invalid_branch';
  end if;
  perform private.require(
    private.has_perm(v_student.center_id, 'payments')
    and private.has_branch(v_student.center_id, v_student.branch_id)
    and private.has_branch(v_student.center_id, v_branch.id)
  );
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if p_method = 'online' then
    raise exception 'invalid_method';
  end if;
  if v_paid_at > now() + interval '5 minutes' then
    raise exception 'invalid_dates';
  end if;
  if v_paid_at < now() - interval '7 days' and not private.has_perm(v_student.center_id, 'void') then
    raise exception 'backdate_limit';
  end if;

  if p_account_id is null then
    select a.* into v_account from public.accounts a
    where a.center_id = v_student.center_id and a.is_active
      and case p_method
            when 'cash' then a.kind = 'cash' and a.branch_id = v_branch.id
            when 'card' then a.kind = 'terminal' and a.branch_id = v_branch.id
            else a.kind = 'bank'
          end
    order by a.created_at limit 1;
  else
    select a.* into v_account from public.accounts a
    where a.id = p_account_id and a.center_id = v_student.center_id and a.is_active
      and (a.branch_id is null or a.branch_id = v_branch.id);
  end if;
  if v_account.id is null then
    raise exception 'invalid_account';
  end if;

  v_receipt := private.next_receipt_no(
    v_branch.id, extract(year from (v_paid_at at time zone v_branch.timezone))::smallint
  );
  insert into public.payments (
    center_id, branch_id, student_id, account_id, amount, method, paid_at, receipt_no, payer_name, note,
    received_by
  )
  values (
    v_student.center_id, v_branch.id, v_student.id, v_account.id, p_amount, p_method, v_paid_at, v_receipt,
    nullif(trim(p_payer_name), ''), nullif(trim(p_note), ''), auth.uid()
  )
  returning id into v_id;

  v_balance := private.student_balance(v_student.id);
  perform private.enqueue_notification(
    v_student.center_id, 'payment_received', v_student.id,
    jsonb_build_object(
      'paymentId', v_id, 'studentId', v_student.id, 'student', v_student.full_name, 'center', v_center.name,
      'amount', p_amount::text, 'currency', v_center.currency, 'receiptNo', v_receipt,
      'balance', v_balance::text
    ),
    format('payment:%s', v_id), now(), 'billing'
  );
  return jsonb_build_object('paymentId', v_id, 'receiptNo', v_receipt, 'balance', v_balance);
end;
$$;

-- A student's balance for the payment dialog (billing or payments flag).
create function public.student_balance(p_student_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require(
    (private.has_perm(v_student.center_id, 'billing') or private.has_perm(v_student.center_id, 'payments'))
    and private.has_branch(v_student.center_id, v_student.branch_id)
  );
  return private.student_balance(p_student_id);
end;
$$;

-- Voids need the `void` flag and a reason (03, 15). The row stays; balances recompute.
create function private.require_void(p_center_id uuid, p_student_id uuid, p_reason text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_writable(p_center_id);
  perform private.require(
    private.has_perm(p_center_id, 'void') and private.has_branch(p_center_id, private.student_branch(p_student_id))
  );
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'void_reason_required';
  end if;
end;
$$;

create function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select p.* into v_payment from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_void(v_payment.center_id, v_payment.student_id, p_reason);
  if v_payment.voided_at is not null then
    raise exception 'already_voided';
  end if;
  update public.payments
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_payment_id;
  perform private.cancel_pending_notifications(v_payment.center_id, format('payment:%s:', p_payment_id));
end;
$$;

-- Voids a charge; with p_reissue a cycle charge is issued again for the same cycle at today's price and
-- discount (e.g. after fixing a discount). Returns the new charge id, if any.
create function public.void_charge(p_charge_id uuid, p_reason text, p_reissue boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.charges;
  v_e public.enrollments;
  v_center public.centers;
  v_price record;
  v_calc jsonb;
  v_id uuid;
begin
  select c.* into v_charge from public.charges c where c.id = p_charge_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_void(v_charge.center_id, v_charge.student_id, p_reason);
  if v_charge.status = 'void' then
    raise exception 'already_voided';
  end if;
  update public.charges
  set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_charge_id;

  if coalesce(p_reissue, false) and not v_charge.is_manual then
    select e.* into v_e from public.enrollments e where e.id = v_charge.enrollment_id;
    select c.* into v_center from public.centers c where c.id = v_charge.center_id;
    select p.* into v_price from private.cycle_price(v_e.id, v_charge.cycle_start_date) p;
    if v_price.price is null then
      return null;
    end if;
    v_calc := private.compute_cycle_charge(
      v_price.price, v_e.discount_bp, v_e.discount_amount, v_center.rounding_unit_amount
    ) || jsonb_build_object('cycleLessons', v_charge.cycle_lessons, 'reissueOf', v_charge.id);
    insert into public.charges (
      center_id, student_id, enrollment_id, cycle_no, cycle_start_date, cycle_lessons, due_date,
      price_amount, discount_amount, amount, calc, reissue_of_id
    )
    values (
      v_charge.center_id, v_charge.student_id, v_charge.enrollment_id, v_charge.cycle_no,
      v_charge.cycle_start_date, v_charge.cycle_lessons, v_charge.due_date, v_price.price,
      (v_calc ->> 'discount')::bigint, (v_calc ->> 'amount')::bigint, v_calc, v_charge.id
    )
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Waive (a charge's outstanding part), write-off (the whole debt) or correction (any signed amount), each with
-- a reason; `adjustments` flag (03). Amount null = computed for waive and write-off. Returns the id.
create function public.add_adjustment(
  p_student_id uuid,
  p_kind public.adjustment_kind,
  p_amount bigint,
  p_reason text,
  p_charge_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_amount bigint := p_amount;
  v_id uuid;
begin
  select s.* into v_student from public.students s where s.id = p_student_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_student.center_id);
  perform private.require(
    private.has_perm(v_student.center_id, 'adjustments')
    and private.has_branch(v_student.center_id, v_student.branch_id)
  );
  if p_kind not in ('waive', 'write_off', 'correction') then
    raise exception 'invalid_adjustment';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required';
  end if;

  if p_kind = 'waive' then
    if p_charge_id is null or not exists (
      select 1 from public.charges c where c.id = p_charge_id and c.student_id = p_student_id and c.status = 'open'
    ) then
      raise exception 'not_found';
    end if;
    if v_amount is null then
      select d.outstanding into v_amount from private.debt_items(p_student_id) d where d.charge_id = p_charge_id;
    end if;
    if coalesce(v_amount, 0) <= 0 then
      raise exception 'nothing_to_waive';
    end if;
  elsif p_kind = 'write_off' then
    v_amount := coalesce(v_amount, -private.student_balance(p_student_id));
    if v_amount <= 0 then
      raise exception 'nothing_to_write_off';
    end if;
  elsif coalesce(v_amount, 0) = 0 then
    raise exception 'invalid_amount';
  end if;

  insert into public.balance_adjustments (center_id, student_id, kind, amount, charge_id, reason)
  values (v_student.center_id, p_student_id, p_kind, v_amount, p_charge_id, trim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.void_adjustment(p_adjustment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adj public.balance_adjustments;
begin
  select a.* into v_adj from public.balance_adjustments a where a.id = p_adjustment_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_void(v_adj.center_id, v_adj.student_id, p_reason);
  if v_adj.voided_at is not null then
    raise exception 'already_voided';
  end if;
  update public.balance_adjustments
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_adjustment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: ending an enrollment (unused lessons) and the import of opening balances
-- ---------------------------------------------------------------------------
-- What the End dialog shows (15): unused lessons and their credit if the enrollment ended on p_end_date, and
-- the center's policy. The amount is null without `billing`.
create function public.unused_lessons_preview(p_enrollment_id uuid, p_end_date date)
returns table (unused integer, credit bigint, policy public.leave_credit_policy)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments;
  v_group public.groups;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if not found then
    raise exception 'not_found';
  end if;
  select g.* into v_group from public.groups g where g.id = v_e.group_id;
  perform private.require(
    private.has_perm(v_e.center_id, 'students') and private.has_branch(v_e.center_id, v_group.branch_id)
  );
  return query
  select coalesce(sum(u.unused) filter (where u.in_window > 0), 0)::integer,
         case when private.has_perm(v_e.center_id, 'billing')
              then coalesce(sum(u.credit), 0)::bigint end,
         (select c.leave_credit_policy from public.centers c where c.id = v_e.center_id)
  from private.unused_after(p_enrollment_id, p_end_date) u;
end;
$$;

drop function public.end_enrollment(uuid, date, public.enrollment_end_reason);

-- Sets the last billable day (12) and settles billing (15): cycles not started by then are voided; the
-- started one's unused lessons are credited per the center's policy (`ask` → p_credit is required).
create function public.end_enrollment(
  p_enrollment_id uuid,
  p_end_date date,
  p_reason public.enrollment_end_reason,
  p_credit boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
  v_policy public.leave_credit_policy;
  v_credit boolean;
begin
  v_enrollment := private.enrollment_for_edit(p_enrollment_id);
  if p_reason = 'transferred' then
    raise exception 'use_transfer';
  end if;
  if p_end_date < v_enrollment.start_date then
    raise exception 'invalid_dates';
  end if;
  update public.enrollments set end_date = p_end_date, end_reason = p_reason where id = p_enrollment_id;
  update public.enrollments set status = private.enrollment_status_for(id) where id = p_enrollment_id;

  select c.leave_credit_policy into v_policy from public.centers c where c.id = v_enrollment.center_id;
  v_credit := case v_policy when 'credit' then true when 'no_credit' then false else p_credit end;
  if v_credit is null
     and exists (select 1 from private.unused_after(p_enrollment_id, p_end_date) u where u.credit > 0) then
    raise exception 'credit_choice_required';
  end if;
  perform private.close_enrollment_billing(p_enrollment_id, coalesce(v_credit, false));
end;
$$;

-- Opening balances (15, M1d import): rows [{externalRef, phone, fullName, amount (signed minor units),
-- note}]. Negative = an existing debt, positive = prepaid. A student is matched by external ref, else by phone +
-- name; a student who already has an opening balance is skipped. All or nothing. Returns {created, skipped}.
create function public.import_opening_balances(p_job_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_row jsonb;
  v_student uuid;
  v_amount bigint;
  v_created integer := 0;
  v_skipped integer := 0;
begin
  v_job := private.import_job_for(p_job_id, 'opening_balances');
  perform private.require(private.has_perm(v_job.center_id, 'adjustments'));

  for v_row in select value from jsonb_array_elements(p_rows) loop
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
    if v_student is null then
      raise exception 'import_student_not_found';
    end if;
    perform private.require(private.has_branch(v_job.center_id, private.student_branch(v_student)));
    begin
      v_amount := (v_row ->> 'amount')::bigint;
    exception when others then
      raise exception 'invalid_amount';
    end;
    if v_amount is null or v_amount = 0 then
      raise exception 'invalid_amount';
    end if;
    if exists (
      select 1 from public.balance_adjustments a
      where a.student_id = v_student and a.kind = 'opening_balance' and a.voided_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.balance_adjustments (center_id, student_id, kind, amount, reason, details)
    values (
      v_job.center_id, v_student, 'opening_balance', v_amount, nullif(trim(v_row ->> 'note'), ''),
      jsonb_build_object('importJobId', p_job_id)
    );
    v_created := v_created + 1;
  end loop;

  perform private.finish_import_job(p_job_id, jsonb_array_length(p_rows));
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- Saving weekly times may give students their first billable lessons: charge them right away (15).
create or replace function public.save_schedule_rules(p_group_id uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_result jsonb;
  v_enrollment uuid;
begin
  select g.* into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.require_writable(v_group.center_id);
  perform private.require(
    private.has_perm(v_group.center_id, 'academics') and private.has_branch(v_group.center_id, v_group.branch_id)
  );
  v_result := private.apply_schedule_rules(p_group_id, p_rules);
  for v_enrollment in select e.id from public.enrollments e where e.group_id = p_group_id and e.status = 'active' loop
    perform private.generate_charges_for(v_enrollment);
  end loop;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and the scheduled job
-- ---------------------------------------------------------------------------
revoke all on function public.record_payment(uuid, bigint, public.payment_method, uuid, timestamptz, text, text, uuid)
  from public, anon;
revoke all on function public.student_balance(uuid) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
revoke all on function public.void_charge(uuid, text, boolean) from public, anon;
revoke all on function public.add_adjustment(uuid, public.adjustment_kind, bigint, text, uuid) from public, anon;
revoke all on function public.void_adjustment(uuid, text) from public, anon;
revoke all on function public.unused_lessons_preview(uuid, date) from public, anon;
revoke all on function public.end_enrollment(uuid, date, public.enrollment_end_reason, boolean) from public, anon;
revoke all on function public.import_opening_balances(uuid, jsonb) from public, anon;

grant execute on function public.record_payment(uuid, bigint, public.payment_method, uuid, timestamptz, text, text, uuid)
  to authenticated;
grant execute on function public.student_balance(uuid) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.void_charge(uuid, text, boolean) to authenticated;
grant execute on function public.add_adjustment(uuid, public.adjustment_kind, bigint, text, uuid) to authenticated;
grant execute on function public.void_adjustment(uuid, text) to authenticated;
grant execute on function public.unused_lessons_preview(uuid, date) to authenticated;
grant execute on function public.end_enrollment(uuid, date, public.enrollment_end_reason, boolean) to authenticated;
grant execute on function public.import_opening_balances(uuid, jsonb) to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('generate_cycle_charges', '30 * * * *', 'select private.generate_cycle_charges()');
  end if;
end;
$$;
