import "server-only";
import type { LeadSource, LeadStatus, LostReasonKey } from "@uteach/core";
import { cache } from "react";
import type { GroupOption } from "@/lib/academics";
import type { CenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

/** Read helpers shared by the Leads screens (11). Everything goes through the user's session (RLS). */

export type AssigneeOption = { id: string; name: string; profileId: string | null };
export type LostReasonOption = {
  id: string;
  systemKey: LostReasonKey | null;
  label: string | null;
  sortOrder: number;
  archived: boolean;
};

export type LeadRow = {
  id: string;
  branch_id: string;
  full_name: string;
  phone: string | null;
  telegram_username: string | null;
  source: LeadSource;
  source_detail: string | null;
  status: LeadStatus;
  goal: string | null;
  target_score: number | null;
  current_level: string | null;
  interested_course_id: string | null;
  preferred_schedule: string | null;
  assigned_membership_id: string | null;
  next_follow_up_at: string | null;
  lost_reason_id: string | null;
  lost_note: string | null;
  converted_student_id: string | null;
  archived_at: string | null;
  created_at: string;
};

export const LEAD_COLUMNS =
  "id, branch_id, full_name, phone, telegram_username, source, source_detail, status, goal, target_score, " +
  "current_level, interested_course_id, preferred_schedule, assigned_membership_id, next_follow_up_at, " +
  "lost_reason_id, lost_note, converted_student_id, archived_at, created_at";

/** Owners and admins a lead or a task can be assigned to (active or invited). */
export const loadAssignees = cache(async (ctx: CenterContext): Promise<AssigneeOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, display_name, profile_id")
    .eq("center_id", ctx.center.id)
    .in("role", ["owner", "admin"])
    .in("status", ["active", "invited"])
    .order("display_name");
  return (data ?? []).map((m) => ({ id: m.id, name: m.display_name, profileId: m.profile_id }));
});

/** The center's lost reasons, archived ones included (old leads still show theirs). */
export const loadLostReasons = cache(async (ctx: CenterContext): Promise<LostReasonOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lost_reasons")
    .select("id, system_key, label, sort_order, archived_at")
    .eq("center_id", ctx.center.id)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((r) => ({
    id: r.id,
    systemKey: r.system_key as LostReasonKey | null,
    label: r.label,
    sortOrder: r.sort_order,
    archived: r.archived_at !== null,
  }));
});

export type TrialLessonOption = {
  id: string;
  groupId: string;
  groupName: string;
  courseId: string;
  levelId: string | null;
  branchId: string;
  startsAt: string;
  teacherName: string;
  /** Students in the group now, and its capacity (null = no limit). */
  count: number;
  capacity: number | null;
};

/** Upcoming lessons (next 3 weeks) of live groups in the user's branches, for the trial picker (11). */
export async function loadTrialLessons(
  ctx: CenterContext,
  groups: GroupOption[],
  teachers: { id: string; name: string }[],
): Promise<TrialLessonOption[]> {
  const mine = groups.filter((g) => ctx.can.inBranch(g.branchId));
  if (mine.length === 0) return [];
  const supabase = await createClient();
  const now = Date.now();
  const { data } = await supabase
    .from("lessons")
    .select("id, group_id, starts_at, teacher_membership_id")
    .eq("center_id", ctx.center.id)
    .eq("status", "scheduled")
    .in(
      "group_id",
      mine.map((g) => g.id),
    )
    .gt("starts_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + 21 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(300);
  const group = new Map(mine.map((g) => [g.id, g]));
  const teacher = new Map(teachers.map((t) => [t.id, t.name]));
  return (data ?? []).flatMap((l) => {
    const g = group.get(l.group_id);
    if (!g) return [];
    return [
      {
        id: l.id,
        groupId: g.id,
        groupName: g.name,
        courseId: g.courseId,
        levelId: g.levelId,
        branchId: g.branchId,
        startsAt: l.starts_at,
        teacherName: teacher.get(l.teacher_membership_id) ?? "—",
        count: g.count,
        capacity: g.capacity,
      },
    ];
  });
}
