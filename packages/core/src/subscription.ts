import { addDays, toInstant, toLocalDate, type LocalDate } from "./time";

/**
 * The center status machine (10, M7 plan), mirrored by `private.center_status_next` in SQL and checked against it
 * on `subscription.fixtures.json`: a trial past its end → past_due (counted from the trial end); an active center
 * past its last paid day (center timezone) → past_due (from the next local midnight); past_due for 7 days →
 * read_only. Other statuses don't move by themselves.
 */

export const CENTER_STATUSES = ["trial", "active", "past_due", "read_only", "cancelled"] as const;
export type CenterStatus = (typeof CENTER_STATUSES)[number];

export const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

export type CenterClock = {
  status: CenterStatus;
  trialEndsAt: Date | null;
  paidUntil: LocalDate | null;
  pastDueSince: Date | null;
  timeZone: string;
};

export function centerStatusNext(
  center: CenterClock,
  now: Date,
): { status: CenterStatus; pastDueSince: Date | null } {
  let status = center.status;
  let since = center.pastDueSince;
  if (status === "trial" && center.trialEndsAt && center.trialEndsAt.getTime() <= now.getTime()) {
    status = "past_due";
    since = center.trialEndsAt;
  } else if (
    status === "active" &&
    center.paidUntil !== null &&
    center.paidUntil < toLocalDate(now, center.timeZone)
  ) {
    status = "past_due";
    since = toInstant(addDays(center.paidUntil, 1), "00:00", center.timeZone);
  }
  if (status === "past_due") {
    since ??= now;
    if (since.getTime() + GRACE_DAYS * DAY_MS <= now.getTime()) status = "read_only";
  }
  return { status, pastDueSince: since };
}

/** Calendar days from today to the day of `instant`, both in `timeZone` (0 on the day itself or after). */
export function daysUntil(instant: Date, now: Date, timeZone: string): number {
  const day = (d: Date) => Date.parse(`${toLocalDate(d, timeZone)}T00:00:00Z`);
  return Math.max(0, Math.round((day(instant) - day(now)) / DAY_MS));
}

/** When a past_due center becomes read_only. */
export function readOnlyAt(pastDueSince: Date): Date {
  return new Date(pastDueSince.getTime() + GRACE_DAYS * DAY_MS);
}

/** Can the center take one more active student? `limit` null = unlimited. */
export function hasStudentRoom(activeStudents: number, limit: number | null): boolean {
  return limit === null || activeStudents < limit;
}

/** The banner the app shows, if any: the last 3 trial days, the grace period, read-only. */
export type SubscriptionBanner =
  | { kind: "trial_ending"; days: number }
  | { kind: "past_due"; days: number }
  | { kind: "read_only" };

export function subscriptionBanner(
  center: Pick<CenterClock, "status" | "trialEndsAt" | "pastDueSince" | "timeZone">,
  now: Date,
): SubscriptionBanner | null {
  if (center.status === "read_only") return { kind: "read_only" };
  if (center.status === "past_due") {
    const since = center.pastDueSince ?? now;
    return { kind: "past_due", days: daysUntil(readOnlyAt(since), now, center.timeZone) };
  }
  if (center.status === "trial" && center.trialEndsAt) {
    const days = daysUntil(center.trialEndsAt, now, center.timeZone);
    if (days <= 3) return { kind: "trial_ending", days };
  }
  return null;
}
