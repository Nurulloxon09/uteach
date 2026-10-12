import { formatMoney, isLocale } from "@uteach/i18n";

/** Formats minor units as they come from the database (number or string) for display (04-rules §2). */
export function formatMinor(
  minor: string | number | bigint,
  currency: string,
  locale: string,
): string {
  return formatMoney(BigInt(minor), currency, isLocale(locale) ? locale : "uz");
}

/**
 * Minor units (validated decimal string or bigint) → the JSON number an RPC argument needs. The generated
 * Supabase types declare `bigint` arguments as `number`; amounts below 2^53 are exact, larger ones throw.
 * The one sanctioned conversion (lint rule `uteach/no-float-money`).
 */
export function toDbAmount(minor: string | bigint): number {
  const value = BigInt(minor);
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`amount out of range: ${value}`);
  return n;
}
