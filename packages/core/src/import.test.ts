import { describe, expect, it } from "vitest";
import {
  IMPORT_FIELDS,
  cellText,
  guessMapping,
  normalizeHeader,
  parseDateCell,
  parseGenderCell,
  parseIntCell,
  parseRelationCell,
  parseTimeCell,
} from "./import";

describe("guessMapping", () => {
  const labels = {
    fullName: ["Full name", "F.I.Sh.", "ФИО"],
    phone: ["Phone", "Telefon", "Телефон"],
    guardianPhone: ["Guardian's phone", "Vasiy telefoni", "Телефон родителя"],
  };

  it("matches template headers in any language and common aliases", () => {
    const mapping = guessMapping(
      ["ФИО", "Телефон", "Телефон родителя", "Дата рождения", "Something else"],
      labels,
      IMPORT_FIELDS.students,
    );
    expect(mapping.fullName).toBe(0);
    expect(mapping.phone).toBe(1);
    expect(mapping.guardianPhone).toBe(2);
    expect(mapping.birthDate).toBe(3);
    expect(mapping.school).toBeNull();
  });

  it("uses each column once and ignores punctuation and case", () => {
    const mapping = guessMapping(["f.i.sh.", "TELEFON"], labels, IMPORT_FIELDS.students);
    expect(mapping).toMatchObject({ fullName: 0, phone: 1, guardianPhone: null });
    expect(normalizeHeader("  Oʻquvchi_ism  ")).toBe("oquvchi ism");
  });
});

describe("cell parsing", () => {
  it("reads dates from Excel dates, serials and day-first text", () => {
    expect(parseDateCell(new Date(Date.UTC(2026, 9, 12)))).toBe("2026-10-12");
    expect(parseDateCell(46307)).toBe("2026-10-12");
    expect(parseDateCell("2026-10-12")).toBe("2026-10-12");
    expect(parseDateCell("12.10.2026")).toBe("2026-10-12");
    expect(parseDateCell("12/10/2026")).toBe("2026-10-12");
    expect(parseDateCell("31.02.2026")).toBeNull();
    expect(parseDateCell("next monday")).toBeNull();
  });

  it("reads times", () => {
    expect(parseTimeCell("18:00")).toBe("18:00");
    expect(parseTimeCell("9.30")).toBe("09:30");
    expect(parseTimeCell(0.75)).toBe("18:00");
    expect(parseTimeCell("25:00")).toBeNull();
  });

  it("reads numbers, genders and relations in three languages", () => {
    expect(parseIntCell("12", 1, 100)).toBe(12);
    expect(parseIntCell("", 1, 100)).toBeUndefined();
    expect(parseIntCell("0", 1, 100)).toBeNull();
    expect(parseGenderCell("Ayol")).toBe("female");
    expect(parseGenderCell("М")).toBe("male");
    expect(parseGenderCell("?")).toBeNull();
    expect(parseRelationCell("Мама")).toBe("mother");
    expect(parseRelationCell("Ota-ona")).toBe("parent");
  });

  it("flattens rich text and keeps phone digits", () => {
    expect(cellText({ richText: [{ text: "Ali " }, { text: "Valiyev" }] })).toBe("Ali Valiyev");
    expect(cellText(998901234567)).toBe("998901234567");
    expect(cellText({ formula: "A1", result: "x" })).toBe("x");
  });
});
