import "server-only";
import { todayIn } from "@uteach/core";
import {
  loadBranches,
  loadCoursePrices,
  loadCourses,
  loadRooms,
  loadTeachers,
} from "@/lib/academics";
import type { CenterContext } from "@/lib/center";
import { minorToInput } from "@/lib/validation";
import type { GroupFormData } from "./group-dialog";

/** Everything the group dialogs need: branches in scope, courses with levels, rooms, teachers, prices. */
export async function groupFormData(ctx: CenterContext): Promise<GroupFormData> {
  const [branches, courses, rooms, teachers, prices] = await Promise.all([
    loadBranches(ctx),
    loadCourses(ctx),
    loadRooms(ctx),
    loadTeachers(ctx),
    loadCoursePrices(ctx),
  ]);
  return {
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name,
      defaultLessonMinutes: c.defaultLessonMinutes,
      levels: c.levels.map((l) => ({ id: l.id, name: l.name })),
    })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId })),
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      branchIds: t.branchIds,
      role: t.role,
    })),
    coursePrices: Object.fromEntries(
      Object.entries(prices).map(([id, minor]) => [id, minorToInput(minor)]),
    ),
    showPrice: ctx.can.billing,
    today: todayIn(ctx.center.timezone),
  };
}
