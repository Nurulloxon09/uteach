import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@uteach/db";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client with the secret (service-role) key. Allowed only where 01-tech-stack lists it: the auth SMS hook
 * (`/api/auth/sms-hook`, the per-phone OTP limit) and /admin (`lib/super-admin.ts`, only through the `admin_*`
 * functions, which check the super-admin again and audit). Never use it in staff code.
 */
export function createServiceClient(secretKey: string) {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
