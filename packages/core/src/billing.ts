import { divRound, prorate, roundToUnit, type Money } from "./money";

/**
 * Lesson-cycle billing (docs/spec/15-payments-debts.md). The database computes charges with the SQL mirror
 * `private.compute_cycle_charge`; both are tested on the same fixtures (billing.fixtures.json).
 */
export type CycleChargeInput = {
  /** Full-cycle price in minor units (the student's own price, else the group price). */
  price: Money;
  /** Percent discount in basis points (10000 = 100%). */
  discountBp: number;
  /** Fixed discount per cycle, applied after the percent. */
  discountAmount: Money;
  /** The center's rounding unit (e.g. 100000 tiyin = 1 000 UZS). */
  roundingUnit: Money;
};

export type CycleCharge = {
  price: Money;
  percentOff: Money;
  afterPercent: Money;
  afterFixed: Money;
  /** Final charge, rounded half up to the unit. */
  amount: Money;
  /** Discount taken off before rounding (price − afterFixed). */
  discount: Money;
};

/** price → − percent (half up) → − fixed (never below 0) → rounded half up to the unit. */
export function computeCycleCharge(input: CycleChargeInput): CycleCharge {
  const { price, discountBp, discountAmount, roundingUnit } = input;
  if (price < 0n) throw new RangeError("price must not be negative");
  if (discountBp < 0 || discountBp > 10_000) throw new RangeError("discount must be 0–10000 bp");
  const percentOff = prorate(price, discountBp, 10_000);
  const afterPercent = (price - percentOff) as Money;
  const fixed = discountAmount > afterPercent ? afterPercent : discountAmount;
  const afterFixed = (afterPercent - fixed) as Money;
  return {
    price,
    percentOff,
    afterPercent,
    afterFixed,
    amount: roundToUnit(afterFixed, roundingUnit),
    discount: (price - afterFixed) as Money,
  };
}

/**
 * Value of the lessons not taken when a student leaves mid-cycle (15):
 * amount × unused / cycleLessons, half up to the minor unit (not to the rounding unit).
 */
export function unusedLessonsCredit(amount: Money, cycleLessons: number, used: number): Money {
  if (cycleLessons <= 0) throw new RangeError("cycle length must be positive");
  const unused = Math.max(0, cycleLessons - used);
  return divRound(amount * BigInt(unused), BigInt(cycleLessons)) as Money;
}

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

/** Debtors' aging buckets by days overdue (15). */
export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}
