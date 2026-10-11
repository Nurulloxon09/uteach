import { isValidTimeZone, normalizePhone } from "@uteach/core";
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
