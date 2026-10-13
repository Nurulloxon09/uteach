import { fileURLToPath } from "node:url";
import { canMoveLead, LEAD_STATUSES } from "@uteach/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 11-leads-crm (M5 plan): the pipeline's move table exists in SQL (`private.lead_move_allowed`, enforced by
 * `move_lead`) and in TypeScript (`canMoveLead`, used by the board). Every pair must agree.
 */
const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("private.lead_move_allowed matches canMoveLead()", () => {
  it("every pair of statuses", async () => {
    const result = await db.query<{ f: string; t: string; ok: boolean }>(
      `select f::text, t::text, private.lead_move_allowed(f, t) as ok
       from unnest(enum_range(null::public.lead_status)) f, unnest(enum_range(null::public.lead_status)) t`,
    );
    expect(result.rows.map((r) => r.f + ">" + r.t).sort()).toEqual(
      LEAD_STATUSES.flatMap((f) => LEAD_STATUSES.map((t) => f + ">" + t)).sort(),
    );
    for (const row of result.rows) {
      const from = LEAD_STATUSES.find((s) => s === row.f)!;
      const to = LEAD_STATUSES.find((s) => s === row.t)!;
      expect(row.ok, `${row.f} → ${row.t}`).toBe(canMoveLead(from, to));
    }
  });
});
