import { IntlMessageFormat } from "intl-messageformat";
import { formatMoney, intlLocale, type Locale } from "./index";

/**
 * Renders an outbox template (docs/spec/17-telegram-notifications.md): an ICU message from
 * `notification_templates` filled from the row's payload. Payload amounts are minor units (strings) and dates
 * are ISO days, as the database queues them; they are formatted here for the recipient's language.
 */

/** Payload keys holding amounts in minor units (with `currency`). */
const MONEY_KEYS = new Set(["amount", "balance", "debt"]);
/** Payload keys holding calendar days ("YYYY-MM-DD"). */
const DATE_KEYS = new Set(["date", "oldDate", "dueDate", "startDate", "oldestDueDate"]);

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINOR_UNITS = /^-?\d+$/;

export type RenderOptions = {
  locale: Locale;
  /** The center's currency, for money keys. */
  currency: string;
  /** Today in the center's timezone ("YYYY-MM-DD"): dates in the same year are shown without it. */
  today?: string;
};

function formatDay(value: string, locale: Locale, today: string | undefined): string {
  const m = ISO_DAY.exec(value);
  if (!m) return value;
  const sameYear = today !== undefined && today.slice(0, 4) === m[1];
  // A calendar day, not an instant: format it as UTC so no timezone shifts it.
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

/** Payload → ICU values: money and dates formatted, a broadcast's text in the recipient's language. */
export function templateValues(
  payload: Record<string, unknown>,
  options: RenderOptions,
): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(payload)) {
    if (typeof raw === "number") {
      values[key] = raw;
    } else if (typeof raw === "string") {
      if (MONEY_KEYS.has(key) && MINOR_UNITS.test(raw)) {
        values[key] = formatMoney(BigInt(raw), options.currency, options.locale);
      } else if (DATE_KEYS.has(key)) {
        values[key] = formatDay(raw, options.locale, options.today);
      } else {
        values[key] = raw;
      }
    } else if (typeof raw === "boolean") {
      values[key] = String(raw);
    }
  }
  const bodies = payload.bodies;
  if (bodies && typeof bodies === "object") {
    const own = (bodies as Record<string, unknown>)[options.locale];
    if (typeof own === "string" && own.trim()) values.body = own;
  }
  return values;
}

/** The message text. Throws if the template is not valid ICU or uses a value the payload lacks. */
export function renderTemplate(
  body: string,
  payload: Record<string, unknown>,
  options: RenderOptions,
): string {
  const message = new IntlMessageFormat(body, intlLocale(options.locale), undefined, {
    ignoreTag: true,
  });
  const text = message.format(templateValues(payload, options));
  if (typeof text !== "string") throw new Error("template rendered to a non-string value");
  return text;
}
