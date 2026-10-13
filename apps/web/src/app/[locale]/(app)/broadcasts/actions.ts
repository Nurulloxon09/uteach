"use server";

import { toInstant } from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import type { Json } from "@uteach/db";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";

/** The audience as the composer sends it (17); every empty list means "all" (within the user's branches). */
const audienceSchema = z.object({
  branchIds: z.array(uuidField).max(200).default([]),
  groupIds: z.array(uuidField).max(500).default([]),
  courseIds: z.array(uuidField).max(200).default([]),
  studentIds: z.array(uuidField).max(5000).default([]),
  debtors: z.boolean().default(false),
  recipients: z.enum(["guardians", "students", "both"]).default("guardians"),
});
export type AudienceInput = z.input<typeof audienceSchema>;

/** The database's audience shape (`broadcasts.audience`). */
function toDb(a: z.output<typeof audienceSchema>): Json {
  return {
    branch_ids: a.branchIds,
    group_ids: a.groupIds,
    course_ids: a.courseIds,
    student_ids: a.studentIds,
    debtors: a.debtors,
    recipients: a.recipients,
  };
}

export type BroadcastPreview = {
  students: number;
  recipients: number;
  withoutTelegram: number;
} | null;

/** How many a broadcast would reach, and how many of them have no Telegram (same query as sending). */
export async function previewBroadcastAction(audience: AudienceInput): Promise<BroadcastPreview> {
  const ctx = await getCenterContext();
  const parsed = audienceSchema.safeParse(audience);
  if (!parsed.success || !ctx.can.broadcasts) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_broadcast", {
    p_center_id: ctx.center.id,
    p_audience: toDb(parsed.data),
  });
  if (error || !data) return null;
  const d = data as { students: number; recipients: number; withoutTelegram: number };
  return { students: d.students, recipients: d.recipients, withoutTelegram: d.withoutTelegram };
}

/**
 * Sends (or schedules) a broadcast (17): one outbox row per recipient, created by `create_broadcast`. The text
 * may differ per language; empty translations fall back to the main text. "Later" is a date and time in the
 * center's timezone.
 */
export async function createBroadcastAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  let audienceJson: unknown;
  try {
    audienceJson = JSON.parse(str(form, "audience") || "{}");
  } catch {
    return fail("validation.invalid", form);
  }
  const audience = audienceSchema.safeParse(audienceJson);
  if (!audience.success) return fail("validation.invalid", form);

  const parsed = z
    .object({
      body: z
        .string()
        .min(1, { error: "validation.required" })
        .max(2000, { error: "validation.tooLong" }),
      channel: z.enum(["telegram", "sms"], { error: "validation.invalid" }),
      when: z.enum(["now", "later"]),
      date: z.string(),
      time: z.string(),
    })
    .safeParse({
      body: str(form, "body"),
      channel: str(form, "channel") || "telegram",
      when: str(form, "when") || "now",
      date: str(form, "date"),
      time: str(form, "time"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  // A broadcast reaches many people at once: the sender ticks "I checked the recipients".
  if (form.get("confirm") !== "on") return fail("validation.confirmBroadcast", form);

  let scheduledAt: string | null = null;
  if (parsed.data.when === "later") {
    try {
      scheduledAt = toInstant(
        parsed.data.date,
        parsed.data.time,
        ctx.center.timezone,
      ).toISOString();
    } catch {
      return { ok: false, fieldErrors: { date: "validation.date" }, values: undefined };
    }
  }
  const bodies: Record<string, string> = {};
  for (const l of ["uz", "ru", "en"]) {
    const text = str(form, `body.${l}`);
    if (text) bodies[l] = text;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_broadcast", {
    p_center_id: ctx.center.id,
    p_audience: toDb(audience.data),
    p_body: parsed.data.body,
    p_body_by_locale: bodies,
    p_channel: parsed.data.channel,
    ...(scheduledAt ? { p_scheduled_at: scheduledAt } : {}),
  });
  if (error) return fail(dbErrorKey(error), form);
  revalidatePath("/[locale]/broadcasts", "page");
  const result = data as { recipients?: number } | null;
  return { ok: true, data: { recipients: String(result?.recipients ?? 0) } };
}

/** Stops a broadcast's messages that haven't gone out yet. */
export async function cancelBroadcastAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "id"));
  if (!id.success) return fail("validation.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_broadcast", { p_broadcast_id: id.data });
  if (error) return fail(dbErrorKey(error));
  revalidatePath("/[locale]/broadcasts", "page");
  return { ok: true };
}

/** Debtors → "Send reminder" (15): the payment reminder now, at most once a day per student. */
export async function sendReminderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "studentId"));
  if (!id.success) return fail("validation.invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_payment_reminder", { p_student_id: id.data });
  if (error) return fail(dbErrorKey(error));
  revalidatePath("/[locale]/debtors", "page");
  return { ok: true, data: { queued: String(data ?? 0) } };
}
