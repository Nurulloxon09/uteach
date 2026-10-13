"use client";

import { LEAD_SOURCES } from "@uteach/core";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Field, FormDialog, PageAction, SelectField } from "@/components/patterns";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions";
import {
  createLeadAction,
  findLeadDuplicatesAction,
  updateLeadAction,
  type LeadDuplicate,
} from "./actions";

export type LeadFormOptions = {
  branches: { id: string; name: string }[];
  courses: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
};

export type LeadValues = {
  id: string;
  branchId: string;
  fullName: string;
  phone: string | null;
  telegramUsername: string | null;
  source: string;
  sourceDetail: string | null;
  goal: string | null;
  targetScore: number | null;
  currentLevel: string | null;
  courseId: string | null;
  preferredSchedule: string | null;
  assigneeId: string | null;
};

const NONE = "__none__";

/** Radix Select can't submit an empty value: "none" travels as NONE and is cleared here. */
function withNone(action: (prev: ActionState, form: FormData) => Promise<ActionState>) {
  return (prev: ActionState, form: FormData) => {
    for (const key of ["courseId", "assigneeId"]) if (form.get(key) === NONE) form.set(key, "");
    return action(prev, form);
  };
}

/** "Possible duplicate" under the phone field: leads, students and guardians with that phone (11). */
export function DuplicateWarning({ duplicates }: { duplicates: LeadDuplicate[] }) {
  const t = useTranslations("leads");
  if (duplicates.length === 0) return null;
  return (
    <div
      className="space-y-2 rounded-xl bg-warning/15 p-3 text-sm text-foreground *:[svg]:text-warning"
      role="status"
      data-testid="lead-duplicates"
    >
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4 text-warning" aria-hidden />
        {t("duplicates.title")}
      </p>
      <ul className="space-y-1">
        {duplicates.map((d) => {
          const href = d.leadId ? `/leads/${d.leadId}` : `/students/${d.studentId}`;
          const what =
            d.kind === "lead"
              ? t("duplicates.lead", { status: d.status ? t(`status.${d.status}`) : "" })
              : d.kind === "student"
                ? t("duplicates.student")
                : t("duplicates.guardian");
          return (
            <li key={`${d.kind}-${d.leadId ?? d.studentId}`}>
              <Link href={href} className="font-semibold underline underline-offset-2">
                {d.name}
              </Link>{" "}
              · {what}
              {d.archived ? ` · ${t("duplicates.archived")}` : ""}
            </li>
          );
        })}
      </ul>
      <p>{t("duplicates.hint")}</p>
    </div>
  );
}

