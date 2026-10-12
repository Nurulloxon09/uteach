import "server-only";
import { todayIn, type ImportKind } from "@uteach/core";
import { loadBranches, loadCourses, loadRooms, loadTeachers } from "@/lib/academics";
import type { CenterContext } from "@/lib/center";
import { fetchAll as all } from "@/lib/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { ImportContext } from "./validate";

/** What validation needs to know about the center (through the user's session, so RLS applies). */
export async function loadImportContext(
  ctx: CenterContext,
  kind: ImportKind,
): Promise<ImportContext> {
  const supabase = await createClient();
  const [branches, courses, teachers, rooms, students, groups, enrollments, openings] =
    await Promise.all([
      loadBranches(ctx),
      loadCourses(ctx),
      loadTeachers(ctx),
      loadRooms(ctx),
      all((from, to) =>
        supabase
          .from("students")
          .select("id, full_name, phone, external_ref")
          .eq("center_id", ctx.center.id)
          .order("id")
          .range(from, to),
      ),
      all((from, to) =>
        supabase
          .from("groups")
          .select("id, name, branch_id")
          .eq("center_id", ctx.center.id)
          .is("archived_at", null)
          .order("id")
          .range(from, to),
      ),
      all((from, to) =>
        supabase
          .from("enrollments")
          .select("student_id, group_id")
          .eq("center_id", ctx.center.id)
          .neq("status", "ended")
          .order("id")
          .range(from, to),
      ),
      kind === "opening_balances"
        ? all((from, to) =>
            supabase
              .from("balance_adjustments")
              .select("student_id")
              .eq("center_id", ctx.center.id)
              .eq("kind", "opening_balance")
              .is("voided_at", null)
              .order("id")
              .range(from, to),
          )
        : Promise.resolve([] as { student_id: string }[]),
    ]);

  return {
    country: ctx.center.countryCode,
    billing: ctx.can.billing,
    today: todayIn(ctx.center.timezone),
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name,
      defaultLessonMinutes: c.defaultLessonMinutes,
      levels: c.levels.map((l) => ({ id: l.id, name: l.name })),
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      branchIds: t.branchIds,
    })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId })),
    students: students.map((s) => ({
      id: s.id,
      fullName: s.full_name,
      phone: s.phone,
      externalRef: s.external_ref,
    })),
    groups: groups.map((g) => ({ id: g.id, name: g.name, branchId: g.branch_id })),
    openEnrollments: new Set(enrollments.map((e) => `${e.student_id}:${e.group_id}`)),
    openingBalances: new Set(openings.map((a) => a.student_id)),
  };
}
