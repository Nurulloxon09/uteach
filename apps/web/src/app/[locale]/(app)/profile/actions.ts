"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeField, phoneField, requiredText } from "@/lib/validation";

/** My profile (M7g): your own name, contact phone and language. The login can't change here. */
export async function updateProfileAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ fullName: requiredText(), phone: phoneField(), locale: localeField })
    .safeParse({
      fullName: str(form, "fullName"),
      phone: str(form, "phone"),
      locale: str(form, "locale"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      locale: parsed.data.locale,
    })
    .eq("id", user.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  revalidatePath("/[locale]", "layout");
  return { ok: true };
}
