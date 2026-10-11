"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Field, FormDialog, PageAction, SelectField } from "@/components/patterns";
import type { ActionState } from "@/lib/actions";
import { createStudentAction, updateStudentAction } from "./actions";

export type StudentValues = {
  id: string;
  branchId: string;
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  gender: "male" | "female" | null;
  school: string | null;
};

const NONE = "__none__";

function withNoneGender(action: (prev: ActionState, form: FormData) => Promise<ActionState>) {
  return (prev: ActionState, form: FormData) => {
    if (form.get("gender") === NONE) form.set("gender", "");
    return action(prev, form);
  };
}

function StudentFields({
  state,
  student,
  branches,
}: {
  state: ActionState;
  student?: StudentValues;
  branches: { id: string; name: string }[];
}) {
  const t = useTranslations("students");
  return (
    <>
      <Field
        name="fullName"
        label={t("fields.fullName")}
        defaultValue={student?.fullName}
        state={state}
        required
      />
      <Field
        name="phone"
        type="tel"
        inputMode="tel"
        label={t("fields.phone")}
        hint={t("fields.phoneHint")}
        defaultValue={student?.phone ?? ""}
        state={state}
      />
      {branches.length > 1 ? (
        <SelectField
          name="branchId"
          label={t("fields.branch")}
          state={state}
          defaultValue={student?.branchId ?? branches[0]?.id}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : (
        <input type="hidden" name="branchId" value={student?.branchId ?? branches[0]?.id ?? ""} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field
          name="birthDate"
          type="date"
          label={t("fields.birthDate")}
          defaultValue={student?.birthDate ?? ""}
          state={state}
        />
        <SelectField
          name="gender"
          label={t("fields.gender")}
          state={state}
          defaultValue={student?.gender ?? NONE}
          options={[
            { value: NONE, label: t("gender.none") },
            { value: "male", label: t("gender.male") },
            { value: "female", label: t("gender.female") },
          ]}
        />
      </div>
      <Field
        name="school"
        label={t("fields.school")}
        defaultValue={student?.school ?? ""}
        state={state}
      />
    </>
  );
}

/** "+ Add student", optionally with a first guardian (siblings: an existing phone links that guardian). */
export function AddStudentDialog({ branches }: { branches: { id: string; name: string }[] }) {
  const t = useTranslations("students");
  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      title={t("addTitle")}
      description={t("addHint")}
      action={withNoneGender(createStudentAction)}
      submitLabel={t("addSubmit")}
      successToast={t("added")}
      testId="student-dialog"
    >
      {(state) => {
        const duplicate = state && !state.ok && state.error === "duplicateStudent";
        return (
          <>
            {/* After the duplicate warning (shown as the form message), saving again creates anyway. */}
            {duplicate ? <input type="hidden" name="confirmDuplicate" value="1" /> : null}
            <StudentFields state={state} branches={branches} />
            <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
              <legend className="px-1 text-[15px] text-secondary-foreground">
                {t("firstGuardian")}
              </legend>
              <Field name="guardianName" label={t("guardian.name")} state={state} />
              <Field
                name="guardianPhone"
                type="tel"
                inputMode="tel"
                label={t("guardian.phone")}
                hint={t("guardian.phoneHint")}
                state={state}
              />
              <SelectField
                name="relation"
                label={t("guardian.relation")}
                state={state}
                defaultValue="parent"
                options={(["mother", "father", "parent", "other"] as const).map((r) => ({
                  value: r,
                  label: t(`relations.${r}`),
                }))}
              />
            </fieldset>
          </>
        );
      }}
    </FormDialog>
  );
}

export function EditStudentDialog({
  student,
  branches,
  trigger,
}: {
  student: StudentValues;
  branches: { id: string; name: string }[];
  trigger: ReactNode;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  return (
    <FormDialog
      trigger={trigger}
      title={t("editTitle")}
      action={withNoneGender(updateStudentAction)}
      submitLabel={tc("save")}
      successToast={tc("saved")}
      testId="student-edit-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={student.id} />
          <StudentFields state={state} student={student} branches={branches} />
        </>
      )}
    </FormDialog>
  );
}
