"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@uteach/db";
import { publicEnv, hasSupabaseConfig } from "@/lib/env";
import { createMockSupabaseClient } from "@/lib/supabase/mock";

/**
 * Supabase client in the browser, acting as the signed-in user (session cookies), so RLS and storage
 * policies apply. Used only where a file goes straight to Storage (10: import files, logos).
 */
export function createBrowserSupabase() {
  if (!hasSupabaseConfig) return createMockSupabaseClient();
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
