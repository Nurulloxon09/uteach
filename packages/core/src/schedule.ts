import { addDays, isoWeekday, toInstant, type LocalDate, type LocalTime } from "./time";

/**
 * Lesson generation (docs/spec/13-schedule.md). Pure: no I/O, no clock. The SQL generator
 * (`private.expand_rules`) mirrors `expandRules` and is checked against the same fixtures
 * (`schedule.fixtures.json`) by the parity test in packages/db.
 */

/** Lessons are generated this many days ahead, counting today (8 weeks). */
export const GENERATION_DAYS = 56;

export type ScheduleRule = {
  id: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Branch-local wall-clock time, "HH:mm" or "HH:mm:ss". */
  startTime: LocalTime;
  durationMinutes: number;
  validFrom: LocalDate;
  /** Inclusive; null = open-ended. */
  validTo: LocalDate | null;
};

export type GeneratedLesson = {
  ruleId: string;
  localDate: LocalDate;
  startsAt: Date;
  endsAt: Date;
};

export type DateRange = { from: LocalDate; to: LocalDate };

const maxDate = (a: LocalDate, b: LocalDate) => (a > b ? a : b);
const minDate = (a: LocalDate, b: LocalDate) => (a < b ? a : b);

/**
 * The days lessons may be generated for: from today (never the past) or the group's start,
 * up to 8 weeks ahead or the group's end. Null when the window is empty.
 */
export function generationRange(
  today: LocalDate,
  groupStart: LocalDate,
  groupEnd: LocalDate | null,
): DateRange | null {
  const from = maxDate(today, groupStart);
  const horizon = addDays(today, GENERATION_DAYS - 1);
  const to = groupEnd ? minDate(horizon, groupEnd) : horizon;
  return from <= to ? { from, to } : null;
}

/**
 * Concrete lessons for `rules` on the days of `range` (inclusive) in `timeZone`, skipping `holidays`.
 * Sorted by start time, then rule id. Each (rule, day) appears at most once.
 */
export function expandRules(
  rules: readonly ScheduleRule[],
  holidays: readonly LocalDate[],
  range: DateRange,
  timeZone: string,
): GeneratedLesson[] {
  const skip = new Set(holidays);
  const lessons: GeneratedLesson[] = [];

  for (const rule of rules) {
    const from = maxDate(range.from, rule.validFrom);
    const to = rule.validTo ? minDate(range.to, rule.validTo) : range.to;
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (isoWeekday(day) !== rule.weekday || skip.has(day)) continue;
      const startsAt = toInstant(day, rule.startTime, timeZone);
      lessons.push({
        ruleId: rule.id,
        localDate: day,
        startsAt,
        endsAt: new Date(startsAt.getTime() + rule.durationMinutes * 60_000),
      });
    }
  }

  return lessons.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0),
  );
}

/**
 * Weekday names accepted in imported files, all lower-case: English, Russian and Uzbek (Latin) full names
 * and their usual short forms. Digits 1–7 are accepted too.
 */
const WEEKDAY_WORDS: Record<number, string[]> = {
  1: ["mon", "monday", "mo", "пн", "пон", "понедельник", "du", "dush", "dushanba"],
  2: ["tue", "tues", "tuesday", "tu", "вт", "вто", "вторник", "se", "sesh", "seshanba"],
  3: ["wed", "wednesday", "we", "ср", "сре", "среда", "ch", "chor", "chorshanba"],
  4: ["thu", "thur", "thurs", "thursday", "th", "чт", "чет", "четверг", "pa", "pay", "payshanba"],
  5: ["fri", "friday", "fr", "пт", "пят", "пятница", "ju", "jum", "juma"],
  6: ["sat", "saturday", "sa", "сб", "суб", "суббота", "sh", "shan", "shanba"],
  7: ["sun", "sunday", "su", "вс", "вос", "воскресенье", "ya", "yak", "yakshanba"],
};

const WEEKDAY_BY_WORD = new Map<string, number>(
  Object.entries(WEEKDAY_WORDS).flatMap(([day, words]) => words.map((w) => [w, Number(day)])),
);

/**
 * Parses a weekday list such as "Mon/Wed/Fri", "Du, Chor, Ju", "Пн-Ср-Пт" or "1 3 5" into sorted ISO
 * weekdays. Returns null if any part isn't a weekday or the list is empty.
 */
export function parseWeekdays(text: string): number[] | null {
  const parts = text
    .toLowerCase()
    .replace(/[ʻʼ‘’'`.]/g, "")
    .split(/[\s,;/|+\-–—]+/)
    .filter(Boolean);
  if (parts.length === 0) return null;

  const days = new Set<number>();
  for (const part of parts) {
    const day = /^[1-7]$/.test(part) ? Number(part) : WEEKDAY_BY_WORD.get(part);
    if (!day) return null;
    days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Suggested group name, e.g. "IELTS 6.0 · Mon/Wed/Fri 18:00" (12-students-groups). `dayLabels[1..7]`
 * are the short weekday names in the UI language.
 */
export function suggestGroupName(
  parts: {
    course: string;
    level?: string | null;
    weekdays: number[];
    startTime?: LocalTime | null;
  },
  dayLabels: Record<number, string>,
): string {
  const title = [parts.course, parts.level].filter(Boolean).join(" ");
  const days = parts.weekdays.map((d) => dayLabels[d] ?? String(d)).join("/");
  const time = parts.startTime ? parts.startTime.slice(0, 5) : "";
  const when = [days, time].filter(Boolean).join(" ");
  return when ? `${title} · ${when}` : title;
}
