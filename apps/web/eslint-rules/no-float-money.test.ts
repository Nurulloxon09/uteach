import { describe, expect, it } from "vitest";
import { floatMoneyIn } from "./no-float-money.mjs";

describe("floatMoneyIn", () => {
  it.each([
    ["parseFloat", "value", "float"],
    ["Number.parseFloat", "x", "float"],
    ["Number", "parsed.data.price", "number"],
    ["Number", "v.priceOverride", "number"],
    ["parseInt", "row.amount", "number"],
    ["+", "balance", "number"],
    ["Number", "state.discountAmount", "number"],
  ])("flags %s(%s)", (callee, arg, kind) => {
    expect(floatMoneyIn(callee, arg)).toBe(kind);
  });

  it.each([
    ["Number", "minutes"],
    ["Number", "state.data?.created"],
    ["parseInt", "page"],
    ["+", "count"],
    ["String", "amount"],
  ])("allows %s(%s)", (callee, arg) => {
    expect(floatMoneyIn(callee, arg)).toBeNull();
  });
});
