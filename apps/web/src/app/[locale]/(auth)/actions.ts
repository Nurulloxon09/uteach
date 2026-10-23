"use server";

import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect as nextRedirect } from "next/navigation";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { fieldErrorsFrom, fail, str, type ActionState } from "@/lib/actions";
import { clearCurrentCenter } from "@/lib/current-center";
import { isDemoAccount } from "@/lib/demo";
import { demoTeacherLogin } from "@/lib/env";
import { safeNextPath, splitLocale } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import { otpField, passwordField, phoneField, requiredText } from "@/lib/validation";

/** Remembers which phone is waiting for an SMS code, so the phone never goes into a URL. */
const PENDING_COOKIE = "uteach_otp";
const pendingSchema = z.object({
  phone: z.string(),
  purpose: z.enum(["signup", "reset"]),
  next: z.string().nullable(),
});
type Pending = z.infer<typeof pendingSchema>;

async function setPending(pending: Pending) {
  const store = await cookies();
  store.set(PENDING_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
}

export async function readPending(): Promise<Pending | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    return pendingSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function clearPending() {
  (await cookies()).delete(PENDING_COOKIE);
}

/** Supabase Auth error codes → i18n keys under errors.auth.* */
function authErrorKey(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "auth.invalidCredentials";
    case "user_already_exists":
    case "phone_exists":
      return "auth.phoneTaken";
    case "weak_password":
      return "validation.passwordWeak";
    case "otp_expired":
      return "auth.otpInvalid";
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return "auth.rateLimited";
    case "sms_send_failed":
      return "auth.smsFailed";
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
  phone: phoneField(),
  password: passwordField,
});

export async function signUpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: str(form, "fullName"),
    phone: str(form, "phone"),
    password: form.get("password"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const locale = await getLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    phone: parsed.data.phone,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName, locale } },
  });
  if (error) return fail(authErrorKey(error.code), form);

  await setPending({
    phone: parsed.data.phone,
    purpose: "signup",
    next: safeNextPath(str(form, "next")),
  });
  return goTo("/verify");
}

const verifySchema = z.object({ code: otpField });

export async function verifyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const pending = await readPending();
  if (!pending) return fail("auth.otpSessionExpired");

  const parsed = verifySchema.safeParse({ code: str(form, "code") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: pending.phone,
    token: parsed.data.code,
    type: "sms",
  });
  if (error)
    return fail(error.code === "otp_expired" ? "auth.otpInvalid" : authErrorKey(error.code));

  await clearPending();
  if (pending.purpose === "reset") return goTo("/reset-password");
  return goTo(pending.next ?? "/");
}

export async function resendCodeAction(_prev: ActionState): Promise<ActionState> {
  const pending = await readPending();
  if (!pending) return fail("auth.otpSessionExpired");

  const supabase = await createClient();
  const { error } =
    pending.purpose === "signup"
      ? await supabase.auth.resend({ type: "sms", phone: pending.phone })
      : await supabase.auth.signInWithOtp({
          phone: pending.phone,
          options: { shouldCreateUser: false },
        });
  if (error && pending.purpose === "signup") return fail(authErrorKey(error.code));
  return { ok: true, message: "codeResent" };
}

const loginSchema = z.object({
  phone: phoneField(),
  password: z.string().min(1, { error: "validation.required" }),
});

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    phone: str(form, "phone"),
    password: form.get("password"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const next = safeNextPath(str(form, "next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error?.code === "phone_not_confirmed") {
    // Signed up but never entered the code: send a new one and finish verification.
    await supabase.auth.resend({ type: "sms", phone: parsed.data.phone });
    await setPending({ phone: parsed.data.phone, purpose: "signup", next });
    return goTo("/verify");
  }
  if (error) return fail(authErrorKey(error.code), form);

  return goTo(next ?? "/");
}

/** The public teacher demo (10, "Teacher demo"): signs in as the demo teacher and opens their Today page. */
export async function demoLoginAction(_prev: ActionState): Promise<ActionState> {
  const login = demoTeacherLogin();
  if (!login) return fail("generic");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(login);
  if (error) return fail(authErrorKey(error.code));
  return goTo("/today");
}

const forgotSchema = z.object({ phone: phoneField() });

export async function forgotPasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = forgotSchema.safeParse({ phone: str(form, "phone") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: parsed.data.phone,
    options: { shouldCreateUser: false },
  });
  // Unknown numbers get the same answer as known ones, so the form can't be used to probe accounts.
  if (error && authErrorKey(error.code) === "auth.rateLimited")
    return fail("auth.rateLimited", form);

  await setPending({ phone: parsed.data.phone, purpose: "reset", next: null });
  return goTo("/verify");
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
  if (!data.user) return fail("auth.otpSessionExpired");
  // Everyone shares the demo account; a new password would lock the next visitor out.
  if (isDemoAccount(data.user)) return fail("auth.demoLocked");

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
