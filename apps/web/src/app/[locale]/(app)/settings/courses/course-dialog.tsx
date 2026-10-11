"use client";

import { useTranslations } from "next-intl";
import { Field, FormDialog, PageAction, SelectField } from "@/components/patterns";
import type { ActionState } from "@/lib/actions";
import { createCourseAction, updateCourseAction } from "./actions";

export type CourseFormValues = {
  id: string;
  name: string;
  kind: string;
  defaultLessonMinutes: number | null;
  description: string | null;
  /** Major units for the input, or "" (only staff with `billing` get it). */
  defaultPrice: string;
};

const KINDS = ["language", "exam_prep", "school_subject", "other"] as const;

function CourseFields({
  state,
  course,
  showPrice,
}: {
  state: ActionState;
  course?: CourseFormValues;
  showPrice: boolean;
}) {
  const t = useTranslations("courses");
  return (
    <>
      {course ? <input type="hidden" name="id" value={course.id} /> : null}
      <Field
        name="name"
        label={t("fields.name")}
        defaultValue={course?.name}
        state={state}
        required
      />
      <SelectField
        name="kind"
        label={t("fields.kind")}
        state={state}
        defaultValue={course?.kind ?? "language"}
        options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
      />
      <Field
        name="defaultLessonMinutes"
        type="number"
        inputMode="numeric"
        min={15}
        max={480}
        label={t("fields.minutes")}
        hint={t("fields.minutesHint")}
        defaultValue={course?.defaultLessonMinutes ?? 90}
        state={state}
      />
      {showPrice ? (
        <Field
          name="defaultPrice"
          inputMode="decimal"
          label={t("fields.price")}
          hint={t("fields.priceHint")}
          defaultValue={course?.defaultPrice}
          state={state}
        />
      ) : null}
      <Field
        name="description"
        label={t("fields.description")}
        defaultValue={course?.description ?? ""}
        state={state}
      />
    </>
  );
}

/** "+ Add course" page action. */
export function AddCourseDialog({ showPrice }: { showPrice: boolean }) {
  const t = useTranslations("courses");
  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      title={t("addTitle")}
      description={t("addHint")}
      action={createCourseAction}
      submitLabel={t("addSubmit")}
      successToast={t("added")}
      testId="course-dialog"
    >
      {(state) => <CourseFields state={state} showPrice={showPrice} />}
    </FormDialog>
  );
}

/** Edit dialog, opened from the course page. */
export function EditCourseDialog({
  course,
  showPrice,
  trigger,
}: {
  course: CourseFormValues;
  showPrice: boolean;
  trigger: React.ReactNode;
}) {
  const t = useTranslations("courses");
  const tc = useTranslations("common");
  return (
    <FormDialog
      trigger={trigger}
      title={t("editTitle")}
      action={updateCourseAction}
      submitLabel={tc("save")}
      successToast={tc("saved")}
    >
      {(state) => <CourseFields state={state} course={course} showPrice={showPrice} />}
    </FormDialog>
  );
}
