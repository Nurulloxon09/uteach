"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { requiredText, uuidField } from "@/lib/validation";

function refresh() {
  revalidatePath("/[locale]/settings/lost-reasons", "page");
  revalidatePath("/[locale]/leads", "layout");
}

/** A new reason goes to the end of the list. */
export async function addLostReasonAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z.object({ label: requiredText(80) }).safeParse({ label: str(form, "label") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lost_reasons")
    .select("sort_order")
    .eq("center_id", ctx.center.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("lost_reasons").insert({
    center_id: ctx.center.id,
    label: parsed.data.label,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true };
}

/** Renames a reason (a seeded one then shows the typed label instead of the translation). */
export async function renameLostReasonAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, label: requiredText(80) })
    .safeParse({ id: str(form, "id"), label: str(form, "label") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lost_reasons")
    .update({ label: parsed.data.label })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);
  refresh();
  return { ok: true };
}

/** Archive (no longer offered; old leads keep it) or restore. */
export async function archiveLostReasonAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "id"));
  if (!id.success) return fail("generic");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lost_reasons")
    .update({ archived_at: form.get("restore") === "1" ? null : new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");
  refresh();
  return { ok: true };
}

/** Swaps a reason with its neighbour above or below. */
export async function moveLostReasonAction(
  id: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const ctx = await getCenterContext();
  if (!uuidField.safeParse(id).success) return fail("generic");
  const supabase = await createClient();
  const { data } = await supabase
    .from("lost_reasons")
    .select("id, sort_order")
    .eq("center_id", ctx.center.id)
    .order("sort_order")
    .order("created_at");
  const rows = data ?? [];
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
  // Renumber the whole list so equal sort orders can't get stuck.
  const order = rows.map((r) => r.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  for (const [index, rowId] of order.entries()) {
    const { error } = await supabase
      .from("lost_reasons")
      .update({ sort_order: index + 1 })
      .eq("id", rowId);
    if (error) return fail(dbErrorKey(error));
  }
  refresh();
  return { ok: true };
}
