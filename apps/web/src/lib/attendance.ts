import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@uteach/core";
import type { ChipTone, StatusOption } from "@/components/patterns";

/** Attendance colors by meaning (05-ui, M2): present = success, late = warning, absent = destructive. */
export const ATTENDANCE_TONE: Record<AttendanceStatus, ChipTone> = {
  present: "success",
  late: "warning",
  absent: "destructive",
  excused: "primary",
};

/** The four marks as one-tap options: short labels on the buttons, full ones for screen readers. */
export function attendanceOptions(
  short: (status: AttendanceStatus) => string,
  full: (status: AttendanceStatus) => string,
): StatusOption[] {
  return ATTENDANCE_STATUSES.map((s) => ({
    value: s,
    label: short(s),
    srLabel: full(s),
    tone: ATTENDANCE_TONE[s],
  }));
}

/** The current time for lesson states (a function, so pages read it once per request). */
export const nowMs = () => Date.now();

/** Marking opens 30 minutes before the start (14). */
export const MARKING_OPENS_MS = 30 * 60 * 1000;

export type LessonStats = {
  expected: number;
  marked: number;
  absent: number;
};

/** What a lesson card or row shows about its attendance. */
export type MarkState =
  | { kind: "cancelled" }
  | { kind: "upcoming" }
  | { kind: "toMark" }
  | { kind: "notMarked" }
  | { kind: "marked"; marked: number; expected: number; absent: number };

export function markState(
  lesson: { status: string; startsAt: string; endsAt: string },
  stats: LessonStats | undefined,
  now: number,
): MarkState {
  if (lesson.status === "cancelled") return { kind: "cancelled" };
  if (stats && stats.marked > 0)
    return { kind: "marked", marked: stats.marked, expected: stats.expected, absent: stats.absent };
  if (now < Date.parse(lesson.startsAt) - MARKING_OPENS_MS) return { kind: "upcoming" };
  return now < Date.parse(lesson.endsAt) ? { kind: "toMark" } : { kind: "notMarked" };
}
