/** Locales and formatters shared by the web app and the worker (04-rules §4). */
export const locales = ["uz", "ru", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "uz";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** BCP 47 tags used for Intl formatting. `uz` is Uzbek Latin. */
const intlTags: Record<Locale, string> = {
  uz: "uz-Latn-UZ",
  ru: "ru-RU",
  en: "en-US",
};

export function intlLocale(locale: Locale): string {
  return intlTags[locale];
}

/** Minor-unit digits per currency (UZS: 1 so'm = 100 tiyin). */
const minorDigits: Record<string, number> = { UZS: 2, KZT: 2, USD: 2, EUR: 2 };

/**
 * Formats a bigint amount of minor units without going through floating point.
 * Whole amounts are shown without decimals ("600 000 soʻm").
 */
export function formatMoney(amountMinor: bigint, currency: string, locale: Locale): string {
  const digits = minorDigits[currency] ?? 2;
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const scale = 10n ** BigInt(digits);
  const whole = abs / scale;
  const fraction = abs % scale;
  const decimal = `${negative ? "-" : ""}${whole}${fraction === 0n ? "" : "." + fraction.toString().padStart(digits, "0")}`;
  const format = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: fraction === 0n ? 0 : digits,
    maximumFractionDigits: digits,
  });
  // Intl accepts decimal strings exactly (no float conversion).
  return format.format(decimal as unknown as number);
}
