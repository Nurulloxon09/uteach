import { isValidTimeZone, normalizePhone, parseMajorUnits } from "@uteach/core";
import { locales } from "@uteach/i18n";
import { z } from "zod";
import { publicEnv } from "@/lib/env";

/** Field schemas shared by forms and Server Actions. Error messages are i18n keys. */

export const requiredText = (max = 120) =>
  z
    .string()
    .trim()
    .min(1, { error: "validation.required" })
    .max(max, { error: "validation.tooLong" });

export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, { error: "validation.tooLong" })
    .transform((v) => (v === "" ? null : v));

export const phoneField = (defaultCountry = publicEnv.NEXT_PUBLIC_DEFAULT_COUNTRY) =>
  z
    .string()
    .trim()
    .min(1, { error: "validation.required" })
    .transform((value, ctx) => {
      const phone = normalizePhone(value, defaultCountry);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "validation.phone" });
        return z.NEVER;
      }
      return phone;
    });

export const optionalPhoneField = (defaultCountry = publicEnv.NEXT_PUBLIC_DEFAULT_COUNTRY) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const phone = normalizePhone(value, defaultCountry);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "validation.phone" });
        return z.NEVER;
      }
      return phone;
    });

export const passwordField = z
  .string()
  .min(8, { error: "validation.passwordShort" })
  .max(72, { error: "validation.tooLong" })
  .regex(/[a-zA-Z]/, { error: "validation.passwordWeak" })
  .regex(/[0-9]/, { error: "validation.passwordWeak" });

export const otpField = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "validation.otp" });

export const timezoneField = z
  .string()
  .refine((tz) => isValidTimeZone(tz), { error: "validation.timezone" });

export const localeField = z.enum(locales, { error: "validation.invalid" });

export const uuidField = z.uuid({ error: "validation.invalid" });

/** An amount typed in major units ("600 000") → minor units as a decimal string (04-rules §2). */
export const moneyField = z
  .string()
  .trim()
  .min(1, { error: "validation.required" })
  .transform((value, ctx) => {
    try {
      const minor = parseMajorUnits(value);
      if (minor < 0n) throw new RangeError("negative");
      return minor.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "validation.amount" });
      return z.NEVER;
    }
  });

export const optionalMoneyField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    try {
      const minor = parseMajorUnits(value);
      if (minor < 0n) throw new RangeError("negative");
      return minor.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "validation.amount" });
      return z.NEVER;
    }
  });

/** Minor units → what a money input shows ("600000" for 60 000 000 tiyin, "1250.5" keeps decimals). */
export function minorToInput(minor: string | number | bigint | null | undefined): string {
  if (minor === null || minor === undefined || minor === "") return "";
  const value = BigInt(minor);
  const whole = value / 100n;
  const cents = value % 100n;
  return cents === 0n
    ? whole.toString()
    : `${whole}.${cents.toString().padStart(2, "0").replace(/0$/, "")}`;
}

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "validation.date" });

export const optionalDateField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "validation.date" });
      return z.NEVER;
    }
    return value;
  });

export const timeField = z.string().regex(/^\d{2}:\d{2}$/, { error: "validation.time" });

export const intField = (min: number, max: number) =>
  z.coerce
    .number({ error: "validation.number" })
    .int({ error: "validation.number" })
    .min(min, { error: "validation.number" })
    .max(max, { error: "validation.number" });

export const optionalIntField = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: "validation.number" });
        return z.NEVER;
      }
      return n;
    });

/** A percentage typed by staff ("10", "12.5") → basis points (1250), without floats (02: `*_bp`). */
export const optionalPercentField = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return 0;
    const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value);
    const bp = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
    if (!match || bp > 10000) {
      ctx.addIssue({ code: "custom", message: "validation.percent" });
      return z.NEVER;
    }
    return bp;
  });
