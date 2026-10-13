"use server";

import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  normalizePhone,
  toInstant,
  type LeadStatus,
} from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey, fail, fieldErrorsFrom, str, type ActionState } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import {
  dateField,
  optionalPhoneField,
  optionalText,
  requiredText,
  timeField,
  uuidField,
} from "@/lib/validation";

const optionalUuid = z.union([uuidField, z.literal("")]).transform((v) => v || null);
const targetScore = z
  .string()
  .trim()
  .regex(/^(\d{1,4}([.,]\d)?)?$/, { error: "validation.invalid" })
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))));
const telegramUsername = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, ""))
  .refine((v) => v === "" || /^[A-Za-z0-9_]{3,32}$/.test(v), { error: "validation.invalid" })
  .transform((v) => v || null);

function refresh(leadId?: string) {
  revalidatePath("/[locale]/leads", "page");
  if (leadId) revalidatePath(`/[locale]/leads/${leadId}`, "page");
  revalidatePath("/[locale]/home", "page");
}

// --- Create / edit --------------------------------------------------------------------

function leadSchema(country: string) {
  return z.object({
    branchId: uuidField,
    fullName: requiredText(160),
    phone: optionalPhoneField(country),
    telegramUsername,
    source: z.enum(LEAD_SOURCES, { error: "validation.invalid" }),
    sourceDetail: optionalText(200),
    goal: optionalText(200),
    targetScore,
    currentLevel: optionalText(80),
    courseId: optionalUuid,
    preferredSchedule: optionalText(200),
    assigneeId: optionalUuid,
  });
}

function readLead(form: FormData) {
  return {
    branchId: str(form, "branchId"),
    fullName: str(form, "fullName"),
    phone: str(form, "phone"),
    telegramUsername: str(form, "telegramUsername"),
    source: str(form, "source") || "other",
    sourceDetail: str(form, "sourceDetail"),
    goal: str(form, "goal"),
    targetScore: str(form, "targetScore"),
    currentLevel: str(form, "currentLevel"),
    courseId: str(form, "courseId"),
    preferredSchedule: str(form, "preferredSchedule"),
    assigneeId: str(form, "assigneeId"),
  };
}

/** New lead (11). Possible duplicates are shown while typing; they never block. */
export async function createLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = leadSchema(ctx.center.countryCode)
    .extend({ note: optionalText(2000) })
    .safeParse({ ...readLead(form), note: str(form, "note") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_lead", {
    p_branch_id: v.branchId,
    p_full_name: v.fullName,
    p_phone: v.phone ?? undefined,
    p_source: v.source,
    p_source_detail: v.sourceDetail ?? undefined,
    p_goal: v.goal ?? undefined,
    p_target_score: v.targetScore ?? undefined,
    p_current_level: v.currentLevel ?? undefined,
    p_interested_course_id: v.courseId ?? undefined,
    p_preferred_schedule: v.preferredSchedule ?? undefined,
    p_assigned_membership_id: v.assigneeId ?? undefined,
    p_telegram_username: v.telegramUsername ?? undefined,
    p_note: v.note ?? undefined,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh();
  return { ok: true, data: { id: data } };
}

export async function updateLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getCenterContext();
  const parsed = leadSchema(ctx.center.countryCode)
    .extend({ id: uuidField })
    .safeParse({ ...readLead(form), id: str(form, "id") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({
      branch_id: v.branchId,
      full_name: v.fullName,
      phone: v.phone,
      telegram_username: v.telegramUsername,
      source: v.source,
      source_detail: v.sourceDetail,
      goal: v.goal,
      target_score: v.targetScore,
      current_level: v.currentLevel,
      interested_course_id: v.courseId,
      preferred_schedule: v.preferredSchedule,
      assigned_membership_id: v.assigneeId,
    })
    .eq("id", v.id)
    .select("id");
  if (error) return fail(dbErrorKey(error), form);
  if (!data?.length) return fail("db.forbidden", form);
  refresh(v.id);
  return { ok: true };
}

/** Archive (hide from the board and lists) or restore. */
export async function archiveLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = uuidField.safeParse(str(form, "id"));
  if (!id.success) return fail("generic");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ archived_at: form.get("restore") === "1" ? null : new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return fail(dbErrorKey(error));
  if (!data?.length) return fail("db.forbidden");
  refresh(id.data);
  return { ok: true };
}

// --- Duplicates and merge --------------------------------------------------------------

export type LeadDuplicate = {
  kind: "lead" | "student" | "guardian";
  leadId: string | null;
  studentId: string | null;
  name: string;
  status: LeadStatus | null;
  archived: boolean;
};

/** Leads, students and guardians' students with this phone (11). Empty for an unreadable phone. */
export async function findLeadDuplicatesAction(
  phone: string,
  excludeLeadId?: string,
): Promise<LeadDuplicate[]> {
  const ctx = await getCenterContext();
  if (!ctx.can.leads) return [];
  const normalized = normalizePhone(phone, ctx.center.countryCode);
  if (!normalized) return [];
  const exclude = excludeLeadId ? uuidField.safeParse(excludeLeadId) : null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("lead_duplicates", {
    p_center_id: ctx.center.id,
    p_phone: normalized,
    p_exclude_lead_id: exclude?.success ? exclude.data : undefined,
  });
  return (data ?? []).map((d) => ({
    kind: d.kind as LeadDuplicate["kind"],
    leadId: d.lead_id,
    studentId: d.student_id,
    name: d.full_name,
    status: d.lead_status,
    archived: d.is_archived,
  }));
}

/** Merges `sourceId` into `targetId`: the timeline and trials move, the source is archived (11). */
export async function mergeLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ sourceId: uuidField, targetId: uuidField })
    .safeParse({ sourceId: str(form, "sourceId"), targetId: str(form, "targetId") });
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_leads", {
    p_source_id: parsed.data.sourceId,
    p_target_id: parsed.data.targetId,
  });
  if (error) return fail(dbErrorKey(error));
  refresh(parsed.data.sourceId);
  refresh(parsed.data.targetId);
  return { ok: true, data: { id: parsed.data.targetId } };
}

