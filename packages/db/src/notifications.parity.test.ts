import { fileURLToPath } from "node:url";
import { outboxBackoffSeconds } from "@uteach/core";
import { isLocale } from "@uteach/i18n";
import { renderTemplate } from "@uteach/i18n/notifications";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 17-telegram-notifications: the retry schedule exists in SQL (`private.outbox_backoff`, used by
 * `worker.mark_retry`) and in TypeScript (`outboxBackoffSeconds`). And every system template renders with the
 * payload its key is queued with, in every language.
 */
const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("private.outbox_backoff matches outboxBackoffSeconds()", () => {
  for (const attempts of [0, 1, 2, 3, 4, 5, 6]) {
    it(`attempt ${attempts}`, async () => {
      const result = await db.query<{ s: number | null }>(
        `select extract(epoch from private.outbox_backoff($1))::int as s`,
        [attempts],
      );
      expect(result.rows[0]!.s).toBe(outboxBackoffSeconds(attempts));
    });
  }
});

// The payloads each key is queued with (M2: 14, 13; M3: record_payment; M4: reminders, broadcasts, staff).
const lesson = { group: "IELTS-2", date: "2026-10-14", time: "10:00", center: "Center A" };
const payloads: Record<string, Record<string, unknown>> = {
  absence_alert: { ...lesson, student: "Ali" },
  late_alert: { ...lesson, student: "Ali", minutes: 7 },
  lesson_cancelled: lesson,
  lesson_moved: { ...lesson, oldDate: "2026-10-13", oldTime: "09:00" },
  lesson_added: lesson,
  payment_received: {
    student: "Ali",
    center: "Center A",
    amount: "60000000",
    currency: "UZS",
    receiptNo: "CHI-2026-000001",
    balance: "0",
  },
  charge_created: {
    student: "Ali",
    group: "IELTS-2",
    center: "Center A",
    cycle: 2,
    lessons: 12,
    amount: "60000000",
    currency: "UZS",
    startDate: "2026-10-14",
    dueDate: "2026-10-24",
  },
  payment_reminder: {
    student: "Ali",
    center: "Center A",
    debt: "60000000",
    currency: "UZS",
    oldestDueDate: "2026-09-30",
    daysOverdue: 13,
    reminderDate: "2026-10-13",
    manual: false,
  },
  payment_due_soon: {
    student: "Ali",
    center: "Center A",
    amount: "60000000",
    currency: "UZS",
    dueDate: "2026-10-15",
  },
  broadcast: { center: "Center A", body: "Darslar", bodies: { ru: "Занятия" } },
  substitute_assigned: lesson,
  schedule_conflict: { group: "IELTS-2", center: "Center A", date: "2026-10-20", kind: "room" },
};

describe("system templates render with their payloads", () => {
  it("covers every seeded key", async () => {
    const keys = await db.query<{ key: string }>(
      `select distinct key from public.notification_templates where center_id is null order by key`,
    );
    expect(keys.rows.map((r) => r.key)).toEqual(Object.keys(payloads).sort());
  });

  it("every template, channel and language", async () => {
    const rows = await db.query<{ key: string; channel: string; locale: string; body: string }>(
      `select key, channel::text, locale, body from public.notification_templates where center_id is null`,
    );
    for (const row of rows.rows) {
      if (!isLocale(row.locale)) throw new Error(`bad locale ${row.locale}`);
      const text = renderTemplate(row.body, payloads[row.key]!, {
        locale: row.locale,
        currency: "UZS",
        today: "2026-10-13",
      });
      expect(text, `${row.key}/${row.channel}/${row.locale}`).not.toMatch(/[{}]/);
      expect(text.length).toBeGreaterThan(10);
    }
  });
});
