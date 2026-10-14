import "server-only";
import type { CenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

/**
 * Role dashboards (20, 30-milestones `PROPOSED (M7c plan)`): one RPC per role, run with the person's session, so
 * RLS limits what they see. Amounts are minor units (numbers from jsonb; sums stay well below 2^53).
 */

export type OwnerDashboard = {
  today: {
    lessons: number;
    marked_lessons: number;
    present: number;
    late: number;
    absent: number;
    payments_amount: number;
    payments_count: number;
  };
  month: { charged: number; collected: number };
  debt: {
    total: number;
    students: number;
    buckets: Record<"0-30" | "31-60" | "61-90" | "90+", number>;
  };
  students: { active: number; active_last_month: number };
  leads: { new: number; won: number };
  branches: {
    id: string;
    name: string;
    lessons_today: number;
    active_students: number;
    collected_month: number;
    debt: number;
  }[];
};

export type AdminDashboard = {
  lessons: {
    id: string;
    group: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    teacher: string | null;
    expected: number;
    marked: number;
  }[];
  /** Null without the `billing` permission. */
  debtors: { student_id: string; name: string; debt: number; days_overdue: number }[] | null;
  follow_ups: { lead_id: string; name: string; body: string | null; due_at: string }[];
  follow_ups_overdue: number;
  trials: { lead_id: string; name: string; group: string; starts_at: string; timezone: string }[];
  no_telegram: number;
  conflicts: number;
};

export type TeacherDashboard = {
  to_mark: {
    id: string;
    group: string;
    starts_at: string;
    timezone: string;
    closes_at: string;
    expected: number;
    marked: number;
  }[];
  groups: { id: string; name: string; students: number; last_score: string | null }[];
  scores_to_enter: { id: string; name: string; last_score: string | null }[];
};

export async function loadOwnerDashboard(ctx: CenterContext, branchId: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_owner", {
    p_center_id: ctx.center.id,
    ...(branchId ? { p_branch_id: branchId } : {}),
  });
  if (error) throw new Error(error.message);
  return data as unknown as OwnerDashboard;
}

export async function loadAdminDashboard(ctx: CenterContext) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_admin", { p_center_id: ctx.center.id });
  if (error) throw new Error(error.message);
  return data as unknown as AdminDashboard;
}

export async function loadTeacherDashboard(ctx: CenterContext) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_teacher", { p_center_id: ctx.center.id });
  if (error) throw new Error(error.message);
  return data as unknown as TeacherDashboard;
}
