import { describe, expect, it } from "vitest";
import {
  cefrLevel,
  EXAM_PRESETS,
  examSectionsError,
  examTotal,
  examTotalRange,
  formatScore,
  parseScore,
  ieltsBand,
  isExamPresetCode,
  milliyGrade,
  scoreUplift,
  validateScores,
  type ExamTypeRules,
  type ScoreError,
  type SectionScores,
} from "./exams";
import fixtures from "./exams.fixtures.json";

export type ExamFixture = {
  name: string;
  type: string | ExamTypeRules;
  scores: SectionScores;
  total: number | null;
  errors?: Record<string, ScoreError>;
};

function rules(type: ExamFixture["type"]): ExamTypeRules {
  if (typeof type !== "string") return type;
  if (!isExamPresetCode(type)) throw new Error(`unknown preset ${type}`);
  return EXAM_PRESETS[type];
}

describe("exam fixtures (shared with the SQL trigger)", () => {
  for (const f of fixtures as ExamFixture[]) {
    it(f.name, () => {
      const type = rules(f.type);
      const errors = validateScores(type, f.scores);
      expect(errors).toEqual(f.errors ?? {});
      if (!f.errors) expect(examTotal(type, f.scores)).toBe(f.total);
    });
  }
});

describe("ieltsBand", () => {
  it("rounds .25 up to .5 and .75 up to the next band", () => {
    expect(ieltsBand([6.5, 6.5, 5, 7])).toBe(6.5);
    expect(ieltsBand([6, 7, 8, 6])).toBe(7);
    expect(ieltsBand([6.5, 6.5, 5.5, 6])).toBe(6);
    expect(ieltsBand([6.5, 6.5, 6.5, 7])).toBe(6.5); // 6.625
    expect(ieltsBand([7, 7, 7, 6.5])).toBe(7); // 6.875
  });

  it("covers every .x25 and .x75 mean from 0 to 9", () => {
    const means = (fixtures as ExamFixture[])
      .filter((f) => f.type === "ielts" && f.name.startsWith("IELTS mean"))
      .map((f) => Number(f.name.slice("IELTS mean ".length)));
    for (let x = 0; x < 9; x++) {
      expect(means).toContain(x + 0.25);
      expect(means).toContain(x + 0.75);
    }
  });
});

describe("presets", () => {
  it("have valid sections and the verified total ranges", () => {
    for (const [code, preset] of Object.entries(EXAM_PRESETS)) {
      expect(examSectionsError(preset.sections, preset.totalRule), code).toBeNull();
    }
    expect(examTotalRange(EXAM_PRESETS.ielts)).toEqual({ min: 0, max: 9 });
    expect(examTotalRange(EXAM_PRESETS.sat)).toEqual({ min: 400, max: 1600 });
    expect(examTotalRange(EXAM_PRESETS.cefr)).toEqual({ min: 0, max: 75 });
    expect(examTotalRange(EXAM_PRESETS.milliy)).toEqual({ min: 0, max: 75 });
  });

  it("map CEFR levels and Milliy grades at their boundaries", () => {
    expect([37.9, 38, 50.9, 51, 64.9, 65, 75].map(cefrLevel)).toEqual([
      "below_b1",
      "b1",
      "b1",
      "b2",
      "b2",
      "c1",
      "c1",
    ]);
    expect([45.9, 46, 50, 55, 60, 65, 69.9, 70].map(milliyGrade)).toEqual([
      null,
      "C",
      "C+",
      "B",
      "B+",
      "A",
      "A",
      "A+",
    ]);
  });
});

describe("examSectionsError", () => {
  const s = (key: string, min: number, max: number, step: number) => ({
    key,
    label: { uz: key, ru: key, en: key },
    min,
    max,
    step,
  });
  it("rejects bad custom sections", () => {
    expect(examSectionsError([], "sum")).toBe("section_count");
    expect(examSectionsError([s("a", 0, 10, 1), s("a", 0, 10, 1)], "sum")).toBe("section_key");
    expect(examSectionsError([s("A b", 0, 10, 1)], "sum")).toBe("section_key");
    expect(examSectionsError([s("a", 5, 5, 1)], "sum")).toBe("section_range");
    expect(examSectionsError([s("a", -1, 5, 1)], "sum")).toBe("section_range");
    expect(examSectionsError([s("a", 0, 10, 3)], "sum")).toBe("section_step");
    expect(examSectionsError([s("a", 0, 10, 0.05)], "sum")).toBe("section_decimals");
    expect(examSectionsError([s("a", 0, 10, 1), s("b", 0, 10, 1)], "none")).toBe(
      "none_needs_one_section",
    );
    expect(examSectionsError([s("a", 0, 10, 0.5)], "none")).toBeNull();
  });
});

describe("scoreUplift", () => {
  it("is exact to one decimal", () => {
    expect(scoreUplift(6.5, 5.5)).toBe(1);
    expect(scoreUplift(1370, 1210)).toBe(160);
    expect(scoreUplift(63.3, 60.1)).toBe(3.2);
    expect(scoreUplift(null, 5)).toBeNull();
  });
});

describe("formatScore / parseScore", () => {
  it("formats like the database", () => {
    expect(formatScore(7, "ielts_band")).toBe("7.0");
    expect(formatScore(6.5, "ielts_band")).toBe("6.5");
    expect(formatScore(1370, "sum")).toBe("1370");
    expect(formatScore(63.3, "average")).toBe("63.3");
    expect(formatScore(null, "sum")).toBe("—");
  });
  it("parses typed scores", () => {
    expect(parseScore("6,5")).toBe(6.5);
    expect(parseScore(" 7 ")).toBe(7);
    expect(parseScore("")).toBeNull();
    expect(parseScore("abc")).toBeNaN();
    expect(parseScore("-1")).toBeNaN();
  });
});
