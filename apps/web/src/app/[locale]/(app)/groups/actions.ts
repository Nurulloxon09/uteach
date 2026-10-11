"use server";

import { toInstant } from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import {
  dateField,
  optionalDateField,
  optionalIntField,
  optionalMoneyField,
  intField,
  moneyField,
  requiredText,
  timeField,
  uuidField,
} from "@/lib/validation";

const optionalUuid = z.union([uuidField, z.literal("")]).transform((v) => v || null);

const slotSchema = z.object({
  id: z.uuid().optional(),
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  durationMinutes: z.number().int().min(15).max(480),
  roomId: z.uuid().nullish(),
  teacherMembershipId: z.uuid().nullish(),
});

/** The rules editor submits its slots as JSON. */
const slotsField = z.string().transform((value, ctx) => {
  try {
    const parsed = z
      .array(slotSchema)
      .max(14)
      .safeParse(JSON.parse(value || "[]"));
    if (parsed.success) {
      return parsed.data.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        weekday: s.weekday,
        startTime: s.startTime.slice(0, 5),
        durationMinutes: s.durationMinutes,
        roomId: s.roomId ?? null,
        teacherMembershipId: s.teacherMembershipId ?? null,
      }));
    }
  } catch {
    // fall through
  }
  ctx.addIssue({ code: "custom", message: "validation.slots" });
  return z.NEVER;
});

function refresh(groupId?: string) {
  revalidatePath("/[locale]/groups", "page");
  if (groupId) revalidatePath(`/[locale]/groups/${groupId}`, "page");
  revalidatePath("/[locale]/schedule", "page");
  revalidatePath("/[locale]/today", "page");
}

// --- Groups ---------------------------------------------------------------------

export async function createGroupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      branchId: uuidField,
      courseId: uuidField,
      levelId: optionalUuid,
      name: requiredText(),
      teacherId: optionalUuid,
      roomId: optionalUuid,
      capacity: optionalIntField(1, 1000),
      startDate: dateField,
      endDate: optionalDateField,
      price: ctx.can.billing ? optionalMoneyField : z.any().transform(() => null),
      cycleLessons: optionalIntField(1, 100),
      slots: slotsField,
    })
    .refine((v) => !v.endDate || v.endDate >= v.startDate, {
      path: ["endDate"],
      message: "validation.endBeforeStart",
    })
    .safeParse({
      branchId: str(form, "branchId"),
      courseId: str(form, "courseId"),
      levelId: str(form, "levelId"),
      name: str(form, "name"),
      teacherId: str(form, "teacherId"),
      roomId: str(form, "roomId"),
      capacity: str(form, "capacity"),
      startDate: str(form, "startDate"),
      endDate: str(form, "endDate"),
      price: str(form, "price"),
      cycleLessons: str(form, "cycleLessons"),
      slots: str(form, "slots"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", {
    p_branch_id: v.branchId,
    p_course_id: v.courseId,
    p_name: v.name,
    p_start_date: v.startDate,
    ...(v.levelId ? { p_level_id: v.levelId } : {}),
    ...(v.teacherId ? { p_teacher_membership_id: v.teacherId } : {}),
    ...(v.roomId ? { p_room_id: v.roomId } : {}),
    ...(v.capacity !== null ? { p_capacity: v.capacity } : {}),
    ...(v.endDate ? { p_end_date: v.endDate } : {}),
    ...(v.price !== null
      ? { p_price_amount: Number(v.price), p_cycle_lessons: v.cycleLessons ?? 12 }
      : {}),
    p_rules: v.slots,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true, data: { id: String(data) } };
}

export async function updateGroupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      id: uuidField,
      name: requiredText(),
      levelId: optionalUuid,
      teacherId: optionalUuid,
      roomId: optionalUuid,
      capacity: optionalIntField(1, 1000),
      status: z.enum(["forming", "active", "finished"], { error: "validation.invalid" }),
      startDate: dateField,
      endDate: optionalDateField,
    })
    .refine((v) => !v.endDate || v.endDate >= v.startDate, {
      path: ["endDate"],
      message: "validation.endBeforeStart",
    })
    .safeParse({
      id: str(form, "id"),
      name: str(form, "name"),
      levelId: str(form, "levelId"),
      teacherId: str(form, "teacherId"),
      roomId: str(form, "roomId"),
      capacity: str(form, "capacity"),
      status: str(form, "status"),
      startDate: str(form, "startDate"),
      endDate: str(form, "endDate"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .update({
      name: v.name,
      level_id: v.levelId,
      teacher_membership_id: v.teacherId,
      room_id: v.roomId,
      capacity: v.capacity,
      status: v.status,
      start_date: v.startDate,
      end_date: v.endDate,
    })
    .eq("id", v.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  refresh(v.id);
  return { ok: true };
}

/** Archive (only without current students) or restore a group. Archiving removes its future lessons. */
export async function archiveGroupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, archived: z.enum(["true", "false"]) })
    .safeParse({ id: str(form, "id"), archived: str(form, "archived") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  if (parsed.data.archived === "true") {
    const { count } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("group_id", parsed.data.id)
      .neq("status", "ended");
    if ((count ?? 0) > 0) return fail("groupHasStudents");
  }
  const { data, error } = await supabase
    .from("groups")
    .update({ archived_at: parsed.data.archived === "true" ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");

  refresh(parsed.data.id);
  return { ok: true };
}

// --- Schedule rules and prices ----------------------------------------------------

export type RuleConflict = {
  date: string;
  startsAt: string;
  kind: "room" | "teacher";
  otherGroup: string;
};

/** Clashes the proposed slots would hit in the next 8 weeks (shown before saving). */
export async function checkRulesAction(
  groupId: string,
  slotsJson: string,
): Promise<RuleConflict[] | null> {
  const parsed = z
    .object({ groupId: uuidField, slots: slotsField })
    .safeParse({ groupId, slots: slotsJson });
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_schedule_conflicts", {
    p_group_id: parsed.data.groupId,
    p_rules: parsed.data.slots,
  });
  if (error) return null;
  return (data ?? []).map((c) => ({
    date: c.local_date,
    startsAt: c.starts_at,
    kind: c.conflict_kind as "room" | "teacher",
    otherGroup: c.other_group_name,
  }));
}

export async function saveRulesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ groupId: uuidField, slots: slotsField })
    .safeParse({ groupId: str(form, "groupId"), slots: str(form, "slots") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_schedule_rules", {
    p_group_id: parsed.data.groupId,
    p_rules: parsed.data.slots,
  });
  if (error) return fail(dbErrorKey(error), form);

  const result = (data ?? {}) as { created?: number; conflicts?: number };
  refresh(parsed.data.groupId);
  return {
    ok: true,
    data: { created: String(result.created ?? 0), conflicts: String(result.conflicts ?? 0) },
  };
}

