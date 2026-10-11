import { addDays, isoWeekday, type LocalDate } from "@uteach/core";
import { intlLocale, isLocale } from "@uteach/i18n";

/**
 * Calendar helpers for screens. Days are "YYYY-MM-DD" in the branch timezone (04-rules §3);
 * names come from Intl, so they follow the UI language without catalog entries.
 */

const MONDAY = Date.UTC(2024, 0, 1); // 2024-01-01 was a Monday

/** Weekday names keyed 1 (Monday) … 7, e.g. { 1: "Mon", … } or { 1: "Monday", … }. */
export function weekdayLabels(
  locale: string,
  width: "short" | "long" = "short",
): Record<number, string> {
  const format = new Intl.DateTimeFormat(isLocale(locale) ? intlLocale(locale) : locale, {
    weekday: width,
    timeZone: "UTC",
  });
  const labels: Record<number, string> = {};
  for (let d = 1; d <= 7; d++) labels[d] = format.format(new Date(MONDAY + (d - 1) * 86_400_000));
  return labels;
}

/** The Monday of the week that contains `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

/** The 7 days of the week starting at `monday`. */
export function weekDays(monday: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Calendar day and minutes after midnight of an instant, in `timeZone`. */
export function localParts(
  instant: Date | string,
  timeZone: string,
): { date: LocalDate; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** "18:00" from minutes after midnight. */
export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A plain-date value as a Date at noon UTC, for formatting a calendar day without timezone drift. */
export function dayAsDate(date: LocalDate): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** The first day of the month that contains `date`. */
export function monthStart(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isLocalDate = (value: unknown): value is LocalDate =>
  typeof value === "string" && LOCAL_DATE.test(value) && !Number.isNaN(Date.parse(value));
