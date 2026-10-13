/**
 * Exam scores (docs/spec/16-exam-scores.md, M6 plan): section validation, totals and the preset mappings.
 * Mirrored by `private.exam_total` / `private.exam_scores_error` in SQL; both read `exams.fixtures.json` in their
 * tests. Scores carry at most one decimal, so the arithmetic runs on whole tenths and never on floats.
 */

export const EXAM_TOTAL_RULES = ["ielts_band", "sum", "average", "none"] as const;
export type ExamTotalRule = (typeof EXAM_TOTAL_RULES)[number];

export const EXAM_RESULT_KINDS = ["diagnostic", "mock", "official"] as const;
export type ExamResultKind = (typeof EXAM_RESULT_KINDS)[number];

export type LocalizedLabel = { uz: string; ru: string; en: string };

export type ExamSection = {
  key: string;
  label: LocalizedLabel;
  min: number;
  max: number;
  step: number;
};

export type ExamTypeRules = {
  sections: readonly ExamSection[];
  totalRule: ExamTotalRule;
};

/** A section value per key; null or missing = not entered. */
export type SectionScores = Record<string, number | null | undefined>;

export type ScoreError = "unknown_section" | "not_a_number" | "out_of_range" | "off_step";

const SECTION_KEY = /^[a-z][a-z0-9_]{0,29}$/;

function tenths(value: number): number | null {
  const t = Math.round(value * 10);
  return Math.abs(t - value * 10) < 1e-6 ? t : null;
}

export function isExamTotalRule(value: unknown): value is ExamTotalRule {
  return typeof value === "string" && (EXAM_TOTAL_RULES as readonly string[]).includes(value);
}

/**
 * Checks a type's sections: 1–8 sections with unique keys, 0 ≤ min < max ≤ 9999, a step that is a whole number
 * of tenths and divides the range, and `none` with exactly one section. Returns null when valid.
 */
export function examSectionsError(
  sections: readonly ExamSection[],
  rule: ExamTotalRule,
): string | null {
  if (sections.length < 1 || sections.length > 8) return "section_count";
  if (rule === "none" && sections.length !== 1) return "none_needs_one_section";
  const keys = new Set<string>();
  for (const s of sections) {
    if (!SECTION_KEY.test(s.key) || keys.has(s.key)) return "section_key";
    keys.add(s.key);
    const min = tenths(s.min);
    const max = tenths(s.max);
    const step = tenths(s.step);
    if (min === null || max === null || step === null) return "section_decimals";
    if (min < 0 || max > 99990 || min >= max) return "section_range";
    if (step < 1 || (max - min) % step !== 0) return "section_step";
  }
  return null;
}

/** One value against its section: null when valid. */
export function sectionScoreError(section: ExamSection, value: number): ScoreError | null {
  if (!Number.isFinite(value)) return "not_a_number";
  const v = tenths(value);
  if (value < section.min || value > section.max) return "out_of_range";
  if (v === null) return "off_step";
  const min = Math.round(section.min * 10);
  const step = Math.round(section.step * 10);
  return (v - min) % step === 0 ? null : "off_step";
}

/** Every invalid entered value, by section key (an empty object = valid). */
export function validateScores(
  type: ExamTypeRules,
  scores: SectionScores,
): Record<string, ScoreError> {
  const errors: Record<string, ScoreError> = {};
  const byKey = new Map(type.sections.map((s) => [s.key, s]));
  for (const [key, value] of Object.entries(scores)) {
    if (value === null || value === undefined) continue;
    const section = byKey.get(key);
    if (!section) {
      errors[key] = "unknown_section";
      continue;
    }
    const error = sectionScoreError(section, value);
    if (error) errors[key] = error;
  }
  return errors;
}

/**
 * IELTS overall band (16): the mean of the four bands; a mean ending in .25 rounds up to .5, .75 up to the next
 * whole band, anything else to the nearest half band. 6.5, 6.5, 5.0, 7.0 → 6.25 → 6.5; 6.5, 6.5, 5.5, 6.0 →
 * 6.125 → 6.0. Bands must be on the 0.5 step.
 */
export function ieltsBand(bands: readonly number[]): number {
  if (bands.length === 0) throw new RangeError("no bands");
  // Sum in tenths; with half bands every value is a multiple of 5, so the mean in eighths is whole.
  const sum = bands.reduce((acc, b) => acc + Math.round(b * 10), 0);
  const eighths = (sum * 8) / (bands.length * 10);
  const whole = Math.floor(eighths / 8);
  const rest = eighths - whole * 8;
  if (rest < 2) return whole;
  if (rest < 6) return whole + 0.5;
  return whole + 1;
}

/**
 * The total by the type's rule, or null until every section has a value. `sum` is exact; `average` keeps one
 * decimal, half up; `none` is the single section's value.
 */
