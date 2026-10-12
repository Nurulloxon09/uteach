import { fileURLToPath } from "node:url";
import { computeCycleCharge, money } from "@uteach/core";
import fixtures from "@uteach/core/billing.fixtures.json";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 15-payments-debts: charges are computed in SQL (`private.compute_cycle_charge`, used by the charge
 * generator) and in TypeScript (`computeCycleCharge`, for explanations on screen). Same fixtures, same result.
 */
type Fixture = {
  name: string;
  price: string;
  discountBp: number;
  discountAmount: string;
  roundingUnit: string;
};

const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("private.compute_cycle_charge matches computeCycleCharge()", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, async () => {
      const result = await db.query<{ amount: string; discount: string }>(
        `select c ->> 'amount' as amount, c ->> 'discount' as discount
         from private.compute_cycle_charge($1::bigint, $2::integer, $3::bigint, $4::bigint) c`,
        [f.price, f.discountBp, f.discountAmount, f.roundingUnit],
      );
      const ts = computeCycleCharge({
        price: money(BigInt(f.price)),
        discountBp: f.discountBp,
        discountAmount: money(BigInt(f.discountAmount)),
        roundingUnit: money(BigInt(f.roundingUnit)),
      });
      expect(result.rows[0]).toEqual({
        amount: ts.amount.toString(),
        discount: ts.discount.toString(),
      });
    });
  }
});
