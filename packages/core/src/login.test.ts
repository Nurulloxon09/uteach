import { describe, expect, it } from "vitest";
import { loginEmail, normalizeUsername } from "./login";

describe("normalizeUsername", () => {
  it("trims and lower-cases", () => {
    expect(normalizeUsername("  Dilnoza.Admin ")).toBe("dilnoza.admin");
  });

  it("accepts letters, digits, dots and underscores, 3 to 32 characters", () => {
    expect(normalizeUsername("abc")).toBe("abc");
    expect(normalizeUsername("u998990000099")).toBe("u998990000099");
    expect(normalizeUsername("a_b.c")).toBe("a_b.c");
    expect(normalizeUsername("a".repeat(32))).toBe("a".repeat(32));
  });

  it("refuses everything else", () => {
    for (const bad of [
      "",
      "ab",
      "a".repeat(33),
      ".abc",
      "_abc",
      "ali vali",
      "ali@uteach",
      "алишер",
      "ali-v",
    ]) {
      expect(normalizeUsername(bad)).toBeNull();
    }
  });
});

describe("loginEmail", () => {
  it("builds the hidden Auth address", () => {
    expect(loginEmail("dilnoza.admin")).toBe("dilnoza.admin@login.uteach.invalid");
  });
});
