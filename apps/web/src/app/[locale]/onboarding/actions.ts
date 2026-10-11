"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { setCurrentCenter } from "@/lib/current-center";
import { createClient } from "@/lib/supabase/server";
import { localeField, optionalText, requiredText, timezoneField } from "@/lib/validation";

const schema = z.object({
  name: requiredText(),
  locale: localeField,
  timezone: timezoneField,
  branchName: requiredText(),
  branchAddress: optionalText(),
});

export async function createCenterAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    name: str(form, "name"),
    locale: str(form, "locale"),
    timezone: str(form, "timezone"),
    branchName: str(form, "branchName"),
    branchAddress: str(form, "branchAddress"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data: centerId, error } = await supabase.rpc("create_center", {
    p_name: parsed.data.name,
    p_locale: parsed.data.locale,
    p_timezone: parsed.data.timezone,
    p_branch_name: parsed.data.branchName,
    p_branch_address: parsed.data.branchAddress ?? undefined,
  });
  if (error || !centerId) return fail(dbErrorKey(error), form);

  await setCurrentCenter(centerId);
  return redirect({ href: "/home", locale: await getLocale() });
}