/** New price from the first day of the chosen month ("from which month?"). */
export async function setPriceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      groupId: uuidField,
      price: moneyField,
      cycleLessons: intField(1, 100),
      fromMonth: z.string().regex(/^\d{4}-\d{2}$/, { error: "validation.date" }),
    })
    .safeParse({
      groupId: str(form, "groupId"),
      price: str(form, "price"),
      cycleLessons: str(form, "cycleLessons"),
      fromMonth: str(form, "fromMonth"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_group_price", {
    p_group_id: parsed.data.groupId,
    p_price_amount: Number(parsed.data.price),
    p_cycle_lessons: parsed.data.cycleLessons,
    p_effective_from: `${parsed.data.fromMonth}-01`,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(parsed.data.groupId);
  return { ok: true };
}

// --- Single lessons (13: move, cancel, makeup, substitute) --------------------------

/** The branch timezone of a lesson or group, for turning a typed date + time into an instant. */
async function branchTimezone(table: "lessons" | "groups", id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from(table).select("branch_id").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: branch } = await supabase
    .from("branches")
    .select("timezone")
    .eq("id", row.branch_id)
    .maybeSingle();
  return branch?.timezone ?? null;
}

export async function moveLessonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ lessonId: uuidField, date: dateField, time: timeField, roomId: optionalUuid })
    .safeParse({
      lessonId: str(form, "lessonId"),
      date: str(form, "date"),
      time: str(form, "time"),
      roomId: str(form, "roomId"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const tz = await branchTimezone("lessons", parsed.data.lessonId);
  if (!tz) return fail("db.not_found", form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_lesson", {
    p_lesson_id: parsed.data.lessonId,
    p_starts_at: toInstant(parsed.data.date, parsed.data.time, tz).toISOString(),
    ...(parsed.data.roomId ? { p_room_id: parsed.data.roomId } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}

export async function cancelLessonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ lessonId: uuidField, reason: requiredText(200), centerFault: z.boolean() })
    .safeParse({
      lessonId: str(form, "lessonId"),
      reason: str(form, "reason"),
      centerFault: form.get("centerFault") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_lesson", {
    p_lesson_id: parsed.data.lessonId,
    p_reason: parsed.data.reason,
    p_center_fault: parsed.data.centerFault,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}

export async function makeupLessonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      groupId: uuidField,
      forLessonId: optionalUuid,
      date: dateField,
      time: timeField,
      durationMinutes: intField(15, 480),
      roomId: optionalUuid,
      billable: z.boolean(),
    })
    .safeParse({
      groupId: str(form, "groupId"),
      forLessonId: str(form, "forLessonId"),
      date: str(form, "date"),
      time: str(form, "time"),
      durationMinutes: str(form, "durationMinutes"),
      roomId: str(form, "roomId"),
      billable: form.get("billable") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const tz = await branchTimezone("groups", parsed.data.groupId);
  if (!tz) return fail("db.not_found", form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_makeup_lesson", {
    p_group_id: parsed.data.groupId,
    p_starts_at: toInstant(parsed.data.date, parsed.data.time, tz).toISOString(),
    p_duration_minutes: parsed.data.durationMinutes,
    p_is_billable: parsed.data.billable,
    ...(parsed.data.forLessonId ? { p_for_lesson_id: parsed.data.forLessonId } : {}),
    ...(parsed.data.roomId ? { p_room_id: parsed.data.roomId } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(parsed.data.groupId);
  return { ok: true };
}

export async function substituteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ lessonId: uuidField, teacherId: uuidField })
    .safeParse({ lessonId: str(form, "lessonId"), teacherId: str(form, "teacherId") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("substitute_teacher", {
    p_lesson_id: parsed.data.lessonId,
    p_membership_id: parsed.data.teacherId,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}

/** Drag-and-drop move from the timetable: date + minutes after midnight (branch time). */
export async function dropLessonAction(
  lessonId: string,
  date: string,
  minutes: number,
  roomId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z
    .object({
      lessonId: uuidField,
      date: dateField,
      minutes: z.number().int().min(0).max(1439),
      roomId: z.uuid().nullable(),
    })
    .safeParse({ lessonId, date, minutes, roomId });
  if (!parsed.success) return { ok: false, error: "validation.invalid" };
  const tz = await branchTimezone("lessons", parsed.data.lessonId);
  if (!tz) return { ok: false, error: "db.not_found" };

  const time = `${String(Math.floor(parsed.data.minutes / 60)).padStart(2, "0")}:${String(parsed.data.minutes % 60).padStart(2, "0")}`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_lesson", {
    p_lesson_id: parsed.data.lessonId,
    p_starts_at: toInstant(parsed.data.date, time, tz).toISOString(),
    ...(parsed.data.roomId ? { p_room_id: parsed.data.roomId } : {}),
  });
  if (error) return { ok: false, error: dbErrorKey(error) };

  refresh();
  return { ok: true };
}

// --- Conflicts inbox -------------------------------------------------------------

export async function skipConflictAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = uuidField.safeParse(str(form, "id"));
  if (!parsed.success) return fail("validation.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_conflict", {
    p_conflict_id: parsed.data,
    p_resolution: "skipped",
  });
  if (error) return fail(dbErrorKey(error));
  refresh();
  return { ok: true };
}

/** Places a conflicting occurrence at another time (and optionally another room). */
export async function placeConflictAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      id: uuidField,
      date: dateField,
      time: timeField,
      roomId: optionalUuid,
      branchId: uuidField,
    })
    .safeParse({
      id: str(form, "id"),
      date: str(form, "date"),
      time: str(form, "time"),
      roomId: str(form, "roomId"),
      branchId: str(form, "branchId"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("timezone")
    .eq("id", parsed.data.branchId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!branch) return fail("db.not_found", form);

  const { error } = await supabase.rpc("resolve_conflict", {
    p_conflict_id: parsed.data.id,
    p_resolution: "moved",
    p_starts_at: toInstant(parsed.data.date, parsed.data.time, branch.timezone).toISOString(),
    ...(parsed.data.roomId ? { p_room_id: parsed.data.roomId } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}
