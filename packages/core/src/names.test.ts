import { describe, expect, it } from "vitest";
import { normalizeName } from "./names";

describe("normalizeName", () => {
  it("ignores case, extra spaces and apostrophe styles", () => {
    expect(normalizeName("  Oʻrinboyev   Sardor ")).toBe("o'rinboyev sardor");
    expect(normalizeName("O‘rinboyev Sardor")).toBe(normalizeName("o'rinboyev  sardor"));
    expect(normalizeName("АННА Смирнова")).toBe("анна смирнова");
  });
});
