"use server";

import { PERMISSION_FLAGS } from "@uteach/db";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { PALETTE } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";
import {
  optionalPhoneField,
  passwordField,
  phoneField,
  requiredText,
  uuidField,
} from "@/lib/validation";

const colorField = z.union([z.enum(PALETTE), z.literal("")]).transform((v) => v || null);

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
    color: colorField,
  });
  const parsed = schema.safeParse({
    displayName: str(form, "displayName"),
    phone: str(form, "phone"),
    role: str(form, "role"),
    branchIds: form.getAll("branchIds").map(String),
    permissions: form.getAll("permissions").map(String),
    color: str(form, "color"),
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
    ...(parsed.data.color ? { p_color: parsed.data.color } : {}),
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

/** Name, phone, branches, admin flags (owners only) and timetable color of a staff member. RLS decides who may. */
export async function updateMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      membershipId: uuidField,
      displayName: requiredText(),
      phone: optionalPhoneField(ctx.center.countryCode),
      branchIds: z.array(uuidField),
      permissions: z.array(z.enum(PERMISSION_FLAGS)),
      color: colorField,
    })
    .safeParse({
      membershipId: str(form, "membershipId"),
      displayName: str(form, "displayName"),
      phone: str(form, "phone"),
      branchIds: form.getAll("branchIds").map(String),
      permissions: form.getAll("permissions").map(String),
      color: str(form, "color"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("memberships")
    .select("role")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!member) return fail("db.not_found", form);
  if (member.role !== "owner" && parsed.data.branchIds.length === 0) {
    return { ok: false, fieldErrors: { branchIds: "validation.branchRequired" } };
  }

  const { data, error } = await supabase
    .from("memberships")
    .update({
      display_name: parsed.data.displayName,
      phone: parsed.data.phone,
      color: parsed.data.color,
      ...(member.role !== "owner" ? { branch_ids: parsed.data.branchIds } : {}),
      ...(member.role === "admin" && ctx.membership.role === "owner"
        ? { permissions: parsed.data.permissions }
        : {}),
    })
    .eq("id", parsed.data.membershipId)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);

  revalidatePath("/[locale]/staff", "layout");
  revalidatePath("/[locale]/schedule", "page");
  return { ok: true };
}

/** Owner sets a new password for a staff member who forgot theirs (no SMS, 10 "Auth" M7f). */
export async function setMemberPasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ membershipId: uuidField, password: passwordField })
    .safeParse({ membershipId: str(form, "membershipId"), password: form.get("password") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_password", {
    p_membership_id: parsed.data.membershipId,
    p_password: parsed.data.password,
  });
  if (error) return fail(dbErrorKey(error), form);
  return { ok: true };
}
