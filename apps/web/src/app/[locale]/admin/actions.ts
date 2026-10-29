"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { toDbAmount } from "@/lib/money";
import { superAdminDb } from "@/lib/super-admin";
import {
  dateField,
  intField,
  moneyField,
  optionalIntField,
  optionalMoneyField,
  optionalText,
  passwordField,
  requiredText,
  uuidField,
} from "@/lib/validation";

/**
 * /admin actions (M7b). Each calls one `admin_*` function with the service role and `p_actor` = the signed-in
 * super-admin; the function checks the flag again and the audit log names them.
 */

function refresh() {
  revalidatePath("/[locale]/admin", "layout");
}

const CENTER_STATUSES = ["trial", "active", "past_due", "read_only", "cancelled"] as const;

export async function extendTrialAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ centerId: uuidField, days: intField(1, 90) })
    .safeParse({ centerId: str(form, "centerId"), days: str(form, "days") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_extend_trial", {
    p_actor: actor,
    p_center_id: parsed.data.centerId,
    p_days: parsed.data.days,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function setCenterPlanAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ centerId: uuidField, planId: uuidField })
    .safeParse({ centerId: str(form, "centerId"), planId: str(form, "planId") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_set_center_plan", {
    p_actor: actor,
    p_center_id: parsed.data.centerId,
    p_plan_id: parsed.data.planId,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function setCenterStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      centerId: uuidField,
      status: z.enum(CENTER_STATUSES, { error: "validation.invalid" }),
    })
    .safeParse({ centerId: str(form, "centerId"), status: str(form, "status") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_set_center_status", {
    p_actor: actor,
    p_center_id: parsed.data.centerId,
    p_status: parsed.data.status,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function issueInvoiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      centerId: uuidField,
      planId: uuidField,
      periodStart: dateField,
      periodEnd: dateField,
      amount: optionalMoneyField,
    })
    .refine((v) => v.periodEnd >= v.periodStart, {
      path: ["periodEnd"],
      message: "validation.endBeforeStart",
    })
    .safeParse({
      centerId: str(form, "centerId"),
      planId: str(form, "planId"),
      periodStart: str(form, "periodStart"),
      periodEnd: str(form, "periodEnd"),
      amount: str(form, "amount"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_issue_invoice", {
    p_actor: actor,
    p_center_id: parsed.data.centerId,
    p_plan_id: parsed.data.planId,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
    ...(parsed.data.amount === null ? {} : { p_amount: toDbAmount(parsed.data.amount) }),
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function markInvoicePaidAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ invoiceId: uuidField, note: optionalText(500) })
    .safeParse({ invoiceId: str(form, "invoiceId"), note: str(form, "note") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_mark_invoice_paid", {
    p_actor: actor,
    p_invoice_id: parsed.data.invoiceId,
    ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function voidInvoiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = uuidField.safeParse(str(form, "invoiceId"));
  if (!parsed.success) return fail("validation.invalid");
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_void_invoice", {
    p_actor: actor,
    p_invoice_id: parsed.data,
  });
  if (error) return fail(dbErrorKey(error));
  refresh();
  return { ok: true };
}

export async function savePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      planId: z.union([uuidField, z.literal("")]).transform((v) => v || null),
      code: z.string().trim(),
      name: requiredText(80),
      studentLimit: optionalIntField(1, 100000),
      branchLimit: optionalIntField(1, 1000),
      price: moneyField,
      isPublic: z.boolean(),
      sortOrder: intField(0, 999),
    })
    .refine((v) => v.planId !== null || /^[a-z][a-z0-9_]{1,39}$/.test(v.code), {
      path: ["code"],
      message: "validation.planCode",
    })
    .safeParse({
      planId: str(form, "planId"),
      code: str(form, "code"),
      name: str(form, "name"),
      studentLimit: str(form, "studentLimit"),
      branchLimit: str(form, "branchLimit"),
      price: str(form, "price"),
      isPublic: form.get("isPublic") === "on",
      sortOrder: str(form, "sortOrder") || "0",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const v = parsed.data;
  const { error } = await db.rpc("admin_save_plan", {
    p_actor: actor,
    p_plan_id: v.planId as string,
    p_code: v.code,
    p_name: v.name,
    p_student_limit: v.studentLimit as number,
    p_branch_limit: v.branchLimit as number,
    p_price_amount: toDbAmount(v.price),
    p_is_public: v.isPublic,
    p_sort_order: v.sortOrder,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

export async function archivePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = uuidField.safeParse(str(form, "planId"));
  if (!parsed.success) return fail("validation.invalid");
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_archive_plan", {
    p_actor: actor,
    p_plan_id: parsed.data,
    p_archived: str(form, "archived") === "1",
  });
  if (error) return fail(dbErrorKey(error));
  refresh();
  return { ok: true };
}

export async function deletePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = uuidField.safeParse(str(form, "planId"));
  if (!parsed.success) return fail("validation.invalid");
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_delete_plan", { p_actor: actor, p_plan_id: parsed.data });
  if (error) return fail(dbErrorKey(error));
  refresh();
  return { ok: true };
}

export async function savePaymentInstructionsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ uz: optionalText(2000), ru: optionalText(2000), en: optionalText(2000) })
    .safeParse({ uz: str(form, "uz"), ru: str(form, "ru"), en: str(form, "en") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const value = Object.fromEntries(
    Object.entries(parsed.data).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const { error } = await db.rpc("admin_set_payment_instructions", {
    p_actor: actor,
    p_value: value,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  revalidatePath("/[locale]/settings/subscription", "page");
  return { ok: true };
}

/** "Set new password" for anyone in a center (owners who forgot theirs ask uteach; M7f). Audited by the function. */
export async function adminSetPasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ profileId: uuidField, password: passwordField })
    .safeParse({ profileId: str(form, "profileId"), password: form.get("password") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { actor, db } = await superAdminDb();
  const { error } = await db.rpc("admin_set_password", {
    p_actor: actor,
    p_profile_id: parsed.data.profileId,
    p_password: parsed.data.password,
  });
  if (error) return fail(dbErrorKey(error), form);
  return { ok: true };
}
