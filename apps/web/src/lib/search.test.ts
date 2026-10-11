import { describe, expect, it } from "vitest";
import { ilikePattern } from "./search";

describe("ilikePattern", () => {
  it("wraps the text in wildcards", () => {
    expect(ilikePattern("Olim")).toBe("%Olim%");
    expect(ilikePattern("  +998 90  ")).toBe("%+998 90%");
  });

  it("neutralises PostgREST and LIKE syntax", () => {
    expect(ilikePattern("a,b(c)")).toBe("%a b c%");
    expect(ilikePattern("50%_x\\")).toBe("%50 x%");
  });

  it("returns null for empty input", () => {
    expect(ilikePattern("")).toBeNull();
    expect(ilikePattern(" ,() ")).toBeNull();
  });
});
