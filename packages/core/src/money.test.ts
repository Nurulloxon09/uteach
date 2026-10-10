import { describe, expect, it } from "vitest";
import {
  divRound,
  money,
  parseMajorUnits,
  parseMinorUnits,
  percentOf,
  prorate,
  roundToUnit,
  sum,
} from "./money";

describe("money()", () => {
  it("accepts integers and bigints", () => {
    expect(money(150)).toBe(150n);
    expect(money(150n)).toBe(150n);
  });

  it("rejects fractional numbers", () => {
    expect(() => money(1.5)).toThrow(RangeError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});

describe("parsing", () => {
  it("parses minor units strings", () => {
    expect(parseMinorUnits("55384615")).toBe(55384615n);
    expect(parseMinorUnits("-100")).toBe(-100n);
    expect(() => parseMinorUnits("1.5")).toThrow();
  });

  it("parses major units without floats", () => {
    expect(parseMajorUnits("600 000")).toBe(60_000_000n);
    expect(parseMajorUnits("1250.5")).toBe(125_050n);
    expect(parseMajorUnits("1250,05")).toBe(125_005n);
    expect(parseMajorUnits("0.1")).toBe(10n);
    expect(() => parseMajorUnits("1.234")).toThrow();
    expect(() => parseMajorUnits("abc")).toThrow();
  });
});

describe("divRound", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(-4n, 3n)).toBe(-1n);
  });

  it("rejects non-positive denominators", () => {
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
  });
});

describe("prorate", () => {
  it("matches the worked example in 15-payments-debts", () => {
    // 600 000 UZS, 12 of 13 lessons, 10% discount, rounded to 1 000 UZS → 498 000 UZS.
    const price = money(60_000_000n);
    const gross = prorate(price, 12, 13);
    expect(gross).toBe(55_384_615n);
    const afterDiscount = (gross - percentOf(gross, 1000)) as typeof gross;
    expect(afterDiscount).toBe(49_846_153n);
    expect(roundToUnit(afterDiscount, money(100_000n))).toBe(49_800_000n);
  });

  it("never shaves a full month", () => {
    const price = money(60_000_000n);
    expect(prorate(price, 13, 13)).toBe(price);
    expect(prorate(price, 0, 13)).toBe(0n);
  });

  it("rejects negative numerators", () => {
    expect(() => prorate(money(100), -1, 2)).toThrow(RangeError);
  });
});

describe("roundToUnit and sum", () => {
  it("rounds half up to the unit", () => {
    expect(roundToUnit(money(49_950_000n), money(100_000n))).toBe(50_000_000n);
    expect(roundToUnit(money(49_949_999n), money(100_000n))).toBe(49_900_000n);
  });

  it("sums", () => {
    expect(sum([money(1), money(2), money(3)])).toBe(6n);
    expect(sum([])).toBe(0n);
  });
});
