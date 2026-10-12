import "server-only";
import { cache } from "react";
import type { CenterContext } from "@/lib/center";
import { paletteFor, type PaletteKey } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";

/** Read helpers shared by the academic screens. Everything goes through the user's session (RLS). */

export type BranchOption = { id: string; name: string; timezone: string };
export type RoomOption = { id: string; name: string; branchId: string; capacity: number | null };
export type TeacherOption = {
  id: string;
  name: string;
  role: "owner" | "admin" | "teacher";
  branchIds: string[];
  palette: PaletteKey;
  invited: boolean;
};
export type LevelOption = {
  id: string;
  name: string;
  sortOrder: number;
  nextLevelId: string | null;
};
export type CourseOption = {
  id: string;
  name: string;
  kind: string;
  defaultLessonMinutes: number | null;
  levels: LevelOption[];
};

/** Live branches the user works in. */
export const loadBranches = cache(async (ctx: CenterContext): Promise<BranchOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name, timezone")
    .eq("center_id", ctx.center.id)
    .is("archived_at", null)
    .order("created_at");
  return (data ?? []).filter((b) => ctx.can.inBranch(b.id));
});

export const loadRooms = cache(async (ctx: CenterContext): Promise<RoomOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, name, branch_id, capacity")
    .eq("center_id", ctx.center.id)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    branchId: r.branch_id,
    capacity: r.capacity,
  }));
});

/**
 * Staff who can teach: teachers, and owners/admins (lessons reference a membership, not a role).
 * Owners and admins see everyone; a teacher sees only their own row (RLS).
 */
export const loadTeachers = cache(async (ctx: CenterContext): Promise<TeacherOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, display_name, role, branch_ids, color, status")
    .eq("center_id", ctx.center.id)
    .in("status", ["active", "invited"])
    .order("display_name");
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.display_name,
    role: m.role,
    branchIds: m.branch_ids,
    palette: paletteFor(m.color, m.id),
    invited: m.status === "invited",
  }));
});

/** Teachers who may be assigned in a branch: the owner, or staff with that branch. */
export function teachersFor(teachers: TeacherOption[], branchId: string): TeacherOption[] {
  return teachers.filter((t) => t.role === "owner" || t.branchIds.includes(branchId));
}

export const loadCourses = cache(async (ctx: CenterContext): Promise<CourseOption[]> => {
  const supabase = await createClient();
  const [{ data: courses }, { data: levels }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, kind, default_lesson_minutes")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("levels")
      .select("id, course_id, name, sort_order, next_level_id")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .order("sort_order"),
  ]);
  return (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    defaultLessonMinutes: c.default_lesson_minutes,
    levels: (levels ?? [])
      .filter((l) => l.course_id === c.id)
      .map((l) => ({
        id: l.id,
        name: l.name,
        sortOrder: l.sort_order,
        nextLevelId: l.next_level_id,
      })),
  }));
});

/** Course default prices (money): only for staff with `billing`. */
export const loadCoursePrices = cache(
  async (ctx: CenterContext): Promise<Record<string, string>> => {
    if (!ctx.can.billing) return {};
    const supabase = await createClient();
    const { data } = await supabase.rpc("course_default_prices", { p_center_id: ctx.center.id });
    const prices: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.default_price_amount !== null)
        prices[row.course_id] = String(row.default_price_amount);
    }
    return prices;
  },
);

export type GroupOption = {
  id: string;
  name: string;
  branchId: string;
  courseId: string;
  levelId: string | null;
  capacity: number | null;
  /** Students in the group now (active or frozen). */
  count: number;
};

/** Groups that can take students (live, not finished), with how many students they have (staff only). */
export const loadGroupOptions = cache(async (ctx: CenterContext): Promise<GroupOption[]> => {
  const supabase = await createClient();
  const [{ data: groups }, { data: enrollments }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, branch_id, course_id, level_id, capacity")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .neq("status", "finished")
      .order("name"),
    supabase
      .from("enrollments")
      .select("group_id")
      .eq("center_id", ctx.center.id)
      .neq("status", "ended"),
  ]);
  const count = new Map<string, number>();
  for (const e of enrollments ?? []) count.set(e.group_id, (count.get(e.group_id) ?? 0) + 1);
  return (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    branchId: g.branch_id,
    courseId: g.course_id,
    levelId: g.level_id,
    capacity: g.capacity,
    count: count.get(g.id) ?? 0,
  }));
});

/**
 * Whether the user teaches (05-ui, M2): the teacher of a live group, or of a lesson within 30 days either
 * side. Owners and admins who teach get "Today" in the nav.
 */
export const teachesLessons = cache(async (ctx: CenterContext): Promise<boolean> => {
  const supabase = await createClient();
  const month = 30 * 86_400_000;
  const now = Date.now();
  const [{ count: groups }, { count: lessons }] = await Promise.all([
    supabase
      .from("groups")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .eq("teacher_membership_id", ctx.membership.id)
      .is("archived_at", null),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .eq("teacher_membership_id", ctx.membership.id)
      .gte("starts_at", new Date(now - month).toISOString())
      .lte("starts_at", new Date(now + month).toISOString()),
  ]);
  return (groups ?? 0) + (lessons ?? 0) > 0;
});
