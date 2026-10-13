import { fileURLToPath } from "node:url";
import { outboxBackoffSeconds } from "@uteach/core";
import { isLocale } from "@uteach/i18n";
import {
  isTemplateKey,
  renderTemplate,
  samplePayload,
  TEMPLATE_KEYS,
} from "@uteach/i18n/notifications";
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

describe("system templates render with their payloads", () => {
  it("covers every seeded key", async () => {
    const keys = await db.query<{ key: string }>(
      `select distinct key from public.notification_templates where center_id is null order by key`,
    );
    expect(keys.rows.map((r) => r.key)).toEqual([...TEMPLATE_KEYS].sort());
  });

  it("every template, channel and language", async () => {
    const rows = await db.query<{ key: string; channel: string; locale: string; body: string }>(
      `select key, channel::text, locale, body from public.notification_templates where center_id is null`,
    );
    for (const row of rows.rows) {
      if (!isLocale(row.locale) || !isTemplateKey(row.key)) throw new Error(`bad row ${row.key}`);
      const text = renderTemplate(row.body, samplePayload(row.key, "Center A"), {
        locale: row.locale,
        currency: "UZS",
        today: "2026-10-13",
      });
      expect(text, `${row.key}/${row.channel}/${row.locale}`).not.toMatch(/[{}]/);
      expect(text.length).toBeGreaterThan(10);
    }
  });
});
