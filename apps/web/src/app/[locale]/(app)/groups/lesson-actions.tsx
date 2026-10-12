"use client";

import { Ban, CalendarClock, CalendarPlus, UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  CheckboxField,
  Field,
  FormDialog,
  RowActions,
  SelectField,
  type RowAction,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { hhmm } from "@/lib/dates";
import {
  cancelLessonAction,
  makeupLessonAction,
  moveLessonAction,
  substituteAction,
} from "./actions";

/** What the lesson dialogs need to know about a lesson (times in branch time). */
export type LessonRef = {
  /** Empty for a new extra lesson. */
  id: string;
  groupId: string;
  groupName: string;
  branchId: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  roomId: string | null;
  teacherId: string;
  status: "scheduled" | "held" | "cancelled";
  isBillable: boolean;
};

type Kind = "move" | "cancel" | "makeup" | "substitute";
type Open = (kind: Kind, lesson: LessonRef) => void;

const LessonActionsContext = createContext<Open | null>(null);

type Room = { id: string; name: string; branchId: string };
type Teacher = { id: string; name: string; role: string; branchIds: string[] };

const SAME = "__same__";

function withoutSame(action: (prev: ActionState, form: FormData) => Promise<ActionState>) {
  return (prev: ActionState, form: FormData) => {
    if (form.get("roomId") === SAME) form.set("roomId", "");
    return action(prev, form);
  };
}

/**
 * Hosts the lesson dialogs once per page; rows and timetable blocks open them with `useLessonActions()`.
 * The database has the final word on clashes and shows its message in the dialog.
 */
export function LessonActionsProvider({
  rooms,
  teachers,
  children,
}: {
  rooms: Room[];
  teachers: Teacher[];
  children: ReactNode;
}) {
  const t = useTranslations("lessons");
  const [current, setCurrent] = useState<{ kind: Kind; lesson: LessonRef } | null>(null);
  const close = (open: boolean) => {
    if (!open) setCurrent(null);
  };
  const lesson = current?.lesson;
  const branchRooms = lesson ? rooms.filter((r) => r.branchId === lesson.branchId) : [];
  const roomOptions = [
    { value: SAME, label: t("sameRoom") },
    ...branchRooms.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    <LessonActionsContext.Provider value={(kind, l) => setCurrent({ kind, lesson: l })}>
      {children}

      <FormDialog
        open={current?.kind === "move"}
        onOpenChange={close}
        title={t("moveTitle")}
        description={lesson ? t("moveHint", { group: lesson.groupName }) : undefined}
        action={withoutSame(moveLessonAction)}
        submitLabel={t("move")}
        successToast={t("moved")}
        testId="move-dialog"
      >
        {(state) =>
          lesson ? (
            <>
              <input type="hidden" name="lessonId" value={lesson.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  name="date"
                  type="date"
                  label={t("date")}
                  defaultValue={lesson.date}
                  state={state}
                  required
                />
                <Field
                  name="time"
                  type="time"
                  step={300}
                  label={t("time")}
                  defaultValue={hhmm(lesson.startMinutes)}
                  state={state}
                  required
                />
              </div>
              <SelectField
                name="roomId"
                label={t("room")}
                state={state}
                defaultValue={SAME}
                options={roomOptions}
              />
              <CheckboxField
                name="notify"
                value="on"
                label={t("notify")}
                hint={t("notifyMoveHint")}
                defaultChecked
              />
            </>
          ) : null
        }
      </FormDialog>

      <FormDialog
        open={current?.kind === "cancel"}
        onOpenChange={close}
        title={t("cancelTitle")}
        description={lesson ? t("cancelHint", { group: lesson.groupName }) : undefined}
        action={cancelLessonAction}
        submitLabel={t("cancelSubmit")}
        successToast={t("cancelled")}
        testId="cancel-dialog"
      >
        {(state) =>
          lesson ? (
            <>
              <input type="hidden" name="lessonId" value={lesson.id} />
              <Field
                name="reason"
                label={t("reason")}
                placeholder={t("reasonPlaceholder")}
                state={state}
                required
              />
              <CheckboxField
                name="centerFault"
                value="on"
                label={t("centerFault")}
                hint={t("centerFaultHint")}
                defaultChecked
              />
              <CheckboxField name="notify" value="on" label={t("notify")} defaultChecked />
            </>
          ) : null
        }
      </FormDialog>

      <FormDialog
        open={current?.kind === "makeup"}
        onOpenChange={close}
        title={lesson?.id ? t("makeupTitle") : t("extraTitle")}
        description={lesson ? t("makeupHint", { group: lesson.groupName }) : undefined}
        action={withoutSame(makeupLessonAction)}
        submitLabel={t("makeupSubmit")}
        successToast={t("makeupAdded")}
        testId="makeup-dialog"
      >
        {(state) =>
          lesson ? (
            <>
              <input type="hidden" name="groupId" value={lesson.groupId} />
              <input type="hidden" name="forLessonId" value={lesson.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  name="date"
                  type="date"
                  label={t("date")}
                  defaultValue={lesson.date}
                  state={state}
                  required
                />
                <Field
                  name="time"
                  type="time"
                  step={300}
                  label={t("time")}
                  defaultValue={hhmm(lesson.startMinutes)}
                  state={state}
                  required
                />
              </div>
              <Field
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                min={15}
                max={480}
                label={t("duration")}
                defaultValue={lesson.endMinutes - lesson.startMinutes}
                state={state}
                required
              />
              <SelectField
                name="roomId"
                label={t("room")}
                state={state}
                defaultValue={SAME}
                options={roomOptions}
              />
              <CheckboxField
                name="billable"
                value="on"
                label={t("billable")}
                hint={t("billableHint")}
                defaultChecked={lesson.id ? !lesson.isBillable : true}
              />
              <CheckboxField name="notify" value="on" label={t("notify")} defaultChecked />
            </>
          ) : null
        }
      </FormDialog>

      <FormDialog
        open={current?.kind === "substitute"}
        onOpenChange={close}
        title={t("substituteTitle")}
        description={lesson ? t("substituteHint", { group: lesson.groupName }) : undefined}
        action={substituteAction}
        submitLabel={t("substituteSubmit")}
        successToast={t("substituted")}
        testId="substitute-dialog"
      >
        {(state) =>
          lesson ? (
            <>
              <input type="hidden" name="lessonId" value={lesson.id} />
              <SelectField
                name="teacherId"
                label={t("teacher")}
                state={state}
                options={teachers
                  .filter(
                    (x) =>
                      x.id !== lesson.teacherId &&
                      (x.role === "owner" || x.branchIds.includes(lesson.branchId)),
                  )
                  .map((x) => ({ value: x.id, label: x.name }))}
              />
            </>
          ) : null
        }
      </FormDialog>
    </LessonActionsContext.Provider>
  );
}

export function useLessonActions(): Open {
  const open = useContext(LessonActionsContext);
  if (!open) throw new Error("useLessonActions() outside LessonActionsProvider");
  return open;
}

function actionsFor(
  lesson: LessonRef,
  t: ReturnType<typeof useTranslations<"lessons">>,
  open: Open,
): RowAction[] {
  const label = `${lesson.groupName} ${lesson.date} ${hhmm(lesson.startMinutes)}`;
  if (lesson.status === "cancelled") {
    return [
      {
        key: "makeup",
        label: t("rowMakeup", { lesson: label }),
        icon: CalendarPlus,
        onSelect: () => open("makeup", lesson),
      },
    ];
  }
  if (lesson.status !== "scheduled") return [];
  return [
    {
      key: "move",
      label: t("rowMove", { lesson: label }),
      icon: CalendarClock,
      onSelect: () => open("move", lesson),
    },
    {
      key: "substitute",
      label: t("rowSubstitute", { lesson: label }),
      icon: UserRoundCog,
      onSelect: () => open("substitute", lesson),
    },
    {
      key: "cancel",
      label: t("rowCancel", { lesson: label }),
      icon: Ban,
      tone: "destructive",
      onSelect: () => open("cancel", lesson),
    },
  ];
}

/** Icon actions for a lesson row (group page). */
export function LessonRowActions({ lesson }: { lesson: LessonRef }) {
  const t = useTranslations("lessons");
  const open = useLessonActions();
  const actions = actionsFor(lesson, t, open);
  return actions.length ? <RowActions actions={actions} /> : null;
}

/** Labelled buttons for the timetable popover. */
export function LessonMenu({ lesson }: { lesson: LessonRef }) {
  const t = useTranslations("lessons");
  const open = useLessonActions();
  return (
    <div className="flex flex-col gap-1">
      {actionsFor(lesson, t, open).map((a) => {
        const Icon = a.icon;
        return (
          <Button
            key={a.key}
            variant="ghost"
            size="sm"
            className={
              a.tone === "destructive" ? "justify-start text-destructive" : "justify-start"
            }
            onClick={a.onSelect}
          >
            <Icon />
            {t(
              a.key === "makeup"
                ? "makeup"
                : a.key === "move"
                  ? "move"
                  : a.key === "substitute"
                    ? "substitute"
                    : "cancel",
            )}
          </Button>
        );
      })}
    </div>
  );
}

/** "+ Extra lesson" on the group page (a one-off lesson outside the weekly times). */
export function ExtraLessonButton({ lesson }: { lesson: LessonRef }) {
  const t = useTranslations("lessons");
  const open = useLessonActions();
  return (
    <Button variant="outline-primary" onClick={() => open("makeup", lesson)}>
      <CalendarPlus />
      {t("extra")}
    </Button>
  );
}
