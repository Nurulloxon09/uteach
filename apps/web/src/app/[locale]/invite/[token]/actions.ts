"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { dbErrorKey, fail, str, type ActionState } from "@/lib/actions";
import { setCurrentCenter } from "@/lib/current-center";
import { createClient } from "@/lib/supabase/server";

export async function acceptInviteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = str(form, "token");
  if (!token) return fail("db.invite_invalid");

  const supabase = await createClient();
  const { data: centerId, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error || !centerId) return fail(dbErrorKey(error), form);

  await setCurrentCenter(centerId);
  return redirect({ href: "/", locale: await getLocale() });
}
