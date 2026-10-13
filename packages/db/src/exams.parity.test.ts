import { fileURLToPath } from "node:url";
import {
  EXAM_PRESET_CODES,
  EXAM_PRESETS,
  examTotal,
  isExamPresetCode,
  validateScores,
  type ExamTypeRules,
  type ScoreError,
  type SectionScores,
} from "@uteach/core";
import fixtures from "@uteach/core/exams.fixtures.json";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 16-exam-scores (M6 plan): validation and totals exist in SQL (`private.exam_score_errors`,
 * `private.exam_total`, used by the `exam_results` trigger) and in TypeScript (`validateScores`, `examTotal`,
 * used by the score grid). Both must agree on the shared fixtures, and the seeded presets must match
 * EXAM_PRESETS.
 */
type Fixture = {
  name: string;
  type: string | ExamTypeRules;
  scores: SectionScores;
  total: number | null;
  errors?: Record<string, ScoreError>;
};

const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

function rules(type: Fixture["type"]): ExamTypeRules {
  if (typeof type !== "string") return type;
  if (!isExamPresetCode(type)) throw new Error(`unknown preset ${type}`);
  return EXAM_PRESETS[type];
}

describe("seeded presets match EXAM_PRESETS", () => {
  it("every preset", async () => {
    const result = await db.query<{
      code: string;
      name: string;
      sections: unknown;
      total_rule: string;
    }>(
      `select code, name, sections, total_rule from public.exam_types where center_id is null order by code`,
    );
    expect(result.rows.map((r) => r.code)).toEqual([...EXAM_PRESET_CODES].sort());
    for (const row of result.rows) {
      const preset = EXAM_PRESETS[row.code as keyof typeof EXAM_PRESETS];
      expect(row.name).toBe(preset.name);
      expect(row.total_rule).toBe(preset.totalRule);
      expect(row.sections).toEqual(preset.sections);
    }
  });
});

describe("SQL scoring matches packages/core on the shared fixtures", () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, async () => {
      const type = rules(f.type);
      const result = await db.query<{ errors: Record<string, string>; total: string | null }>(
        `select private.exam_score_errors($1::jsonb, $2::jsonb) as errors,
                private.exam_total($1::jsonb, $3, $2::jsonb)::text as total`,
        [JSON.stringify(type.sections), JSON.stringify(f.scores), type.totalRule],
      );
      const row = result.rows[0]!;
      expect(row.errors).toEqual(validateScores(type, f.scores));
      expect(row.errors).toEqual(f.errors ?? {});
      if (!f.errors) {
        const sql = row.total === null ? null : Number(row.total);
        expect(sql).toBe(examTotal(type, f.scores));
        expect(sql).toBe(f.total);
      }
    });
  }
});
