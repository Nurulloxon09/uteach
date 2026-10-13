import { defaultLocale, intlLocale, isLocale, type Locale } from "@uteach/i18n";
import en from "@uteach/i18n/messages/en.json";
import ru from "@uteach/i18n/messages/ru.json";
import uz from "@uteach/i18n/messages/uz.json";
import { IntlMessageFormat } from "intl-messageformat";

/**
 * Bot texts come from the same catalogs as the web app (`bot.*`, `billing.receipt.*`), checked by
 * `pnpm check:i18n`, and are formatted with the same ICU engine.
 */
const catalogs: Record<Locale, unknown> = { en, ru, uz };

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

/** A Telegram `language_code` ("ru", "uz", "en-US", …) → our locale, else uz. */
export function localeFromTelegram(code: string | undefined): Locale {
  return toLocale(code?.slice(0, 2).toLowerCase());
}

function lookup(locale: Locale, key: string): string {
  let node: unknown = catalogs[locale];
  for (const part of key.split(".")) {
    node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node !== "string") throw new Error(`missing message ${locale}:${key}`);
  return node;
}

const cache = new Map<string, IntlMessageFormat>();

export function translator(locale: Locale): Translate {
  return (key, values) => {
    const id = `${locale}:${key}`;
    let message = cache.get(id);
    if (!message) {
      message = new IntlMessageFormat(lookup(locale, key), intlLocale(locale), undefined, {
        ignoreTag: true,
      });
      cache.set(id, message);
    }
    return String(message.format(values));
  };
}

/** "YYYY-MM-DD" today in a timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "YYYY-MM-DD" ± days (calendar arithmetic, no timezone). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A calendar day for people: "Mon, 14 Oct" in the locale. */
export function formatDay(day: string, locale: Locale): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "HH:MM" of an instant in a timezone. */
export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(instant));
}
