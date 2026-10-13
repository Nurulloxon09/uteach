import { describe, expect, it } from "vitest";
import { formatMoney } from "./index";
import { renderTemplate } from "./notifications";

describe("renderTemplate", () => {
  it("formats money from minor units and ISO days in the recipient's language", () => {
    const text = renderTemplate(
      "{student}: {amount} is due on {dueDate}.",
      { student: "Ali", amount: "60000000", dueDate: "2026-10-22" },
      { locale: "en", currency: "UZS", today: "2026-10-13" },
    );
    expect(text).toBe(`Ali: ${formatMoney(60000000n, "UZS", "en")} is due on October 22.`);
  });

  it("shows the year of a date in another year", () => {
    expect(
      renderTemplate(
        "since {oldestDueDate}",
        { oldestDueDate: "2025-12-30" },
        {
          locale: "ru",
          currency: "UZS",
          today: "2026-01-05",
        },
      ),
    ).toMatch(/2025/);
  });

  it("handles ICU plurals with numbers from the payload", () => {
    const body = "{minutes, plural, =0 {{student} was late.} other {{student} was # min late.}}";
    expect(
      renderTemplate(body, { student: "Ali", minutes: 0 }, { locale: "en", currency: "UZS" }),
    ).toBe("Ali was late.");
    expect(
      renderTemplate(body, { student: "Ali", minutes: 7 }, { locale: "en", currency: "UZS" }),
    ).toBe("Ali was 7 min late.");
  });

  it("uses a broadcast's text in the recipient's language, else the default text", () => {
    const payload = { center: "Center A", body: "Darslar", bodies: { ru: "Занятия" } };
    expect(renderTemplate("{center}: {body}", payload, { locale: "ru", currency: "UZS" })).toBe(
      "Center A: Занятия",
    );
    expect(renderTemplate("{center}: {body}", payload, { locale: "en", currency: "UZS" })).toBe(
      "Center A: Darslar",
    );
  });

  it("does not interpret braces or apostrophes inside values", () => {
    expect(
      renderTemplate("{body}", { body: "Don't {forget}" }, { locale: "en", currency: "UZS" }),
    ).toBe("Don't {forget}");
  });

  it("throws when the payload lacks a value the template uses", () => {
    expect(() =>
      renderTemplate("{student} {group}", { student: "Ali" }, { locale: "en", currency: "UZS" }),
    ).toThrow();
  });
});
