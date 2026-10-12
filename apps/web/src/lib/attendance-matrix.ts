import {
  addDays,
  attendanceRateBp,
  countMarks,
  isAttendanceStatus,
  type AttendanceCounts,
  type AttendanceStatus,
} from "@uteach/core";
import { localParts } from "@/lib/dates";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type DayState = "expected" | "frozen" | "out";

export type MatrixLesson = {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  startMinutes: number;
  cancelled: boolean;
  teacherId: string;
};

export type MatrixCell = {
  state: DayState;
  status: AttendanceStatus | null;
  lateMinutes: number | null;
  note: string | null;
};

export type MatrixStudent = {
  id: string;
  name: string;
  cells: Record<string, MatrixCell>;
  counts: AttendanceCounts;
  /** (present + late) / (marked − excused) in basis points; null when nothing counts. */
  rateBp: number | null;
};

export type Matrix = { lessons: MatrixLesson[]; students: MatrixStudent[] };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" from a search param, or the fallback. */
export function monthParam(value: unknown, fallback: string): string {
  return typeof value === "string" && MONTH.test(value) ? value : fallback;
}

/** The month `delta` months after `month` ("YYYY-MM"). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** First and last day of a month. */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}

/**
 * A group's attendance for one month (14): lessons as columns, students as rows (names only, through
 * `attendance_matrix`, so teachers can read it), with counts and the rate per student.
 * Null when the caller may not see the group.
 */
export async function loadMatrix(
  supabase: Supabase,
  groupId: string,
  month: string,
  timeZone: string,
): Promise<Matrix | null> {
  const { from, to } = monthRange(month);
  const [{ data: lessons }, { data: rows, error }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, local_date, starts_at, ends_at, status, teacher_membership_id")
      .eq("group_id", groupId)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("starts_at"),
    supabase.rpc("attendance_matrix", { p_group_id: groupId, p_from: from, p_to: to }),
  ]);
  if (error) return null;

  const students = new Map<string, MatrixStudent>();
  for (const r of rows ?? []) {
    let student = students.get(r.student_id);
    if (!student) {
      student = {
        id: r.student_id,
        name: r.full_name,
        cells: {},
        counts: countMarks([]),
        rateBp: null,
      };
      students.set(r.student_id, student);
    }
    student.cells[r.lesson_id] = {
      state: r.day_state === "frozen" || r.day_state === "out" ? r.day_state : "expected",
      status: isAttendanceStatus(r.status) ? r.status : null,
      lateMinutes: r.late_minutes,
      note: r.note,
    };
  }
  for (const s of students.values()) {
    s.counts = countMarks(Object.values(s.cells).map((c) => c.status));
    s.rateBp = attendanceRateBp(s.counts);
  }

  return {
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      date: l.local_date,
      startsAt: l.starts_at,
      endsAt: l.ends_at,
      startMinutes: localParts(l.starts_at, timeZone).minutes,
      cancelled: l.status === "cancelled",
      teacherId: l.teacher_membership_id,
    })),
    students: [...students.values()],
  };
}
