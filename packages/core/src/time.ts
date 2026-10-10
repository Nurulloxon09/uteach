import { TZDate } from "@date-fns/tz";

/**
 * Time helpers. Calendar days are "YYYY-MM-DD" strings interpreted in a branch timezone;
 * instants are Date objects. See docs/spec/04-rules.md §3: never use server time or UTC days.
 */

export type LocalDate = string; // "YYYY-MM-DD"
export type LocalTime = string; // "HH:mm" or "HH:mm:ss"

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parseLocalDate(date: LocalDate): [number, number, number] {
  const m = LOCAL_DATE.exec(date);
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: "${date}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function parseLocalTime(time: LocalTime): [number, number, number] {
  const m = LOCAL_TIME.exec(time);
  if (!m) throw new RangeError(`not a HH:mm time: "${time}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

/**
 * The instant at which the wall clock in `timeZone` shows `date` `time`.
 * A wall time skipped by a DST jump resolves to the first valid instant after it.
 */
export function toInstant(date: LocalDate, time: LocalTime, timeZone: string): Date {
  const [y, mo, d] = parseLocalDate(date);
  const [h, mi, s] = parseLocalTime(time);
  return new Date(new TZDate(y, mo - 1, d, h, mi, s, timeZone).getTime());
}

/** The calendar day an instant falls on, in `timeZone`. */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** "Today" in a branch timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return toLocalDate(now, timeZone);
}

/** Add whole calendar days to a local date (no timezone involved). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, mo, d] = parseLocalDate(date);
  const utc = new Date(Date.UTC(y, mo - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  const [y, mo, d] = parseLocalDate(date);
  const day = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}
