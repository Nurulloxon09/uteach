import { z } from "zod";

/** Public env vars (inlined into the browser bundle by Next). */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Country used to read phone numbers typed without a country code. */
  NEXT_PUBLIC_DEFAULT_COUNTRY: z.string().length(2).default("UZ"),
  /** Pre-selected time zone when creating a center. */
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z.string().min(1).default("Asia/Tashkent"),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_DEFAULT_COUNTRY: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY || undefined,
  NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || undefined,
});

/** Server-only env vars. Read lazily so the browser bundle never touches them. */
export function serverEnv() {
  return z
    .object({
      SEND_SMS_HOOK_SECRET: z.string().startsWith("v1,whsec_"),
      SMS_PROVIDER: z.string().default("console"),
    })
    .parse({
      SEND_SMS_HOOK_SECRET: process.env.SEND_SMS_HOOK_SECRET,
      SMS_PROVIDER: process.env.SMS_PROVIDER || undefined,
    });
}
