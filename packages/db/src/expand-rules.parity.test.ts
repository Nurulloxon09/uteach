import { fileURLToPath } from "node:url";
import { expandRules, type ScheduleRule } from "@uteach/core/schedule";
import fixtures from "@uteach/core/schedule.fixtures.json";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 04-rules / 01-tech-stack: logic that also runs in SQL is tested against the same fixtures.
 * `private.expand_rules` (used by the lesson generator) must match `expandRules` from packages/core.
 */
type Fixture = {
  name: string;
  timeZone: string;
  range: { from: string; to: string };
  holidays: string[];
  rules: ScheduleRule[];
};

const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

type Row = { rule_id: string; local_date: string; starts_at: string; ends_at: string };

describe("private.expand_rules matches expandRules()", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, async () => {
      const result = await db.query<Row>(
        `select rule_id::text, local_date::text,
                to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
                to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ends_at
         from private.expand_rules($1::jsonb, $2::date[], $3::date, $4::date, $5)`,
        [JSON.stringify(f.rules), f.holidays, f.range.from, f.range.to, f.timeZone],
      );
      const sql = result.rows.map((r) => ({
        ruleId: r.rule_id,
        localDate: r.local_date,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
      }));
      const ts = expandRules(f.rules, f.holidays, f.range, f.timeZone).map((l) => ({
        ruleId: l.ruleId,
        localDate: l.localDate,
        startsAt: l.startsAt.toISOString(),
        endsAt: l.endsAt.toISOString(),
      }));
      expect(sql).toEqual(ts);
    });
  }
});
