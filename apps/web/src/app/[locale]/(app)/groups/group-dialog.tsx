"use client";

import { suggestGroupName } from "@uteach/core";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  Field,
  FormDialog,
  PageAction,
  SelectField,
  WeeklySlotsField,
  type WeeklySlot,
} from "@/components/patterns";
import type { ActionState } from "@/lib/actions";
import { weekdayLabels } from "@/lib/dates";
import { createGroupAction, updateGroupAction } from "./actions";

export type Option = { value: string; label: string };
export type GroupFormData = {
  branches: { id: string; name: string }[];
  courses: {
    id: string;
    name: string;
    defaultLessonMinutes: number | null;
    levels: { id: string; name: string }[];
  }[];
  rooms: { id: string; name: string; branchId: string }[];
  teachers: { id: string; name: string; branchIds: string[]; role: string }[];
  /** Course default prices in major units, by course id (only with `billing`). */
  coursePrices: Record<string, string>;
  showPrice: boolean;
  today: string;
};

const NONE = "__none__";

function teacherOptions(data: GroupFormData, branchId: string): Option[] {
  return data.teachers
    .filter((t) => t.role === "owner" || t.branchIds.includes(branchId))
    .map((t) => ({ value: t.id, label: t.name }));
}

function roomOptions(data: GroupFormData, branchId: string): Option[] {
  return data.rooms
    .filter((r) => r.branchId === branchId)
    .map((r) => ({ value: r.id, label: r.name }));
}

/** Empty choices are sent as "" (the server treats them as "none"). */
function clearNone(action: (prev: ActionState, form: FormData) => Promise<ActionState>) {
  return (prev: ActionState, form: FormData) => {
    for (const key of ["levelId", "teacherId", "roomId"])
      if (form.get(key) === NONE) form.set(key, "");
    return action(prev, form);
  };
}

