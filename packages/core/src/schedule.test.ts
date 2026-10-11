import { describe, expect, it } from "vitest";
import {
  GENERATION_DAYS,
  expandRules,
  generationRange,
  parseWeekdays,
  suggestGroupName,
  type ScheduleRule,
} from "./schedule";
import fixtures from "./schedule.fixtures.json";

type Fixture = {
  name: string;
  timeZone: string;
  range: { from: string; to: string };
  holidays: string[];
  rules: ScheduleRule[];
  expected?: { ruleId: string; localDate: string; startsAt: string; endsAt: string }[];
};

const serialise = (lessons: ReturnType<typeof expandRules>) =>
  lessons.map((l) => ({
    ruleId: l.ruleId,
    localDate: l.localDate,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
  }));

describe("expandRules: shared fixtures (also checked against SQL in packages/db)", () => {
  for (const f of (fixtures as Fixture[]).filter((x) => x.expected)) {
    it(f.name, () => {
      expect(serialise(expandRules(f.rules, f.holidays, f.range, f.timeZone))).toEqual(f.expected);
    });
  }
});

describe("expandRules: 8 weeks of Mon/Wed/Fri 18:00", () => {
  const f = (fixtures as Fixture[])[0]!;
  const lessons = expandRules(f.rules, f.holidays, f.range, f.timeZone);

  it("makes exactly 3 lessons a week for 8 weeks", () => {
    expect(lessons).toHaveLength(24);
  });

  it("puts every lesson at 18:00 Tashkent (13:00 UTC) on Mon, Wed or Fri", () => {
    for (const l of lessons) {
      expect(l.startsAt.toISOString().slice(11, 16)).toBe("13:00");
      expect(l.endsAt.getTime() - l.startsAt.getTime()).toBe(90 * 60_000);
    }
    expect(lessons[0]!.localDate).toBe("2026-10-12");
    expect(lessons.at(-1)!.localDate).toBe("2026-12-04");
  });

  it("is deterministic, so regeneration finds the same (rule, day) pairs", () => {
    const again = expandRules(f.rules, f.holidays, f.range, f.timeZone);
    expect(serialise(again)).toEqual(serialise(lessons));
    const keys = lessons.map((l) => `${l.ruleId}:${l.localDate}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("generationRange", () => {
  it("runs 8 weeks from today", () => {
    expect(GENERATION_DAYS).toBe(56);
    expect(generationRange("2026-10-12", "2026-09-01", null)).toEqual({
      from: "2026-10-12",
      to: "2026-12-06",
    });
  });

  it("never starts in the past, and starts later for a future group", () => {
    expect(generationRange("2026-10-12", "2026-10-20", null)?.from).toBe("2026-10-20");
  });

  it("stops at the group's end date", () => {
    expect(generationRange("2026-10-12", "2026-09-01", "2026-10-31")).toEqual({
      from: "2026-10-12",
      to: "2026-10-31",
    });
  });

  it("is empty for a group that has ended or starts beyond the horizon", () => {
    expect(generationRange("2026-10-12", "2026-09-01", "2026-10-11")).toBeNull();
    expect(generationRange("2026-10-12", "2027-01-01", null)).toBeNull();
  });
});

describe("parseWeekdays", () => {
  it.each([
    ["Mon/Wed/Fri", [1, 3, 5]],
    ["Tue, Thu", [2, 4]],
    ["Du/Chor/Ju", [1, 3, 5]],
    ["Seshanba Payshanba Shanba", [2, 4, 6]],
    ["Пн-Ср-Пт", [1, 3, 5]],
    ["вторник; четверг", [2, 4]],
    ["1,3,5", [1, 3, 5]],
    ["Fri Mon mon", [1, 5]],
    ["Sun.", [7]],
  ])("%s", (text, days) => {
    expect(parseWeekdays(text)).toEqual(days);
  });

  it("rejects unknown words, out-of-range digits and empty text", () => {
    expect(parseWeekdays("Mon/Funday")).toBeNull();
    expect(parseWeekdays("8")).toBeNull();
    expect(parseWeekdays("  ")).toBeNull();
  });
});

describe("suggestGroupName", () => {
  const labels = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

  it("joins course, level, days and time", () => {
    expect(
      suggestGroupName(
        { course: "IELTS", level: "6.0", weekdays: [1, 3, 5], startTime: "18:00:00" },
        labels,
      ),
    ).toBe("IELTS 6.0 · Mon/Wed/Fri 18:00");
  });

  it("leaves out what isn't known yet", () => {
    expect(suggestGroupName({ course: "Kids English", weekdays: [] }, labels)).toBe("Kids English");
    expect(suggestGroupName({ course: "SAT", weekdays: [6] }, labels)).toBe("SAT · Sat");
  });
});
