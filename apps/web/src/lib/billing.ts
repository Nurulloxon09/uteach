import "server-only";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import type { CenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

/**
 * Billing reads for staff pages (15). Everything goes through the user's session, so RLS decides: `billing`
 * sees charges, adjustments and balances; `payments` alone sees payments and the balance (via RPC).
 * Amounts stay minor units as decimal strings (04-rules §2).
 */

export type AccountKind = "cash" | "terminal" | "bank" | "online";
export type PaymentMethod = "cash" | "card" | "transfer" | "online";

export type AccountOption = {
  id: string;
  kind: AccountKind;
  /** null for center-wide accounts (bank, online). */
  branchId: string | null;
  label: string;
};

/** Active accounts of the center, labelled ("Cash · Chilonzor"). */
export const loadAccounts = cache(async (ctx: CenterContext): Promise<AccountOption[]> => {
  if (!ctx.can.billing && !ctx.can.payments) return [];
  const supabase = await createClient();
  const t = await getTranslations("billing.accounts");
  const [{ data: accounts }, { data: branches }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, kind, branch_id, name")
      .eq("center_id", ctx.center.id)
      .eq("is_active", true)
      .order("created_at"),
    supabase.from("branches").select("id, name").eq("center_id", ctx.center.id),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  return (accounts ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    branchId: a.branch_id,
    label: a.name ?? t(a.kind, { branch: a.branch_id ? (branchName.get(a.branch_id) ?? "—") : "" }),
  }));
});

/** profile id → the name staff know them by in this center (for "received by"). */
export const loadStaffNames = cache(async (ctx: CenterContext): Promise<Map<string, string>> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("profile_id, display_name")
    .eq("center_id", ctx.center.id)
    .not("profile_id", "is", null);
  return new Map(
    (data ?? []).flatMap((m) => (m.profile_id ? [[m.profile_id, m.display_name]] : [])),
  );
});

/** The student's balance (positive = credit), or null when the user may not see it. */
export const loadStudentBalance = cache(
  async (ctx: CenterContext, studentId: string): Promise<string | null> => {
    if (!ctx.can.billing && !ctx.can.payments) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("student_balance", { p_student_id: studentId });
    if (error || data === null) return null;
    return String(data);
  },
);

export type CycleRow = {
  id: string;
  enrollmentId: string | null;
  groupName: string;
  cycleNo: number | null;
  cycleLessons: number | null;
  startDate: string;
  dueDate: string;
  firstLessonDate: string | null;
  expectedLastDate: string | null;
  used: number | null;
  amount: string;
  priceAmount: string;
  discountAmount: string;
  discountBp: number;
  outstanding: string;
  daysOverdue: number;
  isManual: boolean;
  voided: boolean;
  voidReason: string | null;
  createdAt: string;
};

export type PaymentRow = {
  id: string;
  branchId: string;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  receiptNo: string;
  accountLabel: string;
  payerName: string | null;
  note: string | null;
  receivedBy: string | null;
  voided: boolean;
  voidReason: string | null;
};

export type AdjustmentRow = {
  id: string;
  kind:
    | "opening_balance"
    | "waive"
    | "write_off"
    | "correction"
    | "refund"
    | "promo"
    | "unused_lessons";
  amount: string;
  reason: string | null;
  details: { unused?: number; cycleLessons?: number };
  createdAt: string;
  createdBy: string | null;
  voided: boolean;
  voidReason: string | null;
};

export type StudentBilling = {
  balance: string | null;
  cycles: CycleRow[];
  payments: PaymentRow[];
  adjustments: AdjustmentRow[];
};

/** A student's charges (with lessons used and FIFO outstanding), payments and adjustments. */
export async function loadStudentBilling(
  ctx: CenterContext,
  studentId: string,
): Promise<StudentBilling> {
  const supabase = await createClient();
  const [balance, accounts, staff] = await Promise.all([
    loadStudentBalance(ctx, studentId),
    loadAccounts(ctx),
    loadStaffNames(ctx),
  ]);
  const accountLabel = new Map(accounts.map((a) => [a.id, a.label]));

  const [{ data: payments }, charges, adjustments] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, branch_id, account_id, amount, method, paid_at, receipt_no, payer_name, note, received_by, voided_at, void_reason",
      )
      .eq("student_id", studentId)
      .order("paid_at", { ascending: false })
      .limit(200),
    ctx.can.billing
      ? Promise.all([
          supabase
            .from("charges")
            .select(
              "id, enrollment_id, cycle_no, cycle_lessons, cycle_start_date, due_date, price_amount, discount_amount, amount, status, is_manual, calc, void_reason, created_at, enrollments ( groups ( name ) )",
            )
            .eq("student_id", studentId)
            .order("cycle_start_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("charge_cycles")
            .select("charge_id, first_lesson_date, expected_last_date, lessons_used")
            .eq("student_id", studentId),
          supabase
            .from("charge_debts")
            .select("charge_id, outstanding, days_overdue")
            .eq("student_id", studentId),
        ])
      : null,
    ctx.can.billing
      ? supabase
          .from("balance_adjustments")
          .select(
            "id, kind, amount, reason, details, created_at, created_by, voided_at, void_reason",
          )
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(200)
      : null,
  ]);

  const cycles: CycleRow[] = [];
  if (charges) {
    const [{ data: rows }, { data: windows }, { data: debts }] = charges;
    const windowOf = new Map((windows ?? []).map((w) => [w.charge_id, w]));
    const debtOf = new Map(
      (debts ?? []).flatMap((d) => (d.charge_id ? [[d.charge_id, d] as const] : [])),
    );
    for (const c of rows ?? []) {
      const w = windowOf.get(c.id);
      const d = debtOf.get(c.id);
      const calc = (c.calc ?? {}) as { discountBp?: number };
      cycles.push({
        id: c.id,
        enrollmentId: c.enrollment_id,
        groupName: c.enrollments?.groups?.name ?? "—",
        cycleNo: c.cycle_no,
        cycleLessons: c.cycle_lessons,
        startDate: c.cycle_start_date,
        dueDate: c.due_date,
        firstLessonDate: w?.first_lesson_date ?? null,
        expectedLastDate: w?.expected_last_date ?? null,
        used: w?.lessons_used ?? null,
        amount: String(c.amount),
        priceAmount: String(c.price_amount),
        discountAmount: String(c.discount_amount),
        discountBp: calc.discountBp ?? 0,
        outstanding: c.status === "open" ? String(d?.outstanding ?? 0) : "0",
        daysOverdue: d?.days_overdue ?? 0,
        isManual: c.is_manual,
        voided: c.status === "void",
        voidReason: c.void_reason,
        createdAt: c.created_at,
      });
    }
  }

  return {
    balance,
    cycles,
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      branchId: p.branch_id,
      amount: String(p.amount),
      method: p.method,
      paidAt: p.paid_at,
      receiptNo: p.receipt_no,
      accountLabel: accountLabel.get(p.account_id) ?? "—",
      payerName: p.payer_name,
      note: p.note,
      receivedBy: p.received_by ? (staff.get(p.received_by) ?? null) : null,
      voided: p.voided_at !== null,
      voidReason: p.void_reason,
    })),
    adjustments: (adjustments?.data ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      amount: String(a.amount),
      reason: a.reason,
      details: (a.details ?? {}) as AdjustmentRow["details"],
      createdAt: a.created_at,
      createdBy: a.created_by ? (staff.get(a.created_by) ?? null) : null,
      voided: a.voided_at !== null,
      voidReason: a.void_reason,
    })),
  };
}
