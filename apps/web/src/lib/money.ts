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

/**
 * Minor units → a spreadsheet cell in major units (Excel exports). Whole amounts become numbers so Excel can
 * sum them; an amount with a fraction stays a decimal string rather than becoming a float. Display only.
 */
export function toSheetAmount(minor: string | bigint, minorDigits = 2): number | string {
  const value = BigInt(minor);
  const unit = 10n ** BigInt(minorDigits);
  if (value % unit === 0n) return toDbAmount(value / unit);
  const abs = value < 0n ? -value : value;
  const fraction = String(abs % unit)
    .padStart(minorDigits, "0")
    .replace(/0+$/, "");
  return `${value < 0n ? "-" : ""}${abs / unit}.${fraction}`;
}
