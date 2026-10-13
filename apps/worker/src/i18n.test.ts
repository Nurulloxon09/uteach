import { locales } from "@uteach/i18n";
import en from "@uteach/i18n/messages/en.json";
import { describe, expect, it } from "vitest";
import { addDays, formatTime, localeFromTelegram, todayIn, translator } from "./i18n";
import { receiptView } from "./receipt";

const values = {
  names: "Ali (Center A)",
  name: "Ali",
  center: "Center A",
  centers: "Center A",
  student: "Ali",
  from: "14 Oct",
  to: "20 Oct",
  rate: "90",
  amount: "600 000 soʻm",
  date: "14 Oct",
  days: 3,
  receiptNo: "CHI-2026-000001",
  kind: "Mock",
  total: "6.5",
  target: "7.0",
  gap: "0.5",
  list: "6.0 · 6.5↑",
};

function keys(node: unknown, prefix: string): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("bot texts", () => {
  it("every bot message renders in every language", () => {
    for (const locale of locales) {
      const t = translator(locale);
      for (const key of keys(en.bot, "bot")) {
        expect(t(key, values), `${locale}:${key}`).not.toMatch(/[{}]/);
      }
    }
  });

  it("plural forms follow the language", () => {
    expect(translator("ru")("bot.debtOverdue", { ...values, days: 5 })).toContain("5 дней");
    expect(translator("en")("bot.debtOverdue", { ...values, days: 1 })).toContain("1 day overdue");
  });

  it("reads Telegram's language code, defaulting to Uzbek", () => {
    expect(localeFromTelegram("ru")).toBe("ru");
    expect(localeFromTelegram("en-GB")).toBe("en");
    expect(localeFromTelegram("de")).toBe("uz");
    expect(localeFromTelegram(undefined)).toBe("uz");
  });
});

describe("dates", () => {
  it("today and times in the center's timezone", () => {
    const at = new Date("2026-10-13T20:30:00Z"); // 01:30 on the 14th in Tashkent
    expect(todayIn("Asia/Tashkent", at)).toBe("2026-10-14");
    expect(formatTime(at, "Asia/Tashkent")).toBe("01:30");
    expect(addDays("2026-10-28", 6)).toBe("2026-11-03");
  });
});

describe("receipt", () => {
  it("builds the receipt with the web app's labels, VOID included", () => {
    const view = receiptView(
      {
        paymentId: "p",
        receiptNo: "CHI-2026-000001",
        amount: "60000000",
        method: "cash",
        paidAt: "2026-10-13T05:00:00Z",
        payerName: null,
        voided: true,
        voidReason: "Twice",
        student: "Ali",
        centerName: "Center A",
        currency: "UZS",
        timezone: "Asia/Tashkent",
        branchName: "Chilonzor",
        branchAddress: null,
        branchPhone: "+998712000000",
      },
      "en",
    );
    expect(view.title).toBe("Payment receipt");
    expect(view.branchLine).toBe("Chilonzor · +998712000000");
    expect(view.rows.map((r) => r.label)).toEqual(["Date", "Student", "Method"]);
    expect(view.rows[2]!.value).toBe("Cash");
    expect(view.voidNote).toContain("Twice");
  });
});
