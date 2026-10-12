"use server";

import { normalizeName } from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  dbErrorKey,
  fail,
  fieldErrorsFrom,
  formValues,
  str,
  type ActionState,
} from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { toDbAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import {
  dateField,
  optionalDateField,
  optionalMoneyField,
  optionalPercentField,
  optionalPhoneField,
  optionalText,
  phoneField,
  requiredText,
  uuidField,
} from "@/lib/validation";

const RELATIONS = ["mother", "father", "parent", "other"] as const;
const optionalUuid = z.union([uuidField, z.literal("")]).transform((v) => v || null);

function refresh(studentId?: string) {
  revalidatePath("/[locale]/students", "page");
  if (studentId) revalidatePath(`/[locale]/students/${studentId}`, "page");
  revalidatePath("/[locale]/groups", "layout");
}

// --- Students ---------------------------------------------------------------------

function studentSchema(country: string) {
  return z.object({
    branchId: uuidField,
    fullName: requiredText(160),
    phone: optionalPhoneField(country),
    birthDate: optionalDateField,
    gender: z.enum(["", "male", "female"]).transform((v) => v || null),
    school: optionalText(120),
  });
}

function readStudent(form: FormData) {
  return {
    branchId: str(form, "branchId"),
    fullName: str(form, "fullName"),
    phone: str(form, "phone"),
    birthDate: str(form, "birthDate"),
    gender: str(form, "gender"),
    school: str(form, "school"),
  };
}

/**
 * Adds a student (and optionally a first guardian). A student with the same phone or the same normalised
 * name gives a warning first; submitting again with `confirmDuplicate` creates anyway (12).
 */
export async function createStudentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const country = ctx.center.countryCode;
  const parsed = studentSchema(country)
    .extend({
      guardianName: optionalText(160),
      guardianPhone: optionalPhoneField(country),
      relation: z.enum(RELATIONS),
    })
    .refine((v) => !v.guardianPhone || v.guardianName, {
      path: ["guardianName"],
      message: "validation.required",
    })
    .safeParse({
      ...readStudent(form),
      guardianName: str(form, "guardianName"),
      guardianPhone: str(form, "guardianPhone"),
      relation: str(form, "relation") || "parent",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  if (form.get("confirmDuplicate") !== "1") {
    const name = normalizeName(v.fullName);
    const { data: similar } = await supabase
      .from("students")
      .select("full_name, phone")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .or(
        `full_name.ilike."${name.replace(/["\%*_]/g, "")}"${v.phone ? `,phone.eq."${v.phone}"` : ""}`,
      )
      .limit(5);
    const match = (similar ?? []).find(
      (s) => normalizeName(s.full_name) === name || (v.phone && s.phone === v.phone),
    );
    if (match) return { ok: false, error: "duplicateStudent", values: formValues(form) };
  }

  const { data: student, error } = await supabase
    .from("students")
    .insert({
      center_id: ctx.center.id,
      branch_id: v.branchId,
      full_name: v.fullName,
      phone: v.phone,
      birth_date: v.birthDate,
      gender: v.gender,
      school: v.school,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorKey(error), form);

  if (v.guardianPhone && v.guardianName) {
    const { error: guardianError } = await supabase.rpc("upsert_guardian", {
      p_student_id: student.id,
      p_full_name: v.guardianName,
      p_phone: v.guardianPhone,
      p_relation: v.relation,
      p_is_primary: true,
    });
    if (guardianError) return fail(dbErrorKey(guardianError), form);
  }

  refresh();
  return { ok: true, data: { id: student.id } };
}

export async function updateStudentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = studentSchema(ctx.center.countryCode)
    .extend({ id: uuidField })
    .safeParse({ ...readStudent(form), id: str(form, "id") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .update({
      branch_id: v.branchId,
      full_name: v.fullName,
      phone: v.phone,
      birth_date: v.birthDate,
      gender: v.gender,
      school: v.school,
    })
    .eq("id", v.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  refresh(v.id);
  return { ok: true };
}

/** Archive (only without active enrollments; the DB checks) or restore. */
export async function archiveStudentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, archived: z.enum(["true", "false"]) })
    .safeParse({ id: str(form, "id"), archived: str(form, "archived") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .update({ archived_at: parsed.data.archived === "true" ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");

  refresh(parsed.data.id);
  return { ok: true };
}

// --- Guardians ---------------------------------------------------------------------

/** Adds a guardian; a phone that already belongs to a guardian links that person (siblings). */
export async function addGuardianAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      studentId: uuidField,
      fullName: requiredText(160),
      phone: phoneField(ctx.center.countryCode),
      relation: z.enum(RELATIONS),
      isPrimary: z.boolean(),
      notifications: z.boolean(),
      billing: z.boolean(),
    })
    .safeParse({
      studentId: str(form, "studentId"),
      fullName: str(form, "fullName"),
      phone: str(form, "phone"),
      relation: str(form, "relation") || "parent",
      isPrimary: form.get("isPrimary") === "on",
      notifications: form.get("notifications") === "on",
      billing: form.get("billing") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_guardian", {
    p_student_id: v.studentId,
    p_full_name: v.fullName,
    p_phone: v.phone,
    p_relation: v.relation,
    p_is_primary: v.isPrimary,
    p_receives_notifications: v.notifications,
    p_receives_billing: v.billing,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(v.studentId);
  const result = (data ?? {}) as { linkedExisting?: boolean };
  return { ok: true, data: { linkedExisting: String(Boolean(result.linkedExisting)) } };
}

export async function updateGuardianAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      guardianId: uuidField,
      studentId: uuidField,
      fullName: requiredText(160),
      phone: phoneField(ctx.center.countryCode),
      relation: z.enum(RELATIONS),
      isPrimary: z.boolean(),
      notifications: z.boolean(),
      billing: z.boolean(),
    })
    .safeParse({
      guardianId: str(form, "guardianId"),
      studentId: str(form, "studentId"),
      fullName: str(form, "fullName"),
      phone: str(form, "phone"),
      relation: str(form, "relation") || "parent",
      isPrimary: form.get("isPrimary") === "on",
      notifications: form.get("notifications") === "on",
      billing: form.get("billing") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_guardian", {
    p_guardian_id: v.guardianId,
    p_full_name: v.fullName,
    p_phone: v.phone,
  });
  if (error) return fail(dbErrorKey(error), form);
  // The link's own settings (relation, primary, who gets messages).
  const { error: linkError } = await supabase.rpc("upsert_guardian", {
    p_student_id: v.studentId,
    p_full_name: v.fullName,
    p_phone: v.phone,
    p_relation: v.relation,
    p_is_primary: v.isPrimary,
    p_receives_notifications: v.notifications,
    p_receives_billing: v.billing,
  });
  if (linkError) return fail(dbErrorKey(linkError), form);

  refresh(v.studentId);
  return { ok: true };
}

export async function unlinkGuardianAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ studentId: uuidField, guardianId: uuidField })
    .safeParse({ studentId: str(form, "studentId"), guardianId: str(form, "guardianId") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_guardian", {
    p_student_id: parsed.data.studentId,
    p_guardian_id: parsed.data.guardianId,
  });
  if (error) return fail(dbErrorKey(error));

  refresh(parsed.data.studentId);
  return { ok: true };
}

