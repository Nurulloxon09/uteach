"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { setCurrentCenter } from "@/lib/current-center";
import {
  COURSE_PRESETS,
  isLaterStep,
  nextStep,
  readProgress,
  type LaterStep,
  type StepStatus,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { localeField, optionalText, requiredText, timezoneField } from "@/lib/validation";

const schema = z.object({
  name: requiredText(),
  locale: localeField,
  timezone: timezoneField,
  branchName: requiredText(),
  branchAddress: optionalText(),
});

/** Steps 1–2: creates the center with its first branch (one transaction). The client then uploads the logo. */
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
  return { ok: true, data: { centerId } };
}

/** Stores the uploaded logo's path (the file is already in `center-assets/{center_id}/`). */
export async function setLogoAction(centerId: string, path: string): Promise<boolean> {
  if (!z.uuid().safeParse(centerId).success || !path.startsWith(`${centerId}/`)) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .update({ logo_path: path })
    .eq("id", centerId)
    .select("id");
  return Boolean(data?.length);
}

/** Records a step as done or skipped and moves to the next unfinished step (or Home). */
async function finishStep(step: LaterStep, status: StepStatus): Promise<never> {
  const ctx = await getCenterContext();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: center } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", ctx.center.id)
    .single();
  const settings = (center?.settings ?? {}) as Record<string, unknown>;
  const progress = { ...readProgress(settings), [step]: status };
  await supabase
    .from("centers")
    .update({ settings: { ...settings, onboarding: progress } })
    .eq("id", ctx.center.id);

  revalidatePath("/[locale]/home", "page");
  const next = nextStep(progress, step);
  return redirect({ href: next ? `/onboarding/${next}` : "/home", locale });
}

export async function skipStepAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const step = str(form, "step");
  if (!isLaterStep(step)) return fail("validation.invalid");
  return finishStep(step, "skipped");
}

export async function completeStepAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const step = str(form, "step");
  if (!isLaterStep(step)) return fail("validation.invalid");
  return finishStep(step, "done");
}

/** Step 3: quick room list for the first branch (empty rows are ignored). */
export async function addRoomsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const names = form.getAll("roomName").map((v) => String(v).trim());
  const capacities = form.getAll("roomCapacity").map((v) => String(v).trim());
  const rooms: { name: string; capacity: number | null }[] = [];
  const fieldErrors: Record<string, string> = {};
  names.forEach((name, i) => {
    if (!name) return;
    const cap = capacities[i] ?? "";
    const capacity = cap === "" ? null : Number(cap);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
      fieldErrors.roomCapacity = "validation.capacity";
    }
    rooms.push({ name: name.slice(0, 120), capacity });
  });
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  if (rooms.length) {
    const supabase = await createClient();
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .order("created_at")
      .limit(1)
      .single();
    if (!branch) return fail("db.not_found");
    const { error } = await supabase.from("rooms").insert(
      rooms.map((r) => ({
        center_id: ctx.center.id,
        branch_id: branch.id,
        name: r.name,
        capacity: r.capacity,
      })),
    );
    if (error) return fail(dbErrorKey(error));
  }
  return finishStep("rooms", "done");
}

/** Step 4: creates the chosen preset courses (with levels) and an optional custom course. */
export async function addCoursesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const chosen = new Set(form.getAll("preset").map(String));
  const custom = str(form, "customCourse").slice(0, 120);
  // Course names are data in the center's language, not the UI language.
  const t = await getTranslations({
    locale: ctx.center.defaultLocale as "uz",
    namespace: "onboarding.presets",
  });
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("courses")
    .select("name")
    .eq("center_id", ctx.center.id)
    .is("archived_at", null);
  const taken = new Set((existing ?? []).map((c) => c.name.toLowerCase()));

  const toCreate = [
    ...COURSE_PRESETS.filter((p) => chosen.has(p.key)).map((p) => ({
      name: t(`${p.key}.name`),
      kind: p.kind as string,
      minutes: p.minutes as number,
      levels: t(`${p.key}.levels`)
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    })),
    ...(custom ? [{ name: custom, kind: "other", minutes: 90, levels: [] as string[] }] : []),
  ].filter((c) => !taken.has(c.name.toLowerCase()));

  for (const course of toCreate) {
    const { data, error } = await supabase
      .from("courses")
      .insert({
        center_id: ctx.center.id,
        name: course.name,
        kind: course.kind,
        default_lesson_minutes: course.minutes,
      })
      .select("id")
      .single();
    if (error) return fail(dbErrorKey(error));
    if (course.levels.length) {
      const { data: levels, error: levelError } = await supabase
        .from("levels")
        .insert(
          course.levels.map((name, i) => ({
            center_id: ctx.center.id,
            course_id: data.id,
            name,
            sort_order: i + 1,
          })),
        )
        .select("id, sort_order");
      if (levelError) return fail(dbErrorKey(levelError));
      // Each level leads to the next one.
      const ordered = (levels ?? []).sort((a, b) => a.sort_order - b.sort_order);
      for (const [i, level] of ordered.entries()) {
        const next = ordered[i + 1];
        if (next)
          await supabase.from("levels").update({ next_level_id: next.id }).eq("id", level.id);
      }
    }
  }
  return finishStep("courses", toCreate.length || chosen.size ? "done" : "skipped");
}
