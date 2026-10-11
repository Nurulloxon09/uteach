"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import {
  localeField,
  optionalPhoneField,
  optionalText,
  requiredText,
  timezoneField,
  uuidField,
} from "@/lib/validation";

/** Treat "0 rows changed" as forbidden: RLS hid the row or blocked the write. */
function changed(rows: unknown[] | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

function refresh() {
  revalidatePath("/[locale]/settings", "layout");
  revalidatePath("/[locale]/home", "page");
}

// --- Center -----------------------------------------------------------------

export async function updateCenterAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({ name: requiredText(), defaultLocale: localeField, timezone: timezoneField })
    .safeParse({
      name: str(form, "name"),
      defaultLocale: str(form, "defaultLocale"),
      timezone: str(form, "timezone"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .update({
      name: parsed.data.name,
      default_locale: parsed.data.defaultLocale,
      timezone: parsed.data.timezone,
    })
    .eq("id", ctx.center.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!changed(data)) return fail("db.forbidden", form);

  revalidatePath("/[locale]", "layout");
  return { ok: true };
}

// --- Branches ----------------------------------------------------------------

const branchSchema = z.object({
  name: requiredText(),
  address: optionalText(),
  timezone: timezoneField,
});

export async function createBranchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = branchSchema
    .extend({ phone: optionalPhoneField(ctx.center.countryCode) })
    .safeParse({
      name: str(form, "name"),
      address: str(form, "address"),
      timezone: str(form, "timezone"),
      phone: str(form, "phone"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    center_id: ctx.center.id,
    name: parsed.data.name,
    address: parsed.data.address,
    phone: parsed.data.phone,
    timezone: parsed.data.timezone,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}

export async function updateBranchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = branchSchema
    .extend({ id: uuidField, phone: optionalPhoneField(ctx.center.countryCode) })
    .safeParse({
      id: str(form, "id"),
      name: str(form, "name"),
      address: str(form, "address"),
      timezone: str(form, "timezone"),
      phone: str(form, "phone"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .update({
      name: parsed.data.name,
      address: parsed.data.address,
      phone: parsed.data.phone,
      timezone: parsed.data.timezone,
    })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!changed(data)) return fail("db.forbidden", form);

  refresh();
  return { ok: true };
}

/** Archive or restore a branch or room (`table` is fixed by the caller's form, not user input). */
async function setArchived(table: "branches" | "rooms", form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, archived: z.enum(["true", "false"]) })
    .safeParse({ id: str(form, "id"), archived: str(form, "archived") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .update({ archived_at: parsed.data.archived === "true" ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!changed(data)) return fail("db.forbidden", form);

  refresh();
  return { ok: true };
}

export async function archiveBranchAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return setArchived("branches", form);
}

// --- Rooms -------------------------------------------------------------------

const capacityField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      ctx.addIssue({ code: "custom", message: "validation.capacity" });
      return z.NEVER;
    }
    return n;
  });

export async function createRoomAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({ branchId: uuidField, name: requiredText(), capacity: capacityField })
    .safeParse({
      branchId: str(form, "branchId"),
      name: str(form, "name"),
      capacity: str(form, "capacity"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.from("rooms").insert({
    center_id: ctx.center.id,
    branch_id: parsed.data.branchId,
    name: parsed.data.name,
    capacity: parsed.data.capacity,
  });
  if (error) return fail(dbErrorKey(error), form);

  refresh();
  return { ok: true };
}

export async function updateRoomAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuidField, name: requiredText(), capacity: capacityField })
    .safeParse({ id: str(form, "id"), name: str(form, "name"), capacity: str(form, "capacity") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .update({ name: parsed.data.name, capacity: parsed.data.capacity })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!changed(data)) return fail("db.forbidden", form);

  refresh();
  return { ok: true };
}

export async function archiveRoomAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return setArchived("rooms", form);
}
