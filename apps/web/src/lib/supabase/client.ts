"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@uteach/db";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client in the browser, acting as the signed-in user (session cookies), so RLS and storage
 * policies apply. Used only where a file goes straight to Storage (10: import files, logos).
 */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
