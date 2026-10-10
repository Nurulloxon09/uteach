import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@uteach/db";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client acting as the signed-in user, so RLS applies (01-tech-stack: staff code
 * never uses the service role).
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only. The proxy refreshes
            // the session on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
