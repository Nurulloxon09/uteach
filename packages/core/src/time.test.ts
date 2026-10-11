import { describe, expect, it } from "vitest";
import { addDays, isValidTimeZone, isoWeekday, toInstant, toLocalDate, todayIn } from "./time";

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Asia/Tashkent")).toBe(true);
    expect(isValidTimeZone("Asia/Almaty")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("toInstant", () => {
  it("uses the branch offset (Tashkent is UTC+5)", () => {
    expect(toInstant("2026-10-12", "18:00", "Asia/Tashkent").toISOString()).toBe(
      "2026-10-12T13:00:00.000Z",
    );
  });

  it("follows DST in zones that have it", () => {
    // New York: EST (UTC-5) before 2026-03-08, EDT (UTC-4) after.
    expect(toInstant("2026-03-06", "18:00", "America/New_York").toISOString()).toBe(
      "2026-03-06T23:00:00.000Z",
    );
    expect(toInstant("2026-03-09", "18:00", "America/New_York").toISOString()).toBe(
      "2026-03-09T22:00:00.000Z",
    );
  });

  it("moves a wall time skipped by DST forward", () => {
    // 02:30 does not exist on 2026-03-08 in New York; it becomes 03:30 EDT.
    expect(toInstant("2026-03-08", "02:30", "America/New_York").toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("rejects malformed input", () => {
    expect(() => toInstant("12.10.2026", "18:00", "Asia/Tashkent")).toThrow(RangeError);
    expect(() => toInstant("2026-10-12", "6pm", "Asia/Tashkent")).toThrow(RangeError);
  });
});

describe("toLocalDate / todayIn", () => {
  it("returns the calendar day in the zone, not UTC", () => {
    const instant = new Date("2026-10-12T20:30:00Z"); // 01:30 on the 13th in Tashkent
    expect(toLocalDate(instant, "Asia/Tashkent")).toBe("2026-10-13");
    expect(toLocalDate(instant, "UTC")).toBe("2026-10-12");
    expect(todayIn("Asia/Tashkent", instant)).toBe("2026-10-13");
  });
});

describe("addDays / isoWeekday", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("numbers weekdays ISO-style", () => {
    expect(isoWeekday("2026-10-12")).toBe(1); // Monday
    expect(isoWeekday("2026-10-18")).toBe(7); // Sunday
  });
});