function LeadFields({
  state,
  lead,
  options,
  defaultAssigneeId,
  onPhoneBlur,
  duplicates,
}: {
  state: ActionState;
  lead?: LeadValues;
  options: LeadFormOptions;
  defaultAssigneeId?: string;
  onPhoneBlur: (phone: string) => void;
  duplicates: ReactNode;
}) {
  const t = useTranslations("leads");
  const { branches, courses, assignees } = options;
  return (
    <>
      <Field
        name="fullName"
        label={t("fields.fullName")}
        defaultValue={lead?.fullName}
        state={state}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="phone"
          type="tel"
          inputMode="tel"
          label={t("fields.phone")}
          defaultValue={lead?.phone ?? ""}
          state={state}
          onBlur={(e) => onPhoneBlur(e.currentTarget.value)}
        />
        <Field
          name="telegramUsername"
          label={t("fields.telegram")}
          placeholder="@username"
          defaultValue={lead?.telegramUsername ?? ""}
          state={state}
        />
      </div>
      {duplicates}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          name="source"
          label={t("fields.source")}
          state={state}
          defaultValue={lead?.source ?? "instagram"}
          options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
        />
        <Field
          name="sourceDetail"
          label={t("fields.sourceDetail")}
          placeholder={t("fields.sourceDetailPlaceholder")}
          defaultValue={lead?.sourceDetail ?? ""}
          state={state}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="goal"
          label={t("fields.goal")}
          placeholder={t("fields.goalPlaceholder")}
          defaultValue={lead?.goal ?? ""}
          state={state}
        />
        <Field
          name="targetScore"
          inputMode="decimal"
          label={t("fields.targetScore")}
          defaultValue={lead?.targetScore?.toString() ?? ""}
          state={state}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="currentLevel"
          label={t("fields.currentLevel")}
          placeholder={t("fields.currentLevelPlaceholder")}
          defaultValue={lead?.currentLevel ?? ""}
          state={state}
        />
        <SelectField
          name="courseId"
          label={t("fields.course")}
          state={state}
          defaultValue={lead?.courseId ?? NONE}
          options={[
            { value: NONE, label: t("fields.none") },
            ...courses.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
      <Field
        name="preferredSchedule"
        label={t("fields.preferredSchedule")}
        placeholder={t("fields.preferredSchedulePlaceholder")}
        defaultValue={lead?.preferredSchedule ?? ""}
        state={state}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.length > 1 ? (
          <SelectField
            name="branchId"
            label={t("fields.branch")}
            state={state}
            defaultValue={lead?.branchId ?? branches[0]?.id}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        ) : (
          <input type="hidden" name="branchId" value={lead?.branchId ?? branches[0]?.id ?? ""} />
        )}
        <SelectField
          name="assigneeId"
          label={t("fields.assignee")}
          state={state}
          defaultValue={lead ? (lead.assigneeId ?? NONE) : (defaultAssigneeId ?? NONE)}
          options={[
            { value: NONE, label: t("fields.nobody") },
            ...assignees.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
      </div>
    </>
  );
}

function useDuplicates(excludeLeadId?: string) {
  const [duplicates, setDuplicates] = useState<LeadDuplicate[]>([]);
  const [, startTransition] = useTransition();
  const check = (phone: string) => {
    if (phone.replace(/\D/g, "").length < 7) {
      setDuplicates([]);
      return;
    }
    startTransition(async () =>
      setDuplicates(await findLeadDuplicatesAction(phone, excludeLeadId)),
    );
  };
  return { duplicates, check, reset: () => setDuplicates([]) };
}

/** "+ New lead": the lead's details, its first note, and a live duplicate warning (11). */
export function AddLeadDialog({
  options,
  defaultAssigneeId,
}: {
  options: LeadFormOptions;
  defaultAssigneeId?: string;
}) {
  const t = useTranslations("leads");
  const { duplicates, check, reset } = useDuplicates();
  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      onOpenChange={(open) => (open ? null : reset())}
      title={t("addTitle")}
      action={withNone(createLeadAction)}
      submitLabel={t("addSubmit")}
      successToast={t("added")}
      testId="lead-dialog"
    >
      {(state) => (
        <>
          <LeadFields
            state={state}
            options={options}
            defaultAssigneeId={defaultAssigneeId}
            onPhoneBlur={check}
            duplicates={<DuplicateWarning duplicates={duplicates} />}
          />
          <div className="space-y-2">
            <label htmlFor="lead-note" className="text-[15px] text-secondary-foreground">
              {t("fields.firstNote")}
            </label>
            <Textarea
              id="lead-note"
              name="note"
              rows={3}
              maxLength={2000}
              defaultValue={state && !state.ok ? (state.values?.note ?? "") : ""}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function EditLeadDialog({
  lead,
  options,
  trigger,
}: {
  lead: LeadValues;
  options: LeadFormOptions;
  trigger: ReactNode;
}) {
  const t = useTranslations("leads");
  const tc = useTranslations("common");
  const { duplicates, check, reset } = useDuplicates(lead.id);
  return (
    <FormDialog
      trigger={trigger}
      onOpenChange={(open) => (open ? null : reset())}
      title={t("editTitle")}
      action={withNone(updateLeadAction)}
      submitLabel={tc("save")}
      successToast={tc("saved")}
      testId="lead-edit-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={lead.id} />
          <LeadFields
            state={state}
            lead={lead}
            options={options}
            onPhoneBlur={check}
            duplicates={<DuplicateWarning duplicates={duplicates} />}
          />
        </>
      )}
    </FormDialog>
  );
}
