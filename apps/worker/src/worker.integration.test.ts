import type { SmsMessage, SmsProvider } from "@uteach/adapters";
import type { Update } from "grammy/types";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBot } from "./bot";
import { workerDb, type WorkerDb } from "./db";
import { createSender } from "./sender";
import { RateLimiter, telegramSender } from "./telegram";
import { startFakeTelegram, type FakeTelegram } from "./testing/fake-telegram";

/**
 * 30-milestones M4 E2E: the worker against a real database and a fake Telegram Bot API. A parent links by
 * sharing their contact, an absence is marked, the alert arrives; a blocked bot unlinks and falls back to SMS;
 * a crash mid-send is recovered and sent once; two senders never send a row twice.
 * Runs only with UTEACH_DB_URL (setup, as postgres) and UTEACH_WORKER_DB_URL (the worker's own login) set:
 * CI's database job, or a local test database. It sends every due outbox row of that database to the fake API.
 */
const url = process.env.UTEACH_DB_URL;
const workerUrl = process.env.UTEACH_WORKER_DB_URL;
const enabled = Boolean(url && workerUrl);

let admin: postgres.Sql;
let workerSql: postgres.Sql;
let db: WorkerDb;
let fake: FakeTelegram;
const smsSent: SmsMessage[] = [];
const sms: SmsProvider = {
  name: "fake",
  async send(message) {
    smsSent.push(message);
    return { providerMessageId: `sms-${smsSent.length}` };
  },
};

const run = Date.now().toString().slice(-7);
const parentId = 7_000_000_000 + Number(run);
const otherId = parentId + 1;
const parentPhone = `+99891${run}`;
const ctx = {} as {
  center: string;
  owner: string;
  group: string;
  student: string;
  guardian: string;
  lessons: string[];
};

