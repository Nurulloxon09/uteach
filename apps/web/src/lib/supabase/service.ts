import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@uteach/db";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client with the secret (service-role) key. Allowed only where 01-tech-stack lists it; today that is
 * the auth SMS hook (`/api/auth/sms-hook`), for the per-phone OTP limit. Never use it in staff code.
 */
export function createServiceClient(secretKey: string) {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
