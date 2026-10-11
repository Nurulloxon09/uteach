"use server";

import { ATTENDANCE_STATUSES } from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";

const sheetSchema = z.object({
  lessonId: uuidField,
  rows: z
    .array(
      z.object({
        studentId: uuidField,
        status: z.enum(ATTENDANCE_STATUSES),
        lateMinutes: z.number().int().min(1).max(240).nullable(),
        note: z.string().trim().max(500),
      }),
    )
    .max(300),
  /** null leaves the topic as it is. */
  topic: z.string().trim().max(500).nullable(),
});

export type SaveAttendanceInput = z.input<typeof sheetSchema>;
export type SaveAttendanceResult =
  { ok: true; saved: number; alerts: number } | { ok: false; error: string };

/**
 * Saves the whole sheet with one RPC (14): one request from the phone. The database applies the window
 * rules, sets the lesson `held`, audits late admin edits and queues absence alerts.
 */
export async function saveAttendanceAction(
  input: SaveAttendanceInput,
): Promise<SaveAttendanceResult> {
  const parsed = sheetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "db.invalid_attendance" };
  const { lessonId, rows, topic } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_attendance", {
    p_lesson_id: lessonId,
    p_rows: rows.map((r) => ({
      studentId: r.studentId,
      status: r.status,
      lateMinutes: r.status === "late" ? r.lateMinutes : null,
      note: r.note,
    })),
    ...(topic !== null ? { p_topic: topic } : {}),
  });
  if (error) return { ok: false, error: dbErrorKey(error) };

  revalidatePath("/[locale]/attendance", "layout");
  revalidatePath("/[locale]/today", "page");
  revalidatePath("/[locale]/groups", "layout");
  const result = (data ?? {}) as { saved?: number; alerts?: number };
  return { ok: true, saved: result.saved ?? 0, alerts: result.alerts ?? 0 };
}
