import { describe, expect, it } from "vitest";
import { formatMoney, isLocale } from "./index";

// Intl output uses narrow/no-break spaces; compare with plain spaces.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("formatMoney", () => {
  it("formats whole amounts without decimals", () => {
    expect(plain(formatMoney(60_000_000n, "UZS", "en"))).toBe("UZS 600,000");
  });

  it("keeps tiyin exactly", () => {
    expect(plain(formatMoney(55_384_615n, "UZS", "en"))).toBe("UZS 553,846.15");
  });

  it("handles negative amounts and huge values without precision loss", () => {
    expect(plain(formatMoney(-150n, "UZS", "en"))).toBe("-UZS 1.50");
    expect(plain(formatMoney(123_456_789_012_345_678n, "UZS", "en"))).toBe(
      "UZS 1,234,567,890,123,456.78",
    );
  });

  it("formats per locale", () => {
    expect(plain(formatMoney(60_000_000n, "UZS", "ru"))).toMatch(/^600 000/);
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("uz")).toBe(true);
    expect(isLocale("kk")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
