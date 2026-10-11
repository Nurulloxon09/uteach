import { describe, expect, it } from "vitest";
import { isE164, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["90 123 45 67", "+998901234567"],
    ["+998 90 123-45-67", "+998901234567"],
    ["998901234567", "+998901234567"],
    ["(90) 123 45 67", "+998901234567"],
  ])("normalises %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("uses the given default country", () => {
    expect(normalizePhone("701 234 5678", "KZ")).toBe("+77012345678");
  });

  it("returns null for junk", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
  });
});

describe("isE164", () => {
  it("matches the DB constraint", () => {
    expect(isE164("+998901234567")).toBe(true);
    expect(isE164("998901234567")).toBe(false);
    expect(isE164("+0123456789")).toBe(false);
  });
});
