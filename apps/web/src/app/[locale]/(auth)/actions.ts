"use server";

import { getLocale } from "next-intl/server";
import { redirect as nextRedirect } from "next/navigation";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { fieldErrorsFrom, fail, formValues, str, type ActionState } from "@/lib/actions";
import { clearCurrentCenter } from "@/lib/current-center";
import { safeNextPath, splitLocale } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import { loginEmail } from "@uteach/core";
import { serviceSecretKey } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { passwordField, phoneField, requiredText, usernameField } from "@/lib/validation";

/** Supabase Auth error codes → i18n keys under errors.auth.* */
function authErrorKey(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "auth.invalidCredentials";
    case "weak_password":
      return "validation.passwordWeak";
    case "over_request_rate_limit":
      return "auth.rateLimited";
    default:
      return "generic";
  }
}

async function goTo(href: string): Promise<never> {
  // `next` values already carry their locale prefix; plain routes get the current one.
  if (splitLocale(href, routing.locales).locale) return nextRedirect(href);
  return redirect({ href, locale: await getLocale() });
}

// ---------------------------------------------------------------------------

const signUpSchema = z.object({
  fullName: requiredText(),
  username: usernameField,
  phone: phoneField(),
  password: passwordField,
});

/**
 * Creates the account on the server (public Auth sign-ups are off, 10 "Auth" M7f): the login becomes the hidden
 * Auth email, confirmed at once, then the person is signed in. The phone is contact information only.
 */
export async function signUpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: str(form, "fullName"),
    username: str(form, "username"),
    phone: str(form, "phone"),
    password: form.get("password"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const { fullName, username, phone, password } = parsed.data;

  const secretKey = serviceSecretKey();
  if (!secretKey) return fail("generic", form);
  const locale = await getLocale();
  const email = loginEmail(username);
  const { error: createError } = await createServiceClient(secretKey).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, locale },
  });
  if (createError) {
    if (createError.code === "email_exists" || createError.code === "user_already_exists")
      return {
        ok: false,
        fieldErrors: { username: "auth.usernameTaken" },
        values: formValues(form),
      };
    return fail(authErrorKey(createError.code), form);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(authErrorKey(error.code), form);
  return goTo(safeNextPath(str(form, "next")) ?? "/");
}

const loginSchema = z.object({
  username: z.string().trim().min(1, { error: "validation.required" }),
  password: z.string().min(1, { error: "validation.required" }),
});

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: str(form, "username"),
    password: form.get("password"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const next = safeNextPath(str(form, "next"));

  // Any typo gets the same answer as a wrong password, so the form can't be used to probe logins.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: loginEmail(parsed.data.username.toLowerCase()),
    password: parsed.data.password,
  });
  if (error) return fail(authErrorKey(error.code), form);

  return goTo(next ?? "/");
}

const resetSchema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    error: "validation.passwordMismatch",
  });

export async function resetPasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("db.not_authenticated");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(authErrorKey(error.code), form);
  return goTo("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearCurrentCenter();
  await goTo("/login");
}
