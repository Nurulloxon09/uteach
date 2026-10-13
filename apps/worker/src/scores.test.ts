import { EXAM_PRESETS } from "@uteach/core";
import { describe, expect, it } from "vitest";
import { translator } from "./i18n";
import { scoresText, type ScoreCard } from "./scores";

const card = (code: "ielts" | "cefr" | "milliy", extra: Partial<ScoreCard>): ScoreCard => ({
  code,
  name: EXAM_PRESETS[code].name,
  totalRule: EXAM_PRESETS[code].totalRule,
  sections: EXAM_PRESETS[code].sections.map((s) => ({ key: s.key, label: s.label })),
  latest: null,
  target: null,
  recent: [],
  ...extra,
});

const ielts = card("ielts", {
  latest: {
    kind: "mock",
    takenOn: "2026-10-12",
    scores: { listening: 6.5, reading: 7, writing: 6, speaking: 6.5 },
    total: 6.5,
  },
  target: { total: 7, examDate: "2026-12-20" },
  recent: [
    { takenOn: "2026-09-01", kind: "diagnostic", total: 5.5 },
    { takenOn: "2026-09-20", kind: "mock", total: 6.5 },
    { takenOn: "2026-10-01", kind: "mock", total: 6 },
    { takenOn: "2026-10-12", kind: "mock", total: 6.5 },
  ],
});

describe("bot Scores text", () => {
  it("shows the latest result, target, gap, exam day and the trend", () => {
    const text = scoresText("Ali", [ielts], "2026-10-13", "en", translator("en"));
    expect(text).toContain("Ali · scores");
    expect(text).toContain("📘 IELTS");
    expect(text).toContain("Latest: Mock,");
    expect(text).toContain("Listening 6.5 · Reading 7.0 · Writing 6.0 · Speaking 6.5");
    expect(text).toContain("Overall: 6.5");
    expect(text).toContain("Target: 7.0 · 0.5 to go");
    expect(text).toContain("(68 days left)");
    expect(text).toContain("Last results: 5.5 · 6.5↑ · 6.0↓ · 6.5↑");
  });

  it("adds the CEFR level and the Milliy sertifikat grade, and marks a reached target", () => {
    const cefr = card("cefr", {
      latest: {
        kind: "official",
        takenOn: "2026-10-01",
        scores: { listening: 60, reading: 55, writing: 50, speaking: 52 },
        total: 54.3,
      },
      target: { total: 51, examDate: null },
    });
    const milliy = card("milliy", {
      latest: { kind: "mock", takenOn: "2026-10-02", scores: { score: 44 }, total: 44 },
    });
    const text = scoresText("Ali", [cefr, milliy], "2026-10-13", "ru", translator("ru"));
    expect(text).toContain("Общий балл: 54.3 (B2)");
    expect(text).toContain("Цель: 51 · достигнута ✅");
    expect(text).toContain("Общий балл: 44 (Без сертификата)");
    // One section is the total itself: no separate section line.
    expect(text).not.toContain("Балл 44");
  });

  it("a partial mock lists its sections without a total; a target alone still shows", () => {
    const partial = card("ielts", {
      latest: { kind: "mock", takenOn: "2026-10-12", scores: { listening: 6 }, total: null },
    });
    const onlyTarget = card("cefr", { target: { total: 51, examDate: "2026-10-13" } });
    const text = scoresText("Ali", [partial, onlyTarget], "2026-10-13", "uz", translator("uz"));
    expect(text).toContain("Tinglash 6.0");
    expect(text).not.toContain("Umumiy ball");
    expect(text).toContain("Hozircha natijalar yoʻq.");
    expect(text).toContain("Maqsad: 51");
    expect(text).toContain("(bugun)");
  });

  it("says so when there is nothing yet", () => {
    expect(scoresText("Ali", [], "2026-10-13", "en", translator("en"))).toContain("No scores yet.");
  });
});
