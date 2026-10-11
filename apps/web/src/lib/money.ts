import { formatMoney, isLocale } from "@uteach/i18n";

/** Formats minor units as they come from the database (number or string) for display (04-rules §2). */
export function formatMinor(
  minor: string | number | bigint,
  currency: string,
  locale: string,
): string {
  return formatMoney(BigInt(minor), currency, isLocale(locale) ? locale : "uz");
}
