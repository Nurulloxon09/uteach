import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@uteach/db";
import { cookies, headers } from "next/headers";
import { publicEnv, hasSupabaseConfig } from "@/lib/env";
import { createMockSupabaseClient } from "@/lib/supabase/mock";

/**
 * Supabase client acting as the signed-in user, so RLS applies (01-tech-stack: staff code
 * never uses the service role).
 */
export async function createClient() {
  const cookieStore = await cookies();
  if (!hasSupabaseConfig) {
    const hdrs = await headers();
    const isHttps =
      hdrs.get("x-forwarded-proto") === "https" ||
      (hdrs.get("origin")?.startsWith("https://") ?? false);
    return createMockSupabaseClient({
      get: (name) => cookieStore.get(name)?.value,
      set: (name, value, options) => {
        try {
          cookieStore.set(name, value, {
            ...options,
            ...(isHttps ? { sameSite: "none" as const, secure: true } : {}),
          });
        } catch {
          // Server Components cannot mutate cookies; Server Actions can.
        }
      },
      remove: (name) => {
        try {
          cookieStore.delete(name);
        } catch {
          // Server Components cannot mutate cookies; Server Actions can.
        }
      },
    });
  }
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
