import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { adminSecretKey } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SuperAdmin = CurrentUser & {
  /** The service-role client, or null when SUPABASE_SECRET_KEY isn't set (the layout says so). */
  db: ReturnType<typeof createServiceClient> | null;
};

/**
 * /admin (03: super-admin): the signed-in person must have `profiles.is_super_admin`; everyone else gets a 404,
 * so the page doesn't reveal itself. The flag is read with the person's own session (RLS: their own row).
 * The service-role client may call only the `admin_*` functions, each with `p_actor = id`: they check the flag
 * again and write the audit log as the super-admin.
 */
export const requireSuperAdmin = cache(async (): Promise<SuperAdmin> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  if (!data?.is_super_admin) notFound();
  const key = adminSecretKey();
  return { ...user, db: key ? createServiceClient(key) : null };
});

/** For Server Actions: the super-admin and a client that exists (an action can't run without the key). */
export async function superAdminDb() {
  const admin = await requireSuperAdmin();
  if (!admin.db) throw new Error("SUPABASE_SECRET_KEY is not set");
  return { actor: admin.id, db: admin.db };
}
