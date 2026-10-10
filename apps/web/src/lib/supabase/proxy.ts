import { createServerClient } from "@supabase/ssr";
import type { Database } from "@uteach/db";
import type { NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

/** Refreshes the Supabase session cookies on `response` and returns whether a user is signed in. */
export async function refreshSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  return { signedIn: data.user !== null };
}
