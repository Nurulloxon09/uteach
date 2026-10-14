import { describe, expect, it } from "vitest";
import fixtures from "./subscription.fixtures.json";
import {
  centerStatusNext,
  daysUntil,
  hasStudentRoom,
  subscriptionBanner,
  type CenterStatus,
} from "./subscription";

export type SubscriptionFixture = {
  name: string;
  status: CenterStatus;
  trialEndsAt?: string;
  paidUntil?: string;
  pastDueSince?: string;
  now: string;
  expect: CenterStatus;
  since: string | null;
};

const date = (s: string | undefined) => (s ? new Date(s) : null);

describe("centerStatusNext", () => {
  for (const f of fixtures as SubscriptionFixture[]) {
    it(f.name, () => {
      const next = centerStatusNext(
        {
          status: f.status,
          trialEndsAt: date(f.trialEndsAt),
          paidUntil: f.paidUntil ?? null,
          pastDueSince: date(f.pastDueSince),
          timeZone: "Asia/Tashkent",
        },
        new Date(f.now),
      );
      expect(next.status).toBe(f.expect);
      expect(next.pastDueSince?.toISOString() ?? null).toBe(
        f.since ? new Date(f.since).toISOString() : null,
      );
    });
  }
});

describe("banner and limits", () => {
  // 17:00 in Tashkent.
  const now = new Date("2026-11-01T12:00:00Z");
  const at = (h: number) => new Date(now.getTime() + h * 3_600_000);
  const tz = "Asia/Tashkent";

  it("shows the last three trial days only", () => {
    expect(
      subscriptionBanner(
        { status: "trial", trialEndsAt: at(24 * 5), pastDueSince: null, timeZone: tz },
        now,
      ),
    ).toBeNull();
    expect(
      subscriptionBanner(
        { status: "trial", trialEndsAt: at(24 * 3), pastDueSince: null, timeZone: tz },
        now,
      ),
    ).toEqual({ kind: "trial_ending", days: 3 });
    expect(
      subscriptionBanner(
        { status: "trial", trialEndsAt: at(1), pastDueSince: null, timeZone: tz },
        now,
      ),
    ).toEqual({
      kind: "trial_ending",
      days: 0,
    });
  });

  it("counts the grace days left, then read-only", () => {
    expect(
      subscriptionBanner(
        { status: "past_due", trialEndsAt: null, pastDueSince: at(-24), timeZone: tz },
        now,
      ),
    ).toEqual({
      kind: "past_due",
      days: 6,
    });
    expect(
      subscriptionBanner(
        { status: "read_only", trialEndsAt: null, pastDueSince: null, timeZone: tz },
        now,
      ),
    ).toEqual({
      kind: "read_only",
    });
    expect(
      subscriptionBanner(
        { status: "active", trialEndsAt: null, pastDueSince: null, timeZone: tz },
        now,
      ),
    ).toBeNull();
  });

  it("days and room", () => {
    expect(daysUntil(at(-1), now, tz)).toBe(0);
    expect(daysUntil(at(1), now, tz)).toBe(0); // 18:00 the same day
    expect(daysUntil(at(8), now, tz)).toBe(1); // 01:00 the next day
    expect(daysUntil(at(24 * 2 + 1), now, tz)).toBe(2);
    expect(hasStudentRoom(49, 50)).toBe(true);
    expect(hasStudentRoom(50, 50)).toBe(false);
    expect(hasStudentRoom(5000, null)).toBe(true);
  });
});
