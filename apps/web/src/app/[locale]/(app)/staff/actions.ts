"use server";

import { PERMISSION_FLAGS } from "@uteach/db";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { phoneField, requiredText, uuidField } from "@/lib/validation";

async function inviteUrl(token: string): Promise<string> {
  const h = await headers();
  const base =
    process.env.SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return `${base.replace(/\/$/, "")}/${await getLocale()}/invite/${token}`;
}

export async function inviteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const schema = z.object({
    displayName: requiredText(),
    phone: phoneField(ctx.center.countryCode),
    role: z.enum(["admin", "teacher"], { error: "validation.invalid" }),
    branchIds: z.array(uuidField).min(1, { error: "validation.branchRequired" }),
    permissions: z.array(z.enum(PERMISSION_FLAGS)),
  });
  const parsed = schema.safeParse({
    displayName: str(form, "displayName"),
    phone: str(form, "phone"),
    role: str(form, "role"),
    branchIds: form.getAll("branchIds").map(String),
    permissions: form.getAll("permissions").map(String),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invite", {
    p_center_id: ctx.center.id,
    p_role: parsed.data.role,
    p_display_name: parsed.data.displayName,
    p_phone: parsed.data.phone,
    p_branch_ids: parsed.data.branchIds,
    p_permissions: parsed.data.role === "admin" ? parsed.data.permissions : [],
  });
  if (error || !token) return fail(dbErrorKey(error), form);

  revalidatePath("/[locale]/staff", "page");
  return { ok: true, data: { inviteUrl: await inviteUrl(token) } };
}

export async function regenerateInviteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "membershipId"));
  if (!id.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("regenerate_invite", {
    p_membership_id: id.data,
  });
  if (error || !token) return fail(dbErrorKey(error), form);
  return { ok: true, data: { inviteUrl: await inviteUrl(token) } };
}

export async function setMemberStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ membershipId: uuidField, status: z.enum(["active", "disabled"]) })
    .safeParse({ membershipId: str(form, "membershipId"), status: str(form, "status") });
  if (!parsed.success) return fail("validation.invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.membershipId)
    .neq("status", "invited")
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden");

  revalidatePath("/[locale]/staff", "page");
  return { ok: true };
}
