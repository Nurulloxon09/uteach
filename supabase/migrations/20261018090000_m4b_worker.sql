-- M4b · worker & SMS: what the bot needs for receipts, and the per-phone OTP limit of the auth SMS hook.
-- Spec: docs/spec/17-telegram-notifications.md, 10-platform-onboarding.md (OTP limit), 02-data-model.md.

-- ---------------------------------------------------------------------------
-- Per-phone OTP limit (10): 5 codes per phone per hour, logged by the auth SMS hook (service role)
-- ---------------------------------------------------------------------------
create table private.otp_sends (
  id bigint generated always as identity primary key,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz not null default now()
);

create index otp_sends_phone on private.otp_sends (phone_hash, sent_at);

revoke all on private.otp_sends from public, anon, authenticated, service_role;

-- Records a code for the phone (sha-256 hex of the E.164 number) if it is under the limit. Returns false when
-- 5 codes went to that phone in the last hour (the hook then refuses to send). Service role only.
create function public.record_otp_send(p_phone_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_phone';
  end if;
  -- One phone's sends are serialised, so two parallel requests can't both take the 5th slot.
  perform pg_advisory_xact_lock(hashtextextended(p_phone_hash, 0));
  if (select count(*) from private.otp_sends s
      where s.phone_hash = p_phone_hash and s.sent_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into private.otp_sends (phone_hash) values (p_phone_hash);
  return true;
end;
$$;

create function private.prune_otp_sends()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.otp_sends where sent_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_otp_send(text) from public, anon, authenticated;
grant execute on function public.record_otp_send(text) to service_role;

-- ---------------------------------------------------------------------------
-- Receipts in Telegram (15, 17): what the PDF prints, read by the worker
-- ---------------------------------------------------------------------------
-- A payment's receipt fields. With p_telegram_user_id (the bot's Payments menu) the payment's student must be
-- one the user is linked to; without it (the outbox's `payment_received`) the payment comes from the row itself.
create function worker.receipt_data(p_payment_id uuid, p_telegram_user_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student uuid;
begin
  select p.student_id into v_student from public.payments p where p.id = p_payment_id;
  if v_student is null then
    raise exception 'not_found';
  end if;
  if p_telegram_user_id is not null then
    perform worker.require_subject(p_telegram_user_id, v_student);
  end if;
  return (
    select jsonb_build_object(
      'paymentId', p.id, 'receiptNo', p.receipt_no, 'amount', p.amount::text, 'method', p.method,
      'paidAt', p.paid_at, 'payerName', p.payer_name, 'voided', p.voided_at is not null,
      'voidReason', p.void_reason, 'student', s.full_name, 'centerName', c.name, 'currency', c.currency,
      'timezone', b.timezone, 'branchName', b.name, 'branchAddress', b.address, 'branchPhone', b.phone
    )
    from public.payments p
    join public.students s on s.id = p.student_id
    join public.centers c on c.id = p.center_id
    join public.branches b on b.id = p.branch_id
    where p.id = p_payment_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The bot: deep links and the subject list with each center's timezone and currency
-- ---------------------------------------------------------------------------
-- `t.me/<bot>?start=c_{slug}` (17): the center a deep link points at, if it exists.
create function worker.center_by_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.centers c where c.slug = p_slug::extensions.citext and c.status <> 'cancelled';
$$;

drop function worker.bot_subjects(bigint);
create function worker.bot_subjects(p_telegram_user_id bigint)
returns table (
  center_id uuid,
  center_name text,
  timezone text,
  currency text,
  student_id uuid,
  student_name text,
  relation text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (s.id) s.center_id, c.name, c.timezone, c.currency::text, s.id, s.full_name,
         case when l.student_id is not null then 'self' else 'child' end
  from public.telegram_links l
  left join public.student_guardians sg on sg.guardian_id = l.guardian_id
  join public.students s on s.id = coalesce(l.student_id, sg.student_id)
  join public.centers c on c.id = s.center_id
  where l.telegram_user_id = p_telegram_user_id and l.unlinked_at is null
    and l.membership_id is null and s.archived_at is null
  order by s.id, (l.student_id is null);
$$;

revoke all on all functions in schema worker from public;
grant execute on all functions in schema worker to uteach_worker;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('prune_otp_sends', '17 3 * * *', 'select private.prune_otp_sends()');
  end if;
end;
$$;
