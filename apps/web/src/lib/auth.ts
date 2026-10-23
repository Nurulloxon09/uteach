import "server-only";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { isDemoAccount } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  phone: string;
  fullName: string;
  locale: string;
  /** The public teacher demo's account (10): shown as "Demo" in the top bar. */
  isDemo: boolean;
};

/** The signed-in user's profile, or null. Verified with the auth server on each request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone, full_name, locale")
    .eq("id", data.user.id)
    .single();
  if (!profile) return null;

  return {
    id: profile.id,
    phone: profile.phone,
    fullName: profile.full_name,
    locale: profile.locale,
    isDemo: isDemoAccount(data.user),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    return redirect({ href: "/login", locale });
  }
  return user;
}
