import { asDbErrorCode } from "@uteach/db";
import type { z } from "zod";

/**
 * Result of every Server Action (04-rules §9). `error` and `fieldErrors` values are i18n keys
 * under the `errors` namespace, translated by the form.
 */
export type ActionState =
  | { ok: true; message?: string; data?: Record<string, string> }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Record<string, string>;
      /** What the user typed, so the form can refill itself (React resets forms after an action). */
      values?: Record<string, string>;
    }
  | null;

const SECRET_FIELDS = new Set(["password", "confirm", "code"]);

/** The submitted text fields, minus secrets, for refilling a form after an error. */
export function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !SECRET_FIELDS.has(key) && !key.startsWith("$"))
      values[key] = value;
  }
  return values;
}

export function fail(error: string, form?: FormData): ActionState {
  return { ok: false, error, values: form ? formValues(form) : undefined };
}

/** zod issues → { field: "errors.<key>" }. Schemas use i18n keys as their error messages. */
export function fieldErrorsFrom(error: z.ZodError, form?: FormData): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= issue.message.startsWith("validation.")
      ? issue.message
      : "validation.invalid";
  }
  return { ok: false, fieldErrors, values: form ? formValues(form) : undefined };
}

/** Maps a Postgres/PostgREST error to an i18n key. */
export function dbErrorKey(error: { code?: string; message?: string } | null): string {
  const code = asDbErrorCode(error?.message);
  if (code) return `db.${code}`;
  if (error?.code === "42501") return "db.forbidden";
  if (error?.code === "23505") return "db.duplicate";
  if (error?.code === "23514") return "validation.invalid";
  return "generic";
}

/** Read a FormData field as a trimmed string. */
export function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
