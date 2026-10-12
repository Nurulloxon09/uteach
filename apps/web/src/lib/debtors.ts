import "server-only";
import type { CenterContext } from "@/lib/center";
import { chunks, fetchAll } from "@/lib/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The debtors list (15): students with a negative balance in the user's branches, with the oldest unpaid due
 * date, days overdue and aging bucket from the `debtors` view (FIFO lives in the database), plus what staff
 * need to chase the debt: guardian phone, groups and the last payment. Shared by the page and the Excel export,
 * so both show the same rows. `billing` only (RLS on the views).
 */

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export type DebtorFilters = {
  q: string;
  branch: string | null;
  group: string | null;
  course: string | null;
  bucket: AgingBucket | null;
};

export type DebtorRow = {
  studentId: string;
  name: string;
  phone: string | null;
  branchId: string;
  guardianName: string | null;
  guardianPhone: string | null;
  groups: string[];
  /** Minor units, positive. */
  debt: string;
  oldestDueDate: string | null;
  daysOverdue: number;
  bucket: AgingBucket;
  lastPayment: { paidAt: string; amount: string } | null;
};

export type DebtorSummary = Record<AgingBucket, { count: number; total: bigint }>;

export function isBucket(value: unknown): value is AgingBucket {
  return AGING_BUCKETS.includes(value as AgingBucket);
}

/** Search text: lower case; digits alone also match phone numbers typed with spaces. */
function matches(q: string, text: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = text.toLowerCase();
  if (haystack.includes(needle)) return true;
  const digits = needle.replace(/\D/g, "");
  return digits.length >= 3 && haystack.replace(/\D/g, "").includes(digits);
}

const byDebtDesc = (a: DebtorRow, b: DebtorRow) => {
  const x = BigInt(a.debt);
  const y = BigInt(b.debt);
  return x === y ? 0 : x < y ? 1 : -1;
};

/**
 * Debtors matching the filters, most overdue first (then largest debt), and the per-bucket summary of the
 * rows before the bucket filter (so the tiles show the whole spread).
 */
export async function loadDebtors(
  ctx: CenterContext,
  filters: DebtorFilters,
): Promise<{ rows: DebtorRow[]; summary: DebtorSummary; total: bigint }> {
  const supabase = await createClient();
  const debtors = await fetchAll((from, to) => {
    let q = supabase
      .from("debtors")
      .select("student_id, branch_id, debt, oldest_due_date, max_days_overdue, aging_bucket")
      .eq("center_id", ctx.center.id);
    if (filters.branch) q = q.eq("branch_id", filters.branch);
    return q.order("student_id").range(from, to);
  });
  const ids = debtors.flatMap((d) => (d.student_id ? [d.student_id] : []));

  type Student = {
    id: string | null;
    full_name: string | null;
    phone: string | null;
    group_ids: string[] | null;
    course_ids: string[] | null;
    search_text: string | null;
  };
  type Guardian = {
    student_id: string;
    guardians: { full_name: string; phone: string | null } | null;
  };
  type Payment = { student_id: string; paid_at: string; amount: number };

  const [students, guardians, payments] = await Promise.all([
    Promise.all(
      chunks(ids).map((part) =>
        supabase
          .from("student_overview")
          .select("id, full_name, phone, group_ids, course_ids, search_text")
          .in("id", part)
          .then(({ data }) => (data ?? []) as Student[]),
      ),
    ).then((parts) => parts.flat()),
    Promise.all(
      chunks(ids).map((part) =>
        supabase
          .from("student_guardians")
          .select("student_id, guardians ( full_name, phone )")
          .eq("is_primary", true)
          .in("student_id", part)
          .then(({ data }) => (data ?? []) as unknown as Guardian[]),
      ),
    ).then((parts) => parts.flat()),
    // The latest payment per student: one row each via a descending scan per chunk.
    Promise.all(
      chunks(ids).map((part) =>
        fetchAll((from, to) =>
          supabase
            .from("payments")
            .select("student_id, paid_at, amount")
            .in("student_id", part)
            .is("voided_at", null)
            .order("paid_at", { ascending: false })
            .order("id")
            .range(from, to),
        ),
      ),
    ).then((parts) => parts.flat() as Payment[]),
  ]);

  const groupIds = [...new Set(students.flatMap((s) => s.group_ids ?? []))];
  const groupNames = new Map<string, string>();
  const groupParts = await Promise.all(
    chunks(groupIds).map((part) =>
      supabase
        .from("groups")
        .select("id, name")
        .in("id", part)
        .then(({ data }) => data ?? []),
    ),
  );
  for (const g of groupParts.flat()) groupNames.set(g.id, g.name);

  const studentById = new Map(students.flatMap((s) => (s.id ? [[s.id, s] as const] : [])));
  const guardianOf = new Map(guardians.map((g) => [g.student_id, g.guardians]));
  const lastPayment = new Map<string, Payment>();
  for (const p of payments) {
    const seen = lastPayment.get(p.student_id);
    if (!seen || p.paid_at > seen.paid_at) lastPayment.set(p.student_id, p);
  }

  const all: DebtorRow[] = [];
  for (const d of debtors) {
    const s = d.student_id ? studentById.get(d.student_id) : undefined;
    if (!s?.id || !d.branch_id || d.debt === null) continue;
    if (filters.group && !(s.group_ids ?? []).includes(filters.group)) continue;
    if (filters.course && !(s.course_ids ?? []).includes(filters.course)) continue;
    if (!matches(filters.q, s.search_text ?? s.full_name ?? "")) continue;
    const guardian = guardianOf.get(s.id) ?? null;
    const paid = lastPayment.get(s.id);
    all.push({
      studentId: s.id,
      name: s.full_name ?? "—",
      phone: s.phone,
      branchId: d.branch_id,
      guardianName: guardian?.full_name ?? null,
      guardianPhone: guardian?.phone ?? null,
      groups: (s.group_ids ?? []).flatMap((id) => {
        const name = groupNames.get(id);
        return name ? [name] : [];
      }),
      debt: String(d.debt),
      oldestDueDate: d.oldest_due_date,
      daysOverdue: d.max_days_overdue ?? 0,
      bucket: isBucket(d.aging_bucket) ? d.aging_bucket : "0-30",
      lastPayment: paid ? { paidAt: paid.paid_at, amount: String(paid.amount) } : null,
    });
  }

  const summary = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, { count: 0, total: 0n }]),
  ) as DebtorSummary;
  let total = 0n;
  for (const row of all) {
    summary[row.bucket].count++;
    summary[row.bucket].total += BigInt(row.debt);
    total += BigInt(row.debt);
  }

  const rows = (filters.bucket ? all.filter((r) => r.bucket === filters.bucket) : all).sort(
    (a, b) => b.daysOverdue - a.daysOverdue || byDebtDesc(a, b) || a.name.localeCompare(b.name),
  );
  return { rows, summary, total };
}
