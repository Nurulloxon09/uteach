"use server";

import { isLocale, type Locale } from "@uteach/i18n";
import { isTemplateKey, renderTemplate, samplePayload } from "@uteach/i18n/notifications";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  dbErrorKey,
  fail,
  fieldErrorsFrom,
  formValues,
  str,
  type ActionState,
} from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { intField } from "@/lib/validation";

function refresh() {
  revalidatePath("/[locale]/settings/notifications", "page");
}

/** Reminders and SMS (15, 17): cadence, "due soon", SMS on/off and the monthly cap. Owners only (RLS). */
export async function updateDeliverySettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = z
    .object({
      reminderEveryDays: intField(1, 30),
      smsMonthlyCap: intField(0, 1_000_000),
    })
    .safeParse({
      reminderEveryDays: str(form, "reminderEveryDays"),
      smsMonthlyCap: str(form, "smsMonthlyCap"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .update({
      reminder_every_days: parsed.data.reminderEveryDays,
      due_soon_reminder_enabled: form.get("dueSoon") === "on",
      sms_enabled: form.get("smsEnabled") === "on",
      sms_monthly_cap: parsed.data.smsMonthlyCap,
    })
    .eq("id", ctx.center.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);
  refresh();
  return { ok: true };
}

type Channel = "telegram" | "sms";
type SystemRow = { channel: Channel; locale: Locale; body: string };

/**
 * Saves one template key for the center (17): its texts per channel and language, the Eskiz template id of SMS
 * texts, and on/off for the whole key. Only what differs from the system text is stored as an override; the
 * rest is removed, so a later change of the system text still reaches this center. A text must be valid ICU
 * and use only the values the key is queued with (checked against a sample payload).
 */
export async function saveTemplateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const key = str(form, "key");
  if (!isTemplateKey(key)) return fail("validation.invalid", form);
  const enabled = form.get("enabled") === "on";
  const supabase = await createClient();

  const { data: system, error: readError } = await supabase
    .from("notification_templates")
    .select("channel, locale, body")
    .is("center_id", null)
    .eq("key", key);
  if (readError) return fail(dbErrorKey(readError), form);
  const rows = (system ?? []).filter((r): r is SystemRow => isLocale(r.locale)) as SystemRow[];

  const fieldErrors: Record<string, string> = {};
  const wanted: {
    channel: Channel;
    locale: Locale;
    body: string;
    smsId: string | null;
    override: boolean;
  }[] = [];
  for (const row of rows) {
    const field = `${row.channel}.${row.locale}`;
    const body = str(form, field) || row.body;
    const smsId = row.channel === "sms" ? str(form, `smsId.${row.locale}`) || null : null;
    if (body.length > 2000) {
      fieldErrors[field] = "validation.tooLong";
      continue;
    }
    try {
      renderTemplate(body, samplePayload(key, ctx.center.name), {
        locale: row.locale,
        currency: ctx.center.currency,
      });
    } catch {
      fieldErrors[field] = "validation.template";
      continue;
    }
    wanted.push({
      channel: row.channel,
      locale: row.locale,
      body,
      smsId,
      override: body !== row.body || !enabled || smsId !== null,
    });
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors, values: formValues(form) };
  }

  const { data: existing, error: overridesError } = await supabase
    .from("notification_templates")
    .select("id, channel, locale")
    .eq("center_id", ctx.center.id)
    .eq("key", key);
  if (overridesError) return fail(dbErrorKey(overridesError), form);
  const idOf = new Map((existing ?? []).map((r) => [`${r.channel}.${r.locale}`, r.id]));

  for (const w of wanted) {
    const id = idOf.get(`${w.channel}.${w.locale}`);
    const values = { body: w.body, is_enabled: enabled, sms_provider_template_id: w.smsId };
    const result = !w.override
      ? id
        ? await supabase.from("notification_templates").delete().eq("id", id).select("id")
        : null
      : id
        ? await supabase.from("notification_templates").update(values).eq("id", id).select("id")
        : await supabase
            .from("notification_templates")
            .insert({
              center_id: ctx.center.id,
              key,
              channel: w.channel,
              locale: w.locale,
              ...values,
            })
            .select("id");
    if (result?.error) return fail(dbErrorKey(result.error), form);
    if (result && !result.data?.length) return fail("db.forbidden", form);
  }
  refresh();
  return { ok: true };
}

/** "Reset to default": removes the center's overrides of a key, so the system texts apply again. */
export async function resetTemplateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const key = str(form, "key");
  if (!isTemplateKey(key)) return fail("validation.invalid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_templates")
    .delete()
    .eq("center_id", ctx.center.id)
    .eq("key", key);
  if (error) return fail(dbErrorKey(error));
  refresh();
  return { ok: true };
}
