import { fileURLToPath } from "node:url";
import { centerStatusNext, type CenterStatus } from "@uteach/core";
import fixtures from "@uteach/core/subscription.fixtures.json";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 10 / 30-milestones (M7 plan): the center status machine exists in SQL (`private.center_status_next`, run by the
 * hourly `expire_centers` job) and in TypeScript (`centerStatusNext`, used by the app's banner). Both must agree
 * on the shared fixtures.
 */
type Fixture = {
  name: string;
  status: CenterStatus;
  trialEndsAt?: string;
  paidUntil?: string;
  pastDueSince?: string;
  now: string;
  expect: CenterStatus;
  since: string | null;
};

const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("private.center_status_next matches centerStatusNext()", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, async () => {
      const result = await db.query<{ status: string; since: string | null }>(
        `select x.status::text as status, to_char(x.past_due_since at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as since
         from private.center_status_next($1::public.center_status, $2::timestamptz, $3::date, $4::timestamptz,
                                         'Asia/Tashkent', $5::timestamptz) x`,
        [f.status, f.trialEndsAt ?? null, f.paidUntil ?? null, f.pastDueSince ?? null, f.now],
      );
      const sql = result.rows[0]!;
      const ts = centerStatusNext(
        {
          status: f.status,
          trialEndsAt: f.trialEndsAt ? new Date(f.trialEndsAt) : null,
          paidUntil: f.paidUntil ?? null,
          pastDueSince: f.pastDueSince ? new Date(f.pastDueSince) : null,
          timeZone: "Asia/Tashkent",
        },
        new Date(f.now),
      );
      expect(sql.status).toBe(f.expect);
      expect(ts.status).toBe(f.expect);
      const expected = f.since ? new Date(f.since).toISOString() : null;
      expect(sql.since ? new Date(sql.since).toISOString() : null).toBe(expected);
      expect(ts.pastDueSince?.toISOString() ?? null).toBe(expected);
    });
  }
});