async function asOwner<T>(work: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: ctx.owner, role: "authenticated" });
  return admin.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`;
    return work(tx);
  }) as Promise<T>;
}

let updateId = 1;
const user = (id: number) => ({ id, is_bot: false, first_name: "Parent", language_code: "ru" });
const chat = (id: number) => ({ id, type: "private" as const, first_name: "Parent" });
const message = (from: number, extra: Record<string, unknown>) =>
  ({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: chat(from),
      from: user(from),
      ...extra,
    },
  }) as unknown as Update;
const command = (from: number, text: string) =>
  message(from, {
    text,
    entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
  });
const press = (from: number, data: string) =>
  ({
    update_id: updateId++,
    callback_query: {
      id: `cq${updateId}`,
      from: user(from),
      chat_instance: "ci",
      data,
      message: { message_id: 1, date: 0, chat: chat(from), text: "menu" },
    },
  }) as unknown as Update;
const contact = (from: number, phone: string, ownerId: number = from) =>
  message(from, {
    contact: { phone_number: phone.replace("+", ""), first_name: "Parent", user_id: ownerId },
  });

async function markAbsent(lesson: string) {
  await asOwner(
    (tx) =>
      tx`select public.save_attendance(${lesson}, ${tx.json([{ studentId: ctx.student, status: "absent" }])})`,
  );
}

const limiter = () => new RateLimiter(0, 0);

describe.skipIf(!enabled)("worker with a fake Telegram API", () => {
  let bot: ReturnType<typeof createBot>;
  let sender: ReturnType<typeof createSender>;

  beforeAll(async () => {
    admin = postgres(url!, { max: 3, onnotice: () => {} });
    workerSql = postgres(workerUrl!, { max: 6, onnotice: () => {} });
    db = workerDb(workerSql);
    fake = await startFakeTelegram();
    bot = createBot("123:TEST", { db, log: () => {} }, { client: { apiRoot: fake.apiRoot } });
    await bot.init();
    sender = createSender({
      db,
      telegram: telegramSender(bot.api),
      sms,
      limiter: limiter(),
      log: () => {},
    });

    // A center whose owner marks attendance; a student with a guardian (the parent's phone); 3 lessons now.
    const [owner] = await admin<{ id: string }[]>`
      insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data,
                              created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`99892${run}`}, now(), ${admin.json({ full_name: "Worker Owner" })}, now(), now())
      returning id`;
    ctx.owner = owner!.id;
    ctx.center = await asOwner(
      async (tx) =>
        (
          await tx<{ id: string }[]>`
          select public.create_center(${`Worker ${run}`}, 'Asia/Tashkent', 'uz', 'Main') as id`
        )[0]!.id,
    );
    await admin`
      update public.centers set quiet_hours_start = '00:00', quiet_hours_end = '00:00', absence_alert_delay_min = 0
      where id = ${ctx.center}`;
    const [{ branch, course, membership }] = (await admin`
      with c as (insert into public.courses (center_id, name) values (${ctx.center}, 'English') returning id)
      select (select id from public.branches where center_id = ${ctx.center}) as branch, c.id as course,
             (select id from public.memberships where center_id = ${ctx.center}) as membership
      from c`) as unknown as [{ branch: string; course: string; membership: string }];
    ctx.group = await asOwner(
      async (tx) =>
        (
          await tx<{ id: string }[]>`
          select public.create_group(${branch}, ${course}, 'IELTS-2', current_date - 1,
                                     p_teacher_membership_id => ${membership}) as id`
        )[0]!.id,
    );
    const lessons = await admin<{ id: string }[]>`
      insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at,
                                  teacher_membership_id, is_manually_edited)
      select ${ctx.center}, ${branch}, ${ctx.group},
             ((now() - make_interval(mins => 10 + n * 70)) at time zone 'Asia/Tashkent')::date,
             now() - make_interval(mins => 10 + n * 70), now() - make_interval(mins => 10 + n * 70) + interval '1 hour',
             ${membership}, true
      from generate_series(0, 2) n
      order by n
      returning id`;
    ctx.lessons = lessons.map((l) => l.id);
    const [student] = await admin<{ id: string }[]>`
      insert into public.students (center_id, branch_id, full_name)
      values (${ctx.center}, ${branch}, 'Ali Valiyev') returning id`;
    ctx.student = student!.id;
    const [guardian] = await admin<{ id: string }[]>`
      insert into public.guardians (center_id, full_name, phone)
      values (${ctx.center}, 'Malika', ${parentPhone}) returning id`;
    ctx.guardian = guardian!.id;
    await admin`
      insert into public.student_guardians (center_id, student_id, guardian_id)
      values (${ctx.center}, ${ctx.student}, ${ctx.guardian})`;
    await asOwner((tx) => tx`select public.enroll(${ctx.student}, ${ctx.group}, current_date - 1)`);
  }, 60_000);

  afterAll(async () => {
    await fake?.close();
    await workerSql?.end();
    await admin?.end();
  });

  it("links a parent who shares their own contact, and rejects someone else's", async () => {
    await bot.handleUpdate(command(parentId, "/start"));
    expect(fake.sentTo(parentId).at(-1)?.text).toContain("Выберите язык");
    await bot.handleUpdate(press(parentId, "l:ru"));
    expect(fake.sentTo(parentId).at(-1)?.text).toContain("номер");

    await bot.handleUpdate(contact(parentId, parentPhone, otherId));
    expect(fake.sentTo(parentId).at(-1)?.text).toContain("собственный номер");
    const [{ n: none }] = (await admin`
      select count(*)::int as n from public.telegram_links where telegram_user_id = ${parentId}`) as unknown as [
      { n: number },
    ];
    expect(none).toBe(0);

    await bot.handleUpdate(contact(parentId, parentPhone));
    const texts = fake.sentTo(parentId).map((c) => c.text ?? "");
    expect(texts.some((t) => t.includes("Подключено: Ali Valiyev"))).toBe(true);
    expect(texts.at(-1)).toContain("Что показать?");
  });

  it("answers the menu for the linked child", async () => {
    await bot.handleUpdate(press(parentId, "m:s"));
    expect(fake.sentTo(parentId).at(-1)?.text).toContain("IELTS-2");
    await bot.handleUpdate(press(parentId, "m:p"));
    expect(fake.sentTo(parentId).at(-1)?.text).toContain("Ali Valiyev · оплаты");
  });

  it("an unknown number gets the no-match reply", async () => {
    await bot.handleUpdate(command(otherId, "/start"));
    await bot.handleUpdate(press(otherId, "l:en"));
    await bot.handleUpdate(contact(otherId, `+99893${run}`));
    expect(fake.sentTo(otherId).at(-1)?.text).toContain("couldn't find this number");
  });

  it("delivers the absence alert in the parent's language", async () => {
    await markAbsent(ctx.lessons[0]!);
    const before = fake.sentTo(parentId).length;
    await sender.tick();
    const sent = fake.sentTo(parentId).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Ali Valiyev: пропуск занятия IELTS-2");
    const [row] = await admin<{ status: string; channel: string }[]>`
      select status::text, channel::text from public.notification_outbox
      where center_id = ${ctx.center} and template_key = 'absence_alert'`;
    expect(row).toEqual({ status: "sent", channel: "telegram" });
  });

  it("a blocked bot unlinks the parent and the alert goes by SMS", async () => {
    await admin`update public.centers set sms_enabled = true, sms_monthly_cap = 10 where id = ${ctx.center}`;
    await admin`
      insert into public.notification_templates (center_id, key, channel, locale, body, sms_provider_template_id)
      select ${ctx.center}, key, channel, locale, body, 'eskiz-' || locale
      from public.notification_templates where center_id is null and key = 'absence_alert' and channel = 'sms'`;
    fake.failChat(parentId, {
      error_code: 403,
      description: "Forbidden: bot was blocked by the user",
    });

    await markAbsent(ctx.lessons[1]!);
    await sender.tick();
    const [{ n: live }] = (await admin`
      select count(*)::int as n from public.telegram_links
      where telegram_user_id = ${parentId} and unlinked_at is null`) as unknown as [{ n: number }];
    expect(live).toBe(0);

    await sender.tick();
    expect(smsSent.at(-1)?.to).toBe(parentPhone);
    expect(smsSent.at(-1)?.text).toContain("Ali Valiyev");
    const rows = await admin<{ channel: string; status: string }[]>`
      select coalesce(channel::text, '-') as channel, status::text from public.notification_outbox
      where center_id = ${ctx.center} and template_key = 'absence_alert' order by created_at, channel`;
    expect(rows.map((r) => `${r.channel}:${r.status}`)).toEqual([
      "telegram:sent",
      "-:failed",
      "sms:sent",
    ]);
  });

  it("blocking the bot in Telegram ends the links too", async () => {
    fake.clearFailures();
    await bot.handleUpdate(contact(parentId, parentPhone));
    await bot.handleUpdate({
      update_id: updateId++,
      my_chat_member: {
        chat: chat(parentId),
        from: user(parentId),
        date: 0,
        old_chat_member: { status: "member", user: { id: 1, is_bot: true, first_name: "uteach" } },
        new_chat_member: {
          status: "kicked",
          until_date: 0,
          user: { id: 1, is_bot: true, first_name: "uteach" },
        },
      },
    } as unknown as Update);
    const [{ n }] = (await admin`
      select count(*)::int as n from public.telegram_links
      where telegram_user_id = ${parentId} and unlinked_at is null`) as unknown as [{ n: number }];
    expect(n).toBe(0);
    await bot.handleUpdate(contact(parentId, parentPhone));
  });

  it("a worker killed mid-send: the row is recovered and sent exactly once", async () => {
    await admin`
      insert into public.notification_outbox (center_id, template_key, locale, payload, guardian_id, dedupe_key)
      values (${ctx.center}, 'broadcast', 'ru', ${admin.json({ center: "C", body: `crash-${run}` })},
              ${ctx.guardian}, ${`crash:${run}`})`;
    const claimed = await db.claim(500); // the "crashed" worker: claims, never sends
    expect(claimed.some((j) => j.payload.body === `crash-${run}`)).toBe(true);
    const other = claimed.filter((j) => j.payload.body !== `crash-${run}`).map((j) => j.id);
    if (other.length) {
      await admin`update public.notification_outbox set status = 'pending', locked_at = null where id = any(${other}::uuid[])`;
    }
    await sender.tick();
    expect(fake.calls.filter((c) => c.text?.includes(`crash-${run}`))).toHaveLength(0);

    await admin`
      update public.notification_outbox set locked_at = now() - interval '3 minutes'
      where center_id = ${ctx.center} and dedupe_key = ${`crash:${run}`}`;
    expect(await db.recoverStale(120)).toBeGreaterThanOrEqual(1);
    await sender.tick();
    await sender.tick();
    expect(fake.calls.filter((c) => c.text?.includes(`crash-${run}`))).toHaveLength(1);
  });

  it("a payment receipt arrives as a PDF and can be fetched again from the menu", async () => {
    const [{ r }] = (await asOwner(
      (tx) => tx`select public.record_payment(${ctx.student}, 50000000, 'cash') as r`,
    )) as unknown as [{ r: { paymentId: string; receiptNo: string } }];
    const before = fake.sentTo(parentId).length;
    await sender.tick();
    const sent = fake.sentTo(parentId).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe("sendDocument");
    expect(sent[0]!.text).toContain(r.receiptNo);

    await bot.handleUpdate(press(parentId, `r:${r.paymentId}`));
    expect(fake.sentTo(parentId).at(-1)?.method).toBe("sendDocument");
    // Someone not linked to the student: the database refuses (in production bot.catch replies with an error).
    await expect(bot.handleUpdate(press(otherId, `r:${r.paymentId}`))).rejects.toThrow(/forbidden/);
  });

  it("a mock's scores reach the parent, and the Scores item shows them against the target", async () => {
    const [{ id: ielts }] = (await admin`
      select id from public.exam_types where center_id is null and code = 'ielts'`) as unknown as [
      { id: string },
    ];
    await asOwner(async (tx) => {
      await tx`select public.set_student_target(${ctx.student}, ${ielts}, 7.0, (now() at time zone 'Asia/Tashkent')::date + 30)`;
      await tx`
        select public.save_group_scores(${ctx.group}, ${ielts}, 'mock', current_date,
          ${tx.json([{ studentId: ctx.student, scores: { listening: 6.5, reading: 7, writing: 6, speaking: 6.5 } }])})`;
    });
    // score_posted waits 10 minutes so a typo can be fixed; make it due now.
    await admin`
      update public.notification_outbox set send_after = now()
      where center_id = ${ctx.center} and template_key = 'score_posted' and status = 'pending'`;
    const before = fake.sentTo(parentId).length;
    await sender.tick();
    const sent = fake.sentTo(parentId).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Ali Valiyev: IELTS, пробный экзамен");
    expect(sent[0]!.text).toContain("Аудирование 6.5 · Чтение 7.0 · Письмо 6.0 · Говорение 6.5");
    expect(sent[0]!.text).toContain("Общий балл: 6.5");
    expect(sent[0]!.text).toContain("Цель: 7.0");

    await bot.handleUpdate(press(parentId, "m:x"));
    const reply = fake.sentTo(parentId).at(-1)?.text ?? "";
    expect(reply).toContain("Ali Valiyev · баллы");
    expect(reply).toContain("Общий балл: 6.5");
    expect(reply).toContain("Цель: 7.0 · осталось 0.5");
    expect(reply).toContain("(через 30 дней)");
    // Someone not linked to the student: the database refuses.
    await expect(db.scores(otherId, ctx.student)).rejects.toThrow(/forbidden/);
  });

  it("two senders working together never send a row twice", async () => {
    await admin`
      insert into public.notification_outbox (center_id, template_key, locale, payload, guardian_id, dedupe_key)
      select ${ctx.center}, 'broadcast', 'ru', jsonb_build_object('center', 'C', 'body', ${`pair-${run}-`} || n),
             ${ctx.guardian}, ${`pair:${run}:`} || n
      from generate_series(1, 30) n`;
    const second = createSender({
      db,
      telegram: telegramSender(bot.api),
      sms,
      limiter: limiter(),
      log: () => {},
      batchSize: 4,
    });
    const first = createSender({
      db,
      telegram: telegramSender(bot.api),
      sms,
      limiter: limiter(),
      log: () => {},
      batchSize: 4,
    });
    const drain = async (s: typeof first) => {
      for (let i = 0; i < 20; i++) if ((await s.tick()).claimed === 0) return;
    };
    await Promise.all([drain(first), drain(second)]);
    for (let n = 1; n <= 30; n++) {
      const body = `pair-${run}-${n}`;
      expect(
        fake.calls.filter((c) => c.text?.endsWith(body)),
        body,
      ).toHaveLength(1);
    }
  });
});
