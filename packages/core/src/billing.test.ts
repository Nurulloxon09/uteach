import { describe, expect, it } from "vitest";
import { agingBucket, computeCycleCharge, unusedLessonsCredit } from "./billing";
import fixtures from "./billing.fixtures.json";
import { money } from "./money";

type Fixture = {
  name: string;
  price: string;
  discountBp: number;
  discountAmount: string;
  roundingUnit: string;
  amount: string;
  discount: string;
};

describe("computeCycleCharge", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, () => {
      const charge = computeCycleCharge({
        price: money(BigInt(f.price)),
        discountBp: f.discountBp,
        discountAmount: money(BigInt(f.discountAmount)),
        roundingUnit: money(BigInt(f.roundingUnit)),
      });
      expect(charge.amount).toBe(BigInt(f.amount));
      expect(charge.discount).toBe(BigInt(f.discount));
    });
  }

  it("rejects negative prices and impossible discounts", () => {
    const base = { discountAmount: money(0), roundingUnit: money(100000) };
    expect(() => computeCycleCharge({ ...base, price: money(-1), discountBp: 0 })).toThrow(
      RangeError,
    );
    expect(() => computeCycleCharge({ ...base, price: money(1), discountBp: 10001 })).toThrow(
      RangeError,
    );
  });
});

describe("unusedLessonsCredit", () => {
  it("worked example 3: 540 000 UZS, 5 of 12 lessons used → 315 000 UZS", () => {
    expect(unusedLessonsCredit(money(54_000_000), 12, 5)).toBe(31_500_000n);
  });

  it("rounds half up on the tiyin, not the rounding unit", () => {
    expect(unusedLessonsCredit(money(1_000_001), 3, 2)).toBe(333_334n);
  });

  it("is zero for a fully used cycle and the whole amount for an unused one", () => {
    expect(unusedLessonsCredit(money(54_000_000), 12, 12)).toBe(0n);
    expect(unusedLessonsCredit(money(54_000_000), 12, 0)).toBe(54_000_000n);
  });
});

describe("agingBucket", () => {
  it.each([
    [0, "0-30"],
    [30, "0-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "61-90"],
    [90, "61-90"],
    [91, "90+"],
  ])("%i days → %s", (days, bucket) => {
    expect(agingBucket(days)).toBe(bucket);
  });
});
