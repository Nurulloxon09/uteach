import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderReceipt, type ReceiptView } from "./index";

/** A valid 48×48 purple PNG standing in for a center logo. */
function purplePng(size = 48): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(size).fill([111, 63, 245]).flat()),
  ]);
  const pixels = deflateSync(Buffer.concat(Array(size).fill(row)));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const LOGO = purplePng();

const VIEWS: Record<"uz" | "ru" | "en", ReceiptView> = {
  uz: {
    centerName: "Nur Academy",
    logo: { data: LOGO, format: "png" },
    branchLine: "Chilonzor · Bunyodkor koʻchasi 12 · +998 71 200 00 00",
    title: "Toʻlov kvitansiyasi",
    receiptNo: "CHI-2026-000123",
    rows: [
      { label: "Sana", value: "12-oktabr, 2026 · 18:05" },
      { label: "Oʻquvchi", value: "Ali Valiyev" },
      { label: "Toʻlovchi", value: "Malika Valiyeva" },
      { label: "Usul", value: "Naqd" },
      { label: "Qabul qildi", value: "Nodira" },
    ],
    amountLabel: "Summa",
    amount: "540 000 soʻm",
    footer: "Rahmat! uteach",
  },
  ru: {
    centerName: "Нур Академия",
    logo: { data: LOGO, format: "png" },
    branchLine: "Чиланзар · ул. Бунёдкор, 12",
    title: "Квитанция об оплате",
    receiptNo: "CHI-2026-000124",
    rows: [
      { label: "Дата", value: "12 октября 2026 г. · 18:05" },
      { label: "Ученик", value: "Анна Ким" },
      { label: "Плательщик", value: "Ирина Ли" },
      { label: "Способ", value: "Карта" },
    ],
    amountLabel: "Сумма",
    amount: "540 000 сум",
    footer: "Спасибо! uteach",
    voidNote: "АННУЛИРОВАНО · Ошибка ввода",
  },
  en: {
    centerName: "Nur Academy",
    logo: null,
    branchLine: "Chilonzor",
    title: "Payment receipt",
    receiptNo: "CHI-2026-000125",
    rows: [
      { label: "Date", value: "Oct 12, 2026 · 18:05" },
      { label: "Student", value: "Ali Valiyev" },
    ],
    amountLabel: "Amount",
    amount: "UZS 540,000",
    footer: "Thank you! uteach",
  },
};

/** Media box of the first page: [x0, y0, width, height] in points. */
function mediaBox(pdf: Buffer): number[] {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(
    pdf.toString("latin1"),
  );
  return m ? m.slice(1).map(Number) : [];
}

const OUT = process.env.RECEIPTS_OUT;

describe("renderReceipt", () => {
  for (const [locale, view] of Object.entries(VIEWS)) {
    it(`renders an 80 mm and an A4 receipt in ${locale}`, async () => {
      const thermal = await renderReceipt(view, "80mm");
      const a4 = await renderReceipt(view, "a4");
      expect(thermal.subarray(0, 5).toString()).toBe("%PDF-");
      expect(a4.subarray(0, 5).toString()).toBe("%PDF-");
      // 80 mm = 226.77 pt wide; A4 = 595.28 × 841.89 pt.
      expect(mediaBox(thermal)[2]).toBeCloseTo(226.77, 1);
      expect(mediaBox(a4)[2]).toBeCloseTo(595.28, 1);
      expect(mediaBox(a4)[3]).toBeCloseTo(841.89, 1);
      if (view.logo) expect(thermal.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(path.join(OUT, `receipt-${locale}-80mm.pdf`), thermal);
        writeFileSync(path.join(OUT, `receipt-${locale}-a4.pdf`), a4);
      }
    }, 120_000);
  }
});
