import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Same pattern as the database check constraint on every phone column. */
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

/**
 * Normalise user input ("90 123 45 67", "+998 90 123-45-67", "998901234567") to E.164.
 * `defaultCountry` comes from the center's country. Returns null when the number is not valid.
 */
export function normalizePhone(input: string, defaultCountry: string = "UZ"): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  // People often type the country code without "+": treat a long all-digit string as international.
  const candidate = !trimmed.startsWith("+") && digitsOnly.length > 10 ? `+${digitsOnly}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}
