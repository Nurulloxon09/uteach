"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { dateField, requiredText, uuidField } from "@/lib/validation";

function refresh() {
  revalidatePath("/[locale]/settings/holidays", "page");
  revalidatePath("/[locale]/schedule", "page");
  revalidatePath("/[locale]/groups", "layout");
}

/**
 * Adds a holiday; lessons already generated that day are cancelled (13), and students are told only when
 * the admin ticks "notify". Returns how many lessons were cancelled.
 */
export async function addHolidayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      date: dateField,
      name: requiredText(),
      branchId: z.union([uuidField, z.literal("")]).transform((v) => v || null),
      notify: z.boolean(),
    })
    .safeParse({
      date: str(form, "date"),
      name: str(form, "name"),
      branchId: str(form, "branchId"),
      notify: form.get("notify") === "on",
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_holiday", {
    p_center_id: ctx.center.id,
    p_date: parsed.data.date,
    p_name: parsed.data.name,
    p_notify: parsed.data.notify,
    ...(parsed.data.branchId ? { p_branch_id: parsed.data.branchId } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true, data: { cancelled: String(data ?? 0) } };
}

export async function removeHolidayAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = uuidField.safeParse(str(form, "id"));
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_holiday", { p_holiday_id: parsed.data });
  if (error) return fail(dbErrorKey(error));

  refresh();
  return { ok: true };
}
