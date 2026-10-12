"use server";

import { parseMajorUnits, todayIn, toInstant } from "@uteach/core";
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
import { dateField, moneyField, optionalText, requiredText, uuidField } from "@/lib/validation";

function refresh(studentId?: string) {
  revalidatePath("/[locale]/payments", "page");
  if (studentId) revalidatePath(`/[locale]/students/${studentId}`, "page");
}

const positiveMoney = moneyField.refine((v) => BigInt(v) > 0n, { error: "validation.amount" });

/**
 * Record payment (15): one `record_payment` call. The date is a local day: today = now, an earlier day = noon
 * of that day in the student's branch (backdating over 7 days needs `void`; the database checks).
 */
export async function recordPaymentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      studentId: uuidField,
      amount: positiveMoney,
      method: z.enum(["cash", "card", "transfer"], { error: "validation.invalid" }),
      accountId: z.union([uuidField, z.literal("default")]),
      paidAt: dateField,
      payerName: optionalText(160),
      note: optionalText(500),
    })
    .safeParse({
      studentId: str(form, "studentId"),
      amount: str(form, "amount"),
      method: str(form, "method"),
      accountId: str(form, "accountId") || "default",
      paidAt: str(form, "paidAt"),
      payerName: str(form, "payerName"),
      note: str(form, "note"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, branches ( timezone )")
    .eq("id", parsed.data.studentId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!student) return fail("db.not_found", form);
  const tz = student.branches?.timezone ?? ctx.center.timezone;
  const today = todayIn(tz);
  if (parsed.data.paidAt > today) {
    return { ok: false, fieldErrors: { paidAt: "validation.date" }, values: formValues(form) };
  }

  const { data, error } = await supabase.rpc("record_payment", {
    p_student_id: parsed.data.studentId,
    p_amount: toDbAmount(parsed.data.amount),
    p_method: parsed.data.method,
    p_account_id: parsed.data.accountId === "default" ? undefined : parsed.data.accountId,
    p_paid_at:
      parsed.data.paidAt === today
        ? undefined
        : toInstant(parsed.data.paidAt, "12:00", tz).toISOString(),
    p_payer_name: parsed.data.payerName ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fail(dbErrorKey(error), form);

  const result = data as { paymentId: string; receiptNo: string; balance: number | string };
  refresh(parsed.data.studentId);
  return {
    ok: true,
    data: {
      paymentId: result.paymentId,
      receiptNo: result.receiptNo,
      balance: String(result.balance),
    },
  };
}

/** Balance and default payer for the payment dialog when the student is picked in it. */
export async function paymentDefaultsAction(
  studentId: string,
): Promise<{ balance: string; payer: string } | null> {
  if (!uuidField.safeParse(studentId).success) return null;
  const supabase = await createClient();
  const [{ data: balance, error }, { data: guardian }] = await Promise.all([
    supabase.rpc("student_balance", { p_student_id: studentId }),
    supabase
      .from("student_guardians")
      .select("guardians ( full_name )")
      .eq("student_id", studentId)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);
  if (error || balance === null) return null;
  return { balance: String(balance), payer: guardian?.guardians?.full_name ?? "" };
}

const voidSchema = z.object({
  id: uuidField,
  studentId: uuidField,
  reason: requiredText(500),
});

function readVoid(form: FormData) {
  return voidSchema.safeParse({
    id: str(form, "id"),
    studentId: str(form, "studentId"),
    reason: str(form, "reason"),
  });
}

export async function voidPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readVoid(form);
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh(parsed.data.studentId);
  return { ok: true };
}

export async function voidChargeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readVoid(form);
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_charge", {
    p_charge_id: parsed.data.id,
    p_reason: parsed.data.reason,
    p_reissue: form.get("reissue") === "on",
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh(parsed.data.studentId);
  return { ok: true };
}

export async function voidAdjustmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = readVoid(form);
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_adjustment", {
    p_adjustment_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh(parsed.data.studentId);
  return { ok: true };
}

/** A signed amount typed in major units ("-50 000") → minor units as a decimal string. */
const signedMoney = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const negative = /^[-−]/.test(value);
    try {
      const minor = parseMajorUnits(value.replace(/^[-−+]\s*/, ""));
      if (minor <= 0n) throw new RangeError("zero");
      return (negative ? -minor : minor).toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "validation.amount" });
      return z.NEVER;
    }
  });

/**
 * Adjust balance (15): a correction (any signed amount) or a write-off (empty amount = the whole debt). The
 * database checks the `adjustments` flag and refuses a write-off with nothing owed.
 */
export async function adjustBalanceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      studentId: uuidField,
      kind: z.enum(["correction", "write_off"], { error: "validation.invalid" }),
      amount: signedMoney,
      reason: requiredText(500),
    })
    .superRefine((v, ctx) => {
      if (v.kind === "correction" && v.amount === null) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "validation.required" });
      }
      if (v.kind === "write_off" && v.amount !== null && BigInt(v.amount) < 0n) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "validation.amount" });
      }
    })
    .safeParse({
      studentId: str(form, "studentId"),
      kind: str(form, "kind"),
      amount: str(form, "amount"),
      reason: str(form, "reason"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_adjustment", {
    p_student_id: parsed.data.studentId,
    p_kind: parsed.data.kind,
    // A null amount lets the database compute the write-off (the generated type says number).
    p_amount: (parsed.data.amount === null ? null : toDbAmount(parsed.data.amount)) as number,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh(parsed.data.studentId);
  return { ok: true };
}

/** Waive what is still owed on one charge (15). */
export async function waiveChargeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readVoid(form);
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_adjustment", {
    p_student_id: parsed.data.studentId,
    p_kind: "waive",
    p_amount: null as unknown as number,
    p_reason: parsed.data.reason,
    p_charge_id: parsed.data.id,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh(parsed.data.studentId);
  return { ok: true };
}
