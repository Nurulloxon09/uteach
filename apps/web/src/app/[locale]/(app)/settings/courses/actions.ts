"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { toDbAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import {
  optionalIntField,
  optionalMoneyField,
  optionalText,
  requiredText,
  uuidField,
} from "@/lib/validation";

const KINDS = ["language", "exam_prep", "school_subject", "other"] as const;

function refresh() {
  revalidatePath("/[locale]/settings/courses", "layout");
  revalidatePath("/[locale]/groups", "layout");
}

const courseSchema = z.object({
  name: requiredText(),
  kind: z.enum(KINDS, { error: "validation.invalid" }),
  defaultLessonMinutes: optionalIntField(15, 480),
  defaultPrice: optionalMoneyField,
  description: optionalText(500),
  examTypeId: z.union([uuidField, z.literal("none")]).transform((v) => (v === "none" ? null : v)),
});

function readCourse(form: FormData) {
  return {
    name: str(form, "name"),
    kind: str(form, "kind"),
    defaultLessonMinutes: str(form, "defaultLessonMinutes"),
    defaultPrice: str(form, "defaultPrice"),
    description: str(form, "description"),
    examTypeId: str(form, "examTypeId") || "none",
  };
}

export async function createCourseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = courseSchema.safeParse(readCourse(form));
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      center_id: ctx.center.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      default_lesson_minutes: parsed.data.defaultLessonMinutes,
      // Money is written only by staff who can see it.
      default_price_amount:
        ctx.can.billing && parsed.data.defaultPrice !== null
          ? toDbAmount(parsed.data.defaultPrice)
          : null,
      description: parsed.data.description,
      exam_type_id: parsed.data.examTypeId,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updateCourseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = courseSchema
    .extend({ id: uuidField })
    .safeParse({ ...readCourse(form), id: str(form, "id") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .update({
      name: parsed.data.name,
      kind: parsed.data.kind,
      default_lesson_minutes: parsed.data.defaultLessonMinutes,
      description: parsed.data.description,
      exam_type_id: parsed.data.examTypeId,
      ...(ctx.can.billing
        ? {
            default_price_amount:
              parsed.data.defaultPrice !== null ? toDbAmount(parsed.data.defaultPrice) : null,
          }
        : {}),
    })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  refresh();
  return { ok: true };
}

/** Archive or restore a course or a level. */
async function setArchived(table: "courses" | "levels", form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, archived: z.enum(["true", "false"]) })
    .safeParse({ id: str(form, "id"), archived: str(form, "archived") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .update({ archived_at: parsed.data.archived === "true" ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");

  refresh();
  return { ok: true };
}

export async function archiveCourseAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return setArchived("courses", form);
}

export async function archiveLevelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return setArchived("levels", form);
}

// --- Levels --------------------------------------------------------------------

const levelSchema = z.object({
  name: requiredText(),
  nextLevelId: z.union([uuidField, z.literal("")]).transform((v) => v || null),
});

export async function createLevelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = levelSchema.extend({ courseId: uuidField }).safeParse({
    name: str(form, "name"),
    nextLevelId: str(form, "nextLevelId"),
    courseId: str(form, "courseId"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("levels")
    .select("sort_order")
    .eq("course_id", parsed.data.courseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("levels").insert({
    center_id: ctx.center.id,
    course_id: parsed.data.courseId,
    name: parsed.data.name,
    sort_order: (last?.sort_order ?? 0) + 1,
    next_level_id: parsed.data.nextLevelId,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}

export async function updateLevelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = levelSchema.extend({ id: uuidField }).safeParse({
    name: str(form, "name"),
    nextLevelId: str(form, "nextLevelId"),
    id: str(form, "id"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  if (parsed.data.nextLevelId === parsed.data.id) return fail("validation.invalid", form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("levels")
    .update({ name: parsed.data.name, next_level_id: parsed.data.nextLevelId })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  refresh();
  return { ok: true };
}

/** Swaps a level with its neighbour above or below. */
export async function moveLevelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, direction: z.enum(["up", "down"]) })
    .safeParse({ id: str(form, "id"), direction: str(form, "direction") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data: level } = await supabase
    .from("levels")
    .select("id, course_id, sort_order")
    .eq("id", parsed.data.id)
    .single();
  if (!level) return fail("db.not_found");

  const { data: siblings } = await supabase
    .from("levels")
    .select("id, sort_order")
    .eq("course_id", level.course_id)
    .is("archived_at", null)
    .order("sort_order");
  const list = siblings ?? [];
  const index = list.findIndex((l) => l.id === level.id);
  const other = list[parsed.data.direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return { ok: true };

  // Renumber the whole list so ties can't survive, then swap the two.
  const order = list.map((l) => l.id);
  [order[index], order[list.indexOf(other)]] = [other.id, level.id];
  for (const [i, id] of order.entries()) {
    const { error } = await supabase
      .from("levels")
      .update({ sort_order: i + 1 })
      .eq("id", id);
    if (error) return fail(dbErrorKey(error));
  }

  refresh();
  return { ok: true };
}