// --- Pipeline moves --------------------------------------------------------------------

/** A plain move (board drag or "Move to"). Lost, trials and convert have their own actions. */
export async function moveLeadAction(leadId: string, to: string): Promise<ActionState> {
  const parsed = z
    .object({ leadId: uuidField, to: z.enum(LEAD_STATUSES) })
    .safeParse({ leadId, to });
  if (!parsed.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_lead", {
    p_lead_id: parsed.data.leadId,
    p_to: parsed.data.to,
  });
  if (error) return fail(dbErrorKey(error));
  refresh(parsed.data.leadId);
  return { ok: true };
}

export async function markLostAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      leadId: uuidField,
      reasonId: z.string().pipe(z.uuid({ error: "validation.required" })),
      note: optionalText(500),
    })
    .safeParse({
      leadId: str(form, "leadId"),
      reasonId: str(form, "reasonId"),
      note: str(form, "note"),
    });
  if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_lead", {
    p_lead_id: v.leadId,
    p_to: "lost",
    p_lost_reason_id: v.reasonId,
    p_note: v.note ?? undefined,
  });
  if (error) return fail(dbErrorKey(error), form);
  refresh(v.leadId);
  return { ok: true };
}

// --- Timeline --------------------------------------------------------------------------

/** A note, a call with its outcome, or a follow-up task (due day + time in the center's timezone). */
export async function addLeadActivityAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const ctx = await getCenterContext();
  const kind = str(form, "kind");
  const base = { leadId: str(form, "leadId"), body: str(form, "body") };
  const supabase = await createClient();

  let args: {
    p_lead_id: string;
    p_kind: "note" | "call" | "task";
    p_body?: string;
    p_call_outcome?: string;
    p_due_at?: string;
    p_assigned_membership_id?: string;
  };
  if (kind === "note") {
    const parsed = z.object({ leadId: uuidField, body: requiredText(2000) }).safeParse(base);
    if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
    args = { p_lead_id: parsed.data.leadId, p_kind: "note", p_body: parsed.data.body };
  } else if (kind === "call") {
    const parsed = z
      .object({
        leadId: uuidField,
        body: optionalText(2000),
        outcome: z.enum(["reached", "no_answer", "call_back"], { error: "validation.required" }),
      })
      .safeParse({ ...base, outcome: str(form, "outcome") });
    if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
    args = {
      p_lead_id: parsed.data.leadId,
      p_kind: "call",
      p_body: parsed.data.body ?? undefined,
      p_call_outcome: parsed.data.outcome,
    };
  } else if (kind === "task") {
    const parsed = z
      .object({
        leadId: uuidField,
        body: requiredText(2000),
        dueDate: dateField,
        dueTime: timeField,
        assigneeId: optionalUuid,
      })
      .safeParse({
        ...base,
        dueDate: str(form, "dueDate"),
        dueTime: str(form, "dueTime") || "10:00",
        assigneeId: str(form, "assigneeId"),
      });
    if (!parsed.success) return fieldErrorsFrom(parsed.error, form);
    const v = parsed.data;
    args = {
      p_lead_id: v.leadId,
      p_kind: "task",
      p_body: v.body,
      p_due_at: toInstant(v.dueDate, v.dueTime, ctx.center.timezone).toISOString(),
      p_assigned_membership_id: v.assigneeId ?? undefined,
    };
  } else {
    return fail("generic", form);
  }

  const { error } = await supabase.rpc("add_lead_activity", args);
  if (error) return fail(dbErrorKey(error), form);
  refresh(args.p_lead_id);
  return { ok: true };
}

export async function setLeadTaskDoneAction(
  activityId: string,
  leadId: string,
  done: boolean,
): Promise<ActionState> {
  const id = uuidField.safeParse(activityId);
  if (!id.success) return fail("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_lead_task", {
    p_activity_id: id.data,
    p_done: done,
  });
  if (error) return fail(dbErrorKey(error));
  refresh(uuidField.safeParse(leadId).success ? leadId : undefined);
  return { ok: true };
}
