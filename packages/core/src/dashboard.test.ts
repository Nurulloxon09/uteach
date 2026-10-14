import { describe, expect, it } from "vitest";
import { attendanceRate, changeSince, collectionRate } from "./dashboard";

describe("attendanceRate", () => {
  it("counts late as attended and leaves excused out", () => {
    expect(attendanceRate(1, 1, 1)).toBeCloseTo(2 / 3);
    expect(attendanceRate(3, 0, 0)).toBe(1);
    expect(attendanceRate(0, 0, 4)).toBe(0);
  });
  it("is null before the first mark", () => {
    expect(attendanceRate(0, 0, 0)).toBeNull();
  });
});

describe("collectionRate", () => {
  it("divides collected by charged", () => {
    expect(collectionRate("500000", "1000000")).toBe(0.5);
    expect(collectionRate(1n, 3n)).toBe(0.3333);
  });
  it("can pass 100% when old debts are paid", () => {
    expect(collectionRate(150, 100)).toBe(1.5);
  });
  it("stays exact for sums beyond 2^53 tiyin", () => {
    expect(collectionRate("90071992547409930", "180143985094819860")).toBe(0.5);
  });
  it("is null when nothing is charged", () => {
    expect(collectionRate(500, 0)).toBeNull();
  });
});

describe("changeSince", () => {
  it("is now minus before", () => {
    expect(changeSince(5, 4)).toBe(1);
    expect(changeSince(3, 7)).toBe(-4);
  });
});
