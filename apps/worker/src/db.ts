import postgres from "postgres";

/**
 * The worker's only door into the database: the `worker.*` functions (02, under system_heartbeats), called as
 * the `uteach_worker` role. Each method is one function call.
 */
export type Sql = postgres.Sql;

export function connect(url: string, max = 5): Sql {
  return postgres(url, { max, onnotice: () => {}, idle_timeout: 60 });
}

/** A row from `worker.claim_outbox` (bigint columns arrive as strings). */
export type OutboxJob = {
  id: string;
  center_id: string;
  template_key: string;
  locale: string;
  payload: Record<string, unknown>;
  channel: "telegram" | "sms" | "whatsapp" | "email" | null;
  attempts: number;
  student_id: string | null;
  guardian_id: string | null;
  membership_id: string | null;
  broadcast_id: string | null;
  fallback_of_id: string | null;
  telegram_chat_id: string | null;
  phone: string | null;
  telegram_body: string | null;
  telegram_enabled: boolean;
  sms_body: string | null;
  sms_template_id: string | null;
  sms_enabled: boolean;
  center_name: string;
  center_timezone: string;
  center_currency: string;
  center_sms_enabled: boolean;
  sms_left: number;
};

export type LinkRow = {
  link_id: string;
  center_id: string;
  center_name: string;
  subject: "student" | "guardian" | "staff";
  subject_id: string;
  name: string;
};

export type SubjectRow = {
  center_id: string;
  center_name: string;
  timezone: string;
  currency: string;
  student_id: string;
  student_name: string;
  relation: "self" | "child";
};

export type LessonRow = {
  lesson_id: string;
  local_date: string;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  group_name: string;
  room_name: string | null;
  teacher_name: string | null;
  status: "scheduled" | "held" | "cancelled";
};

export type MarkRow = {
  local_date: string;
  group_name: string;
  status: "present" | "late" | "absent" | "excused";
  late_minutes: number | null;
};

export type PaymentsSummary = {
  balance: string;
  currency: string;
  debts: { dueDate: string; outstanding: string; daysOverdue: number }[];
  payments: { paymentId: string; paidAt: string; amount: string; receiptNo: string }[];
};

export type ReceiptData = {
  paymentId: string;
  receiptNo: string;
  amount: string;
  method: string;
  paidAt: string;
  payerName: string | null;
  voided: boolean;
  voidReason: string | null;
  student: string;
  centerName: string;
  currency: string;
  timezone: string;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
};

/** Bot conversation state (bot_sessions.state + active center). */
export type BotState = {
  locale?: string;
  activeCenterId?: string | null;
  startCenterId?: string | null;
};

export type WorkerDb = ReturnType<typeof workerDb>;

export function workerDb(sql: Sql) {
  const date = (d: string) => d;
  return {
    claim: (limit = 50) =>
      sql<OutboxJob[]>`select * from worker.claim_outbox(${limit}::int)`.then((r) => [...r]),
    markSent: async (
      id: string,
      channel: "telegram" | "sms",
      chatId: string | null,
      phone: string | null,
      providerMessageId: string | null,
    ) =>
      (
        await sql<{ ok: boolean }[]>`
          select worker.mark_sent(${id}, ${channel}::public.notification_channel, ${chatId}::bigint,
                                  ${phone}, ${providerMessageId}) as ok`
      )[0]!.ok,
    markRetry: async (id: string, error: string, minDelaySeconds = 0) =>
      (
        await sql<{ status: string | null }[]>`
          select worker.mark_retry(${id}, ${error}, ${minDelaySeconds}::int)::text as status`
      )[0]!.status,
    markFailed: async (id: string, error: string, telegramBlocked: boolean) =>
      (
        await sql<{ fallback: string | null }[]>`
          select worker.mark_failed(${id}, ${error}, ${telegramBlocked}) as fallback`
      )[0]!.fallback,
    markSkipped: async (id: string, reason: string) =>
      (await sql<{ ok: boolean }[]>`select worker.mark_skipped(${id}, ${reason}) as ok`)[0]!.ok,
    recoverStale: async (seconds = 120) =>
      (await sql<{ n: number }[]>`select worker.recover_stale(${seconds}::int) as n`)[0]!.n,
    beat: async (service: string, info: Record<string, unknown>) => {
      await sql`select worker.beat(${service}, ${sql.json(info as postgres.JSONValue)})`;
    },
    linkContact: (telegramUserId: number, chatId: number, phone: string, locale: string) =>
      sql<LinkRow[]>`
        select * from worker.link_contact(${telegramUserId}::bigint, ${chatId}::bigint, ${phone}, ${locale})
      `.then((r) => [...r]),
    unlink: async (telegramUserId: number) =>
      (await sql<{ n: number }[]>`select worker.unlink(${telegramUserId}::bigint) as n`)[0]!.n,
    setLocale: async (telegramUserId: number, locale: string) => {
      await sql`select worker.set_locale(${telegramUserId}::bigint, ${locale})`;
    },
    getSession: async (telegramUserId: number): Promise<BotState | null> =>
      (
        await sql<{ s: BotState | null }[]>`
          select worker.get_session(${telegramUserId}::bigint) as s`
      )[0]!.s,
    setSession: async (telegramUserId: number, state: BotState) => {
      await sql`select worker.set_session(${telegramUserId}::bigint, ${sql.json(state as postgres.JSONValue)})`;
    },
    centerBySlug: async (slug: string) =>
      (await sql<{ id: string | null }[]>`select worker.center_by_slug(${slug}) as id`)[0]!.id,
    subjects: (telegramUserId: number) =>
      sql<SubjectRow[]>`
        select * from worker.bot_subjects(${telegramUserId}::bigint) order by center_name, student_name
      `.then((r) => [...r]),
    schedule: (telegramUserId: number, studentId: string, from: string, to: string) =>
      sql<LessonRow[]>`
        select lesson_id, local_date::text, starts_at, ends_at, timezone, group_name, room_name, teacher_name,
               status::text
        from worker.bot_schedule(${telegramUserId}::bigint, ${studentId}, ${date(from)}::date, ${date(to)}::date)
      `.then((r) => [...r]),
    attendance: (telegramUserId: number, studentId: string, from: string, to: string) =>
      sql<MarkRow[]>`
        select local_date::text, group_name, status::text, late_minutes
        from worker.bot_attendance(${telegramUserId}::bigint, ${studentId}, ${date(from)}::date, ${date(to)}::date)
      `.then((r) => [...r]),
    payments: async (telegramUserId: number, studentId: string) =>
      (
        await sql<{ p: PaymentsSummary }[]>`
          select worker.bot_payments(${telegramUserId}::bigint, ${studentId}) as p`
      )[0]!.p,
    receiptData: async (paymentId: string, telegramUserId: number | null = null) =>
      (
        await sql<{ r: ReceiptData }[]>`
          select worker.receipt_data(${paymentId}, ${telegramUserId}::bigint) as r`
      )[0]!.r,
  };
}
