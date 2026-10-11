/**
 * Attendance marks and the attendance rate (docs/spec/14-attendance.md).
 * The database decides who is expected and who may mark; this is the arithmetic the matrix and exports share.
 */
export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export type AttendanceCounts = Record<AttendanceStatus, number> & {
  /** Marked lessons (any status). */
  marked: number;
};

/** Counts marks by status; unmarked cells (null) are skipped. */
export function countMarks(marks: Iterable<AttendanceStatus | null | undefined>): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, late: 0, absent: 0, excused: 0, marked: 0 };
  for (const mark of marks) {
    if (!mark) continue;
    counts[mark] += 1;
    counts.marked += 1;
  }
  return counts;
}

/**
 * Attendance rate in basis points (10000 = 100%): (present + late) / (marked − excused), rounded half up.
 * Excused lessons count neither way. Null when no lesson counts (the UI shows "—").
 */
export function attendanceRateBp(
  counts: Pick<AttendanceCounts, "present" | "late" | "absent">,
): number | null {
  const attended = counts.present + counts.late;
  const counted = attended + counts.absent;
  if (counted === 0) return null;
  return Math.floor((attended * 20000 + counted) / (2 * counted));
}
