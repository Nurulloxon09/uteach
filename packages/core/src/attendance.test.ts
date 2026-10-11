import { describe, expect, it } from "vitest";
import { attendanceRateBp, countMarks, isAttendanceStatus } from "./attendance";

describe("countMarks", () => {
  it("counts each status and skips unmarked cells", () => {
    expect(
      countMarks(["present", "late", null, "absent", "present", undefined, "excused"]),
    ).toEqual({
      present: 2,
      late: 1,
      absent: 1,
      excused: 1,
      marked: 5,
    });
  });

  it("is all zeros for an empty month", () => {
    expect(countMarks([])).toEqual({ present: 0, late: 0, absent: 0, excused: 0, marked: 0 });
  });
});

describe("attendanceRateBp", () => {
  it("is 100% when every counted lesson was attended", () => {
    expect(attendanceRateBp({ present: 12, late: 0, absent: 0 })).toBe(10000);
  });

  it("counts late as attended", () => {
    expect(attendanceRateBp({ present: 6, late: 2, absent: 2 })).toBe(8000);
  });

  it("leaves excused lessons out of both sides", () => {
    const counts = countMarks([
      ...Array<"present">(8).fill("present"),
      ...Array<"absent">(2).fill("absent"),
      ...Array<"excused">(5).fill("excused"),
    ]);
    // (8 + 0) / (15 − 5), not 8 / 15
    expect(attendanceRateBp(counts)).toBe(8000);
  });

  it("rounds half up on basis points", () => {
    expect(attendanceRateBp({ present: 1, late: 0, absent: 31 })).toBe(313); // 312.5
    expect(attendanceRateBp({ present: 2, late: 0, absent: 1 })).toBe(6667); // 6666.67
    expect(attendanceRateBp({ present: 1, late: 0, absent: 2 })).toBe(3333); // 3333.33
  });

  it("is null when no lesson counts (nothing marked, or only excused)", () => {
    expect(attendanceRateBp({ present: 0, late: 0, absent: 0 })).toBeNull();
    expect(attendanceRateBp(countMarks(["excused", "excused", null]))).toBeNull();
  });

  it("is 0% when every counted lesson was missed", () => {
    expect(attendanceRateBp({ present: 0, late: 0, absent: 3 })).toBe(0);
  });
});

describe("isAttendanceStatus", () => {
  it("accepts the four marks only", () => {
    expect(["present", "late", "absent", "excused"].every(isAttendanceStatus)).toBe(true);
    expect(isAttendanceStatus("here")).toBe(false);
    expect(isAttendanceStatus(null)).toBe(false);
  });
});
