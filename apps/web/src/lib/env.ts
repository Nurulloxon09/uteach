import { z } from "zod";

/** Public env vars (inlined into the browser bundle by Next). */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Country used to read phone numbers typed without a country code. */
  NEXT_PUBLIC_DEFAULT_COUNTRY: z.string().length(2).default("UZ"),
  /** Pre-selected time zone when creating a center. */
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z.string().min(1).default("Asia/Tashkent"),
  /** The Telegram bot parents use (17), e.g. uteach_bot; unset = the Telegram settings say it isn't set up. */
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{3,31}$/)
    .optional(),
  /** uteach's own Telegram username for the landing page contact (M7e); unset = the contact block is hidden. */
  NEXT_PUBLIC_CONTACT_TELEGRAM: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{3,31}$/)
    .optional(),
  /** "true" lets search engines index the public pages (production only, M7d); anything else blocks them. */
  NEXT_PUBLIC_SITE_INDEXABLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_DEFAULT_COUNTRY: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY || undefined,
  NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || undefined,
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || undefined,
  NEXT_PUBLIC_CONTACT_TELEGRAM: process.env.NEXT_PUBLIC_CONTACT_TELEGRAM || undefined,
  NEXT_PUBLIC_SITE_INDEXABLE: process.env.NEXT_PUBLIC_SITE_INDEXABLE || undefined,
});

/** Server-only env vars. Read lazily so the browser bundle never touches them. */
export function serverEnv() {
  return z
    .object({
      SEND_SMS_HOOK_SECRET: z.string().startsWith("v1,whsec_"),
      SMS_PROVIDER: z.enum(["console", "eskiz"]).default("console"),
      /** The secret (service-role) key, used only by the SMS hook's per-phone limit; required with Eskiz. */
      SUPABASE_SECRET_KEY: z.string().min(1).optional(),
      ESKIZ_EMAIL: z.string().optional(),
      ESKIZ_PASSWORD: z.string().optional(),
      ESKIZ_FROM: z.string().optional(),
    })
    .refine((env) => env.SMS_PROVIDER !== "eskiz" || env.SUPABASE_SECRET_KEY, {
      message: "SMS_PROVIDER=eskiz needs SUPABASE_SECRET_KEY (per-phone OTP limit)",
    })
    .parse({
      SEND_SMS_HOOK_SECRET: process.env.SEND_SMS_HOOK_SECRET,
      SMS_PROVIDER: process.env.SMS_PROVIDER || undefined,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
      ESKIZ_EMAIL: process.env.ESKIZ_EMAIL || undefined,
      ESKIZ_PASSWORD: process.env.ESKIZ_PASSWORD || undefined,
      ESKIZ_FROM: process.env.ESKIZ_FROM || undefined,
    });
}

/**
 * The public teacher demo's sign-in (10, "Teacher demo"; `pnpm demo:seed` prints both values). Null when either is
 * missing: the /demo page and its link on the login page are then hidden.
 */
export function demoTeacherLogin(): { phone: string; password: string } | null {
  const phone = process.env.DEMO_TEACHER_PHONE;
  const password = process.env.DEMO_TEACHER_PASSWORD;
  return phone && password ? { phone, password } : null;
}

/**
 * The secret (service-role) key for /admin (01: super-admin pages are on the service-role allow-list). Read on its
 * own so /admin doesn't need the SMS hook's settings. Null when it isn't set: /admin then says so.
 */
export function adminSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || null;
}
