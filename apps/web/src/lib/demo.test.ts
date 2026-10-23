import { describe, expect, it } from "vitest";
import { isDemoAccount } from "./demo";

describe("isDemoAccount", () => {
  it("is true only for app_metadata.demo === true", () => {
    expect(isDemoAccount({ app_metadata: { provider: "phone", demo: true } })).toBe(true);
    expect(isDemoAccount({ app_metadata: { demo: "true" } })).toBe(false);
    expect(isDemoAccount({ app_metadata: {} })).toBe(false);
    expect(isDemoAccount({})).toBe(false);
    expect(isDemoAccount(null)).toBe(false);
  });
});