// --- Notes ---------------------------------------------------------------------------

export async function saveNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      id: optionalUuid,
      studentId: uuidField,
      body: requiredText(5000),
      isPinned: z.boolean(),
      visibleToTeachers: z.boolean(),
    })
    .safeParse({
      id: str(form, "id"),
      studentId: str(form, "studentId"),
      body: str(form, "body"),
      isPinned: form.get("isPinned") === "on",
      visibleToTeachers: form.get("visibleToTeachers") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = v.id
    ? await supabase
        .from("student_notes")
        .update({ body: v.body, is_pinned: v.isPinned, visible_to_teachers: v.visibleToTeachers })
        .eq("id", v.id)
        .select("id")
    : await supabase
        .from("student_notes")
        .insert({
          center_id: ctx.center.id,
          student_id: v.studentId,
          body: v.body,
          is_pinned: v.isPinned,
          visible_to_teachers: v.visibleToTeachers,
        })
        .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  refresh(v.studentId);
  return { ok: true };
}

export async function deleteNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, studentId: uuidField })
    .safeParse({ id: str(form, "id"), studentId: str(form, "studentId") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_notes")
    .delete()
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");

  refresh(parsed.data.studentId);
  return { ok: true };
}

// --- Enroll / freeze / transfer / end (12) ------------------------------------------------

export async function enrollAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      studentId: uuidField,
      groupId: uuidField,
      startDate: optionalDateField,
      discountPercent: optionalPercentField,
      discountAmount: optionalMoneyField,
      discountReason: optionalText(200),
      priceOverride: ctx.can.billing ? optionalMoneyField : z.any().transform(() => null),
    })
    .safeParse({
      studentId: str(form, "studentId"),
      groupId: str(form, "groupId"),
      startDate: str(form, "startDate"),
      discountPercent: str(form, "discountPercent"),
      discountAmount: str(form, "discountAmount"),
      discountReason: str(form, "discountReason"),
      priceOverride: str(form, "priceOverride"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll", {
    p_student_id: v.studentId,
    p_group_id: v.groupId,
    ...(v.startDate ? { p_start_date: v.startDate } : {}),
    p_discount_bp: v.discountPercent,
    p_discount_amount: v.discountAmount ? toDbAmount(v.discountAmount) : 0,
    ...(v.discountReason ? { p_discount_reason: v.discountReason } : {}),
    ...(v.priceOverride ? { p_price_override_amount: toDbAmount(v.priceOverride) } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(v.studentId);
  return { ok: true };
}

export async function freezeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      enrollmentId: uuidField,
      studentId: uuidField,
      from: dateField,
      to: dateField,
      reason: optionalText(200),
    })
    .refine((v) => v.to >= v.from, { path: ["to"], message: "validation.endBeforeStart" })
    .safeParse({
      enrollmentId: str(form, "enrollmentId"),
      studentId: str(form, "studentId"),
      from: str(form, "from"),
      to: str(form, "to"),
      reason: str(form, "reason"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("freeze_enrollment", {
    p_enrollment_id: parsed.data.enrollmentId,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(parsed.data.studentId);
  return { ok: true };
}

export async function transferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      enrollmentId: uuidField,
      studentId: uuidField,
      groupId: uuidField,
      date: dateField,
      keepDiscount: z.boolean(),
    })
    .safeParse({
      enrollmentId: str(form, "enrollmentId"),
      studentId: str(form, "studentId"),
      groupId: str(form, "groupId"),
      date: str(form, "date"),
      keepDiscount: form.get("keepDiscount") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_enrollment", {
    p_enrollment_id: parsed.data.enrollmentId,
    p_target_group_id: parsed.data.groupId,
    p_date: parsed.data.date,
    p_keep_discount: parsed.data.keepDiscount,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(parsed.data.studentId);
  return { ok: true };
}

export async function endAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      enrollmentId: uuidField,
      studentId: uuidField,
      endDate: dateField,
      reason: z.enum(["completed", "dropped", "moved_level"]),
      credit: z.boolean(),
    })
    .safeParse({
      enrollmentId: str(form, "enrollmentId"),
      studentId: str(form, "studentId"),
      endDate: str(form, "endDate"),
      reason: str(form, "reason"),
      credit: form.get("credit") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_enrollment", {
    p_enrollment_id: parsed.data.enrollmentId,
    p_end_date: parsed.data.endDate,
    p_reason: parsed.data.reason,
    // Used when the center's policy is "ask" (15); ignored for "credit" / "no credit".
    p_credit: parsed.data.credit,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh(parsed.data.studentId);
  return { ok: true, data: { reason: parsed.data.reason } };
}
