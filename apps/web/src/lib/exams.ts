import "server-only";
import {
  isExamTotalRule,
  type ExamResultKind,
  type ExamSection,
  type ExamTotalRule,
} from "@uteach/core";
import { cache } from "react";
import type { CenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

/** Read helpers shared by the exam score screens (16). Everything goes through the user's session (RLS). */

export type ExamTypeOption = {
  id: string;
  /** Preset code (`ielts`, `sat`, `cefr`, `milliy`), or null for a center's own type. */
  presetCode: string | null;
  name: string;
  sections: ExamSection[];
  totalRule: ExamTotalRule;
  totalMin: number;
  totalMax: number;
  archived: boolean;
};

export type ExamResultRow = {
  id: string;
  examTypeId: string;
  groupId: string | null;
  kind: ExamResultKind;
  takenOn: string;
  scores: Record<string, number>;
  total: number | null;
  certificatePath: string | null;
  note: string | null;
};

export type StudentTargetRow = {
  examTypeId: string;
  targetTotal: number | null;
  examDate: string | null;
  baselineTotal: number | null;
};

function toSections(value: unknown): ExamSection[] {
  return Array.isArray(value) ? (value as ExamSection[]) : [];
}

/** Presets first, then the center's own types by name. */
export const loadExamTypes = cache(async (ctx: CenterContext): Promise<ExamTypeOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_types")
    .select("id, center_id, code, name, sections, total_rule, total_min, total_max, archived_at")
    .or(`center_id.is.null,center_id.eq.${ctx.center.id}`)
    .order("name");
  const rows = (data ?? []).map((t) => ({
    id: t.id,
    presetCode: t.center_id === null ? t.code : null,
    name: t.name,
    sections: toSections(t.sections),
    totalRule: isExamTotalRule(t.total_rule) ? t.total_rule : "sum",
    totalMin: Number(t.total_min),
    totalMax: Number(t.total_max),
    archived: t.archived_at !== null,
  }));
  const order = ["ielts", "sat", "cefr", "milliy"];
  return rows.sort((a, b) => {
    const pa = a.presetCode ? order.indexOf(a.presetCode) : order.length;
    const pb = b.presetCode ? order.indexOf(b.presetCode) : order.length;
    return pa - pb || a.name.localeCompare(b.name);
  });
});

/** A student's results (oldest first) and targets. */
export async function loadStudentScores(studentId: string) {
  const supabase = await createClient();
  const [{ data: results }, { data: targets }] = await Promise.all([
    supabase
      .from("exam_results")
      .select(
        "id, exam_type_id, group_id, kind, taken_on, section_scores, total_score, certificate_path, note",
      )
      .eq("student_id", studentId)
      .order("taken_on")
      .order("created_at"),
    supabase
      .from("student_targets")
      .select("exam_type_id, target_total, exam_date, baseline_total")
      .eq("student_id", studentId),
  ]);
  return {
    results: (results ?? []).map((r): ExamResultRow => ({
      id: r.id,
      examTypeId: r.exam_type_id,
      groupId: r.group_id,
      kind: r.kind,
      takenOn: r.taken_on,
      scores: (r.section_scores ?? {}) as Record<string, number>,
      total: r.total_score === null ? null : Number(r.total_score),
      certificatePath: r.certificate_path,
      note: r.note,
    })),
    targets: (targets ?? []).map((t): StudentTargetRow => ({
      examTypeId: t.exam_type_id,
      targetTotal: t.target_total === null ? null : Number(t.target_total),
      examDate: t.exam_date,
      baselineTotal: t.baseline_total === null ? null : Number(t.baseline_total),
    })),
  };
}

/** The exam type a group's scores default to: its course's, else IELTS, else the first. */
export function defaultExamType(
  types: ExamTypeOption[],
  courseExamTypeId: string | null | undefined,
): ExamTypeOption | undefined {
  const live = types.filter((t) => !t.archived);
  return (
    live.find((t) => t.id === courseExamTypeId) ??
    live.find((t) => t.presetCode === "ielts") ??
    live[0]
  );
}