export function examTotal(type: ExamTypeRules, scores: SectionScores): number | null {
  const values: number[] = [];
  for (const s of type.sections) {
    const v = scores[s.key];
    if (v === null || v === undefined) return null;
    values.push(v);
  }
  const t = values.map((v) => Math.round(v * 10));
  const sum = t.reduce((a, b) => a + b, 0);
  switch (type.totalRule) {
    case "ielts_band":
      return ieltsBand(values);
    case "sum":
      return sum / 10;
    case "average":
      return Math.floor((2 * sum + t.length) / (2 * t.length)) / 10;
    case "none":
      return t[0]! / 10;
  }
}

/** The lowest and highest possible totals (stored on the type as total_min / total_max). */
export function examTotalRange(type: ExamTypeRules): { min: number; max: number } {
  const all = (pick: (s: ExamSection) => number) => {
    const scores: SectionScores = {};
    for (const s of type.sections) scores[s.key] = pick(s);
    return examTotal(type, scores)!;
  };
  return { min: all((s) => s.min), max: all((s) => s.max) };
}

// ---------------------------------------------------------------------------
// Presets (global exam types; verified sources in 16)
// ---------------------------------------------------------------------------
export const EXAM_PRESET_CODES = ["ielts", "sat", "cefr", "milliy"] as const;
export type ExamPresetCode = (typeof EXAM_PRESET_CODES)[number];

const lsrw = (min: number, max: number, step: number): ExamSection[] => [
  {
    key: "listening",
    label: { uz: "Tinglash", ru: "Аудирование", en: "Listening" },
    min,
    max,
    step,
  },
  { key: "reading", label: { uz: "Oʻqish", ru: "Чтение", en: "Reading" }, min, max, step },
  { key: "writing", label: { uz: "Yozish", ru: "Письмо", en: "Writing" }, min, max, step },
  { key: "speaking", label: { uz: "Gapirish", ru: "Говорение", en: "Speaking" }, min, max, step },
];

export const EXAM_PRESETS: Record<ExamPresetCode, { name: string } & ExamTypeRules> = {
  ielts: { name: "IELTS", totalRule: "ielts_band", sections: lsrw(0, 9, 0.5) },
  sat: {
    name: "SAT",
    totalRule: "sum",
    sections: [
      {
        key: "reading_writing",
        label: { uz: "Oʻqish va yozish", ru: "Чтение и письмо", en: "Reading and Writing" },
        min: 200,
        max: 800,
        step: 10,
      },
      {
        key: "math",
        label: { uz: "Matematika", ru: "Математика", en: "Math" },
        min: 200,
        max: 800,
        step: 10,
      },
    ],
  },
  cefr: { name: "CEFR (Multilevel)", totalRule: "average", sections: lsrw(0, 75, 1) },
  milliy: {
    name: "Milliy sertifikat",
    totalRule: "none",
    sections: [
      { key: "score", label: { uz: "Ball", ru: "Балл", en: "Score" }, min: 0, max: 75, step: 0.1 },
    ],
  },
};

export function isExamPresetCode(value: unknown): value is ExamPresetCode {
  return typeof value === "string" && (EXAM_PRESET_CODES as readonly string[]).includes(value);
}

export const CEFR_LEVELS = ["below_b1", "b1", "b2", "c1"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Multilevel level from the average of the four sections (UzBMB, 2023): C1 65–75, B2 51–64, B1 38–50. */
export function cefrLevel(total: number): CefrLevel {
  if (total >= 65) return "c1";
  if (total >= 51) return "b2";
  if (total >= 38) return "b1";
  return "below_b1";
}

export const MILLIY_GRADES = ["A+", "A", "B+", "B", "C+", "C"] as const;
export type MilliyGrade = (typeof MILLIY_GRADES)[number];

/** Milliy sertifikat grade (UzBMB, 17-01-2024); null below 46 (no certificate). */
export function milliyGrade(score: number): MilliyGrade | null {
  if (score >= 70) return "A+";
  if (score >= 65) return "A";
  if (score >= 60) return "B+";
  if (score >= 55) return "B";
  if (score >= 50) return "C+";
  if (score >= 46) return "C";
  return null;
}

/** The level or grade shown next to a preset's total, if the preset has one. */
export function examGradeLabel(code: string | null, total: number | null): string | null {
  if (total === null) return null;
  if (code === "cefr") return cefrLevel(total);
  if (code === "milliy") return milliyGrade(total);
  return null;
}

/** Latest − baseline, one decimal; null without both. */
export function scoreUplift(latest: number | null, baseline: number | null): number | null {
  if (latest === null || baseline === null) return null;
  return (Math.round(latest * 10) - Math.round(baseline * 10)) / 10;
}

/**
 * A score for display, like `private.score_text`: IELTS keeps its decimal (7.0); other whole values drop it
 * (1370, 63); others show one decimal (63.3).
 */
export function formatScore(value: number | null | undefined, rule: ExamTotalRule): string {
  if (value === null || value === undefined) return "—";
  if (rule !== "ielts_band" && Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Parses a typed score ("6,5" or "6.5"); null when empty, NaN when not a number. */
export function parseScore(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  return /^\d{1,5}(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}
