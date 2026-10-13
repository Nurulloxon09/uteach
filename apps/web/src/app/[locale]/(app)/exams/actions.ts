"use server";

import { EXAM_TOTAL_RULES, parseScore } from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@uteach/db";
import { dateField, optionalDateField, requiredText, uuidField } from "@/lib/validation";

function refresh() {
  revalidatePath("/[locale]/exams", "page");
  revalidatePath("/[locale]/groups", "layout");
  revalidatePath("/[locale]/students", "layout");
}

/** A typed score field: "" → null, "6,5" → 6.5; anything else is an error. */
const optionalScoreField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const n = parseScore(value);
    if (n === null) return null;
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: "validation.score" });
      return z.NEVER;
    }
    return n;
  });

const scoresObject = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,29}$/), z.number().nullable());

// ---------------------------------------------------------------------------
// Group entry
// ---------------------------------------------------------------------------
const groupScoresSchema = z.object({
  groupId: uuidField,
  examTypeId: uuidField,
  kind: z.enum(["diagnostic", "mock"]),
  takenOn: dateField,
  rows: z.array(z.object({ studentId: uuidField, scores: scoresObject })).max(200),
});

export type SaveGroupScoresInput = z.input<typeof groupScoresSchema>;
export type SaveGroupScoresResult =
  { ok: true; saved: number; deleted: number; notified: number } | { ok: false; error: string };

/** Saves the whole grid in one RPC (16): the database validates every value and computes the totals. */
export async function saveGroupScoresAction(
  input: SaveGroupScoresInput,
): Promise<SaveGroupScoresResult> {
  const parsed = groupScoresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "db.exam_score_invalid" };
  const { groupId, examTypeId, kind, takenOn, rows } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_group_scores", {
    p_group_id: groupId,
    p_exam_type_id: examTypeId,
    p_kind: kind,
    p_taken_on: takenOn,
    p_rows: rows,
  });
  if (error) return { ok: false, error: dbErrorKey(error) };
  refresh();
  const result = (data ?? {}) as { saved?: number; deleted?: number; notified?: number };
  return {
    ok: true,
    saved: result.saved ?? 0,
    deleted: result.deleted ?? 0,
    notified: result.notified ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Official results, deleting, targets
// ---------------------------------------------------------------------------
/** Section inputs are named `score.<key>`. */
function readScores(form: FormData): Record<string, string> {
  const scores: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (name.startsWith("score.") && typeof value === "string") scores[name.slice(6)] = value;
  }
  return scores;
}