/** "+ New group": course → level, teacher, room, dates, price (with `billing`) and weekly times. */
export function NewGroupDialog({ data }: { data: GroupFormData }) {
  const t = useTranslations("groups");
  const locale = useLocale();
  const shortDays = useMemo(() => weekdayLabels(locale, "short"), [locale]);
  const longDays = useMemo(() => weekdayLabels(locale, "long"), [locale]);

  const [branchId, setBranchId] = useState(data.branches[0]?.id ?? "");
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? "");
  const [levelId, setLevelId] = useState(NONE);
  const [slots, setSlots] = useState<WeeklySlot[]>([]);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const course = data.courses.find((c) => c.id === courseId);
  const level = course?.levels.find((l) => l.id === levelId);
  const suggested = course
    ? suggestGroupName(
        {
          course: course.name,
          level: level?.name,
          weekdays: slots.map((s) => s.weekday),
          startTime: slots[0]?.startTime,
        },
        shortDays,
      )
    : "";
  const shownName = nameTouched ? name : suggested;

  const reset = () => {
    setBranchId(data.branches[0]?.id ?? "");
    setCourseId(data.courses[0]?.id ?? "");
    setLevelId(NONE);
    setSlots([]);
    setName("");
    setNameTouched(false);
  };

  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      onOpenChange={(open) => {
        if (open) reset();
      }}
      title={t("addTitle")}
      description={t("addHint")}
      action={clearNone(createGroupAction)}
      submitLabel={t("addSubmit")}
      successToast={t("added")}
      testId="group-dialog"
    >
      {(state) => (
        <>
          {data.branches.length > 1 ? (
            <SelectField
              name="branchId"
              label={t("fields.branch")}
              state={state}
              value={branchId}
              onValueChange={setBranchId}
              options={data.branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : (
            <input type="hidden" name="branchId" value={branchId} />
          )}
          <SelectField
            name="courseId"
            label={t("fields.course")}
            state={state}
            value={courseId}
            onValueChange={(v) => {
              setCourseId(v);
              setLevelId(NONE);
            }}
            options={data.courses.map((c) => ({ value: c.id, label: c.name }))}
          />
          {course && course.levels.length > 0 ? (
            <SelectField
              name="levelId"
              label={t("fields.level")}
              state={state}
              value={levelId}
              onValueChange={setLevelId}
              options={[
                { value: NONE, label: t("noLevel") },
                ...course.levels.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          ) : null}
          <SelectField
            name="teacherId"
            label={t("fields.teacher")}
            state={state}
            defaultValue={NONE}
            options={[{ value: NONE, label: t("noTeacher") }, ...teacherOptions(data, branchId)]}
          />
          <SelectField
            name="roomId"
            label={t("fields.room")}
            state={state}
            defaultValue={NONE}
            options={[{ value: NONE, label: t("noRoom") }, ...roomOptions(data, branchId)]}
          />
          <WeeklySlotsField
            key={`${branchId}:${courseId}`}
            name="slots"
            label={t("fields.slots")}
            state={state}
            onChange={setSlots}
            dayLabels={longDays}
            defaultDuration={course?.defaultLessonMinutes ?? 90}
          />
          <Field
            name="name"
            label={t("fields.name")}
            hint={t("fields.nameHint")}
            value={shownName}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            state={state}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="startDate"
              type="date"
              label={t("fields.startDate")}
              defaultValue={data.today}
              state={state}
              required
            />
            <Field name="endDate" type="date" label={t("fields.endDate")} state={state} />
          </div>
          <Field
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            label={t("fields.capacity")}
            hint={t("fields.capacityHint")}
            state={state}
          />
          {data.showPrice ? (
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field
                key={courseId}
                name="price"
                inputMode="decimal"
                label={t("fields.price")}
                defaultValue={data.coursePrices[courseId] ?? ""}
                state={state}
              />
              <Field
                name="cycleLessons"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                label={t("fields.cycleLessons")}
                defaultValue={12}
                state={state}
              />
            </div>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

export type GroupEditValues = {
  id: string;
  name: string;
  branchId: string;
  courseId: string;
  levelId: string | null;
  teacherId: string | null;
  roomId: string | null;
  capacity: number | null;
  status: "forming" | "active" | "finished";
  startDate: string;
  endDate: string | null;
};

/** Edit dialog on the group page. Changing teacher, room or dates regenerates future lessons. */
export function EditGroupDialog({
  group,
  data,
  trigger,
}: {
  group: GroupEditValues;
  data: GroupFormData;
  trigger: React.ReactNode;
}) {
  const t = useTranslations("groups");
  const tc = useTranslations("common");
  const course = data.courses.find((c) => c.id === group.courseId);

  return (
    <FormDialog
      trigger={trigger}
      title={t("editTitle")}
      description={t("editHint")}
      action={clearNone(updateGroupAction)}
      submitLabel={tc("save")}
      successToast={tc("saved")}
      testId="group-edit-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={group.id} />
          <Field
            name="name"
            label={t("fields.name")}
            defaultValue={group.name}
            state={state}
            required
          />
          {course && course.levels.length > 0 ? (
            <SelectField
              name="levelId"
              label={t("fields.level")}
              state={state}
              defaultValue={group.levelId ?? NONE}
              options={[
                { value: NONE, label: t("noLevel") },
                ...course.levels.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          ) : (
            <input type="hidden" name="levelId" value="" />
          )}
          <SelectField
            name="teacherId"
            label={t("fields.teacher")}
            state={state}
            defaultValue={group.teacherId ?? NONE}
            options={[
              { value: NONE, label: t("noTeacher") },
              ...teacherOptions(data, group.branchId),
            ]}
          />
          <SelectField
            name="roomId"
            label={t("fields.room")}
            state={state}
            defaultValue={group.roomId ?? NONE}
            options={[{ value: NONE, label: t("noRoom") }, ...roomOptions(data, group.branchId)]}
          />
          <SelectField
            name="status"
            label={t("fields.status")}
            state={state}
            defaultValue={group.status}
            options={(["forming", "active", "finished"] as const).map((s) => ({
              value: s,
              label: t(`status.${s}`),
            }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="startDate"
              type="date"
              label={t("fields.startDate")}
              defaultValue={group.startDate}
              state={state}
              required
            />
            <Field
              name="endDate"
              type="date"
              label={t("fields.endDate")}
              defaultValue={group.endDate ?? ""}
              state={state}
            />
          </div>
          <Field
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            label={t("fields.capacity")}
            defaultValue={group.capacity ?? ""}
            state={state}
          />
        </>
      )}
    </FormDialog>
  );
}
