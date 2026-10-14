/**
 * Dashboard ratios (20, 30-milestones `PROPOSED (M7c plan)`). The database returns counts and sums; these turn
 * them into the shown numbers. Null means "nothing to measure yet" and is shown as "—".
 */

/** Attendance % = (present + late) ÷ (present + late + absent); excused marks are left out. 0–1 or null. */
export function attendanceRate(present: number, late: number, absent: number): number | null {
  const counted = present + late + absent;
  return counted === 0 ? null : (present + late) / counted;
}

/**
 * Collection rate = collected ÷ charged this month (minor units as strings or bigints, so large sums stay exact).
 * Can be above 1 when debts from earlier months are paid. Null when nothing is charged.
 */
export function collectionRate(
  collected: string | bigint | number,
  charged: string | bigint | number,
): number | null {
  const c = BigInt(charged);
  if (c === 0n) return null;
  // Basis points in integers, then one division: exact for any amount.
  return Number((BigInt(collected) * 10000n) / c) / 10000;
}

/** The change since an earlier count, e.g. active students now vs the end of last month. */
export function changeSince(now: number, before: number): number {
  return now - before;
}