export async function saveOfficialResultAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      studentId: uuidField,
      examTypeId: uuidField,
      takenOn: dateField,
      certificatePath: z
        .string()
        .trim()
        .refine((p) => p === "" || p.startsWith(`${ctx.center.id}/certificates/`), {
          message: "validation.invalid",
        }),
      note: z.string().trim().max(500, { error: "validation.tooLong" }),
    })
    .safeParse({
      studentId: str(form, "studentId"),
      examTypeId: str(form, "examTypeId"),
      takenOn: str(form, "takenOn"),
      certificatePath: str(form, "certificatePath"),
      note: str(form, "note"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const scores: Record<string, number> = {};
  const fieldErrors: Record<string, string> = {};
  for (const [key, text] of Object.entries(readScores(form))) {
    const value = optionalScoreField.safeParse(text);
    if (!value.success) fieldErrors[`score.${key}`] = "validation.score";
    else if (value.data !== null) scores[key] = value.data;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  if (Object.keys(scores).length === 0) return fail("db.exam_score_invalid", form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_official_result", {
    p_student_id: parsed.data.studentId,
    p_exam_type_id: parsed.data.examTypeId,
    p_taken_on: parsed.data.takenOn,
    p_scores: scores,
    p_certificate_path: parsed.data.certificatePath || undefined,
    p_note: parsed.data.note || undefined,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function deleteExamResultAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "id"));
  if (!id.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_exam_result", { p_result_id: id.data });
  if (error) return fail(dbErrorKey(error));
  refresh();
  return { ok: true };
}

export async function setTargetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      studentId: uuidField,
      examTypeId: uuidField,
      targetTotal: optionalScoreField,
      examDate: optionalDateField,
      baselineTotal: optionalScoreField,
    })
    .safeParse({
      studentId: str(form, "studentId"),
      examTypeId: str(form, "examTypeId"),
      targetTotal: str(form, "targetTotal"),
      examDate: str(form, "examDate"),
      baselineTotal: str(form, "baselineTotal"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  // A form without the baseline field (the group's table) keeps the saved one.
  let baseline = parsed.data.baselineTotal;
  if (form.get("baselineTotal") === null) {
    const { data: saved } = await supabase
      .from("student_targets")
      .select("baseline_total")
      .eq("student_id", parsed.data.studentId)
      .eq("exam_type_id", parsed.data.examTypeId)
      .maybeSingle();
    baseline =
      saved?.baseline_total === undefined || saved.baseline_total === null
        ? null
        : Number(saved.baseline_total);
  }
  const { error } = await supabase.rpc("set_student_target", {
    p_student_id: parsed.data.studentId,
    p_exam_type_id: parsed.data.examTypeId,
    // A target without a score but with a date is allowed (02).
    p_target_total: parsed.data.targetTotal as number,
    p_exam_date: parsed.data.examDate ?? undefined,
    p_baseline_total: baseline ?? undefined,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings → Exam types (custom types; presets have no write grant)
// ---------------------------------------------------------------------------
const sectionsSchema = z
  .array(
    z.object({
      name: requiredText(40),
      min: z.number().min(0).max(9999),
      max: z.number().min(0).max(9999),
      step: z.number().min(0.1).max(9999),
    }),
  )
  .min(1)
  .max(8);

/** The editor posts its sections as JSON (`sections`); one typed name is used in every language. */
function readSections(form: FormData) {
  try {
    const raw = JSON.parse(str(form, "sections")) as unknown;
    const parsed = sectionsSchema.safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data.map((s, i) => ({
      key: `s${i + 1}`,
      label: { uz: s.name, ru: s.name, en: s.name },
      min: s.min,
      max: s.max,
      step: s.step,
    }));
  } catch {
    return null;
  }
}

const typeSchema = z.object({
  name: requiredText(80),
  totalRule: z.enum(
    EXAM_TOTAL_RULES.filter((r) => r !== "ielts_band") as ["sum", "average", "none"],
    {
      error: "validation.invalid",
    },
  ),
});

function refreshTypes() {
  revalidatePath("/[locale]/settings/exam-types", "page");
  refresh();
}

export async function createExamTypeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = typeSchema.safeParse({
    name: str(form, "name"),
    totalRule: str(form, "totalRule"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const sections = readSections(form);
  if (!sections) return fail("db.invalid_exam_type", form);
  const supabase = await createClient();
  // `code` and the total range are filled by the exam_types trigger (only these columns are granted).
  const row = {
    center_id: ctx.center.id,
    name: parsed.data.name,
    total_rule: parsed.data.totalRule,
    sections,
  } as unknown as Database["public"]["Tables"]["exam_types"]["Insert"];
  const { error } = await supabase.from("exam_types").insert(row);
  if (error) return fail(dbErrorKey(error), form);
  refreshTypes();
  return { ok: true };
}

/** Renames a type; its sections and rule change only while no result uses it (the trigger says so). */
export async function updateExamTypeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "id"));
  const parsed = typeSchema.safeParse({
    name: str(form, "name"),
    totalRule: str(form, "totalRule"),
  });
  if (!id.success) return fail("generic", form);
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const sections = form.get("sections") === null ? undefined : readSections(form);
  if (sections === null) return fail("db.invalid_exam_type", form);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_types")
    .update({
      name: parsed.data.name,
      ...(sections ? { sections, total_rule: parsed.data.totalRule } : {}),
    })
    .eq("id", id.data)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);
  refreshTypes();
  return { ok: true };
}

export async function archiveExamTypeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "id"));
  if (!id.success) return fail("generic");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_types")
    .update({ archived_at: form.get("restore") === "1" ? null : new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");
  refreshTypes();
  return { ok: true };
}
