"use client";

import { AlertTriangle, ArrowRightLeft, CircleStop, Snowflake } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CheckboxField,
  Combobox,
  Field,
  FieldError,
  FormDialog,
  RowActions,
  SelectField,
  type RowAction,
} from "@/components/patterns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";
import { endAction, enrollAction, freezeAction, transferAction } from "./actions";

export type GroupChoice = {
  id: string;
  name: string;
  hint?: string;
  capacity: number | null;
  count: number;
  levelId: string | null;
};
export type StudentChoice = { id: string; name: string; hint?: string };
export type EnrollmentRef = {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  /** For "moved to the next level": the level after this group's level. */
  nextLevelId: string | null;
  today: string;
};

/** Required combobox with a label and the field error under it. */
function ComboboxRow({
  name,
  label,
  state,
  options,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  label: string;
  state: ActionState;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("enrollments");
  const id = `field-${name}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Combobox
        id={id}
        name={name}
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        searchPlaceholder={t("search")}
        emptyText={t("nothingFound")}
      />
      <FieldError name={name} state={state} />
    </div>
  );
}

/**
 * Enroll (12): a student into a group. From a student page the group is chosen; from a group page the
 * student is. Start date defaults to the group's next lesson. Discounts: admins without `discounts` give
 * at most 10% (the database enforces it); a price override needs `billing` and `discounts`.
 */
export function EnrollDialog({
  open,
  onOpenChange,
  student,
  group,
  groups = [],
  students = [],
  canDiscount,
  canOverridePrice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: { id: string; name: string };
  group?: { id: string; name: string };
  groups?: GroupChoice[];
  students?: StudentChoice[];
  canDiscount: boolean;
  canOverridePrice: boolean;
}) {
  const t = useTranslations("enrollments");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const chosen = groups.find((g) => g.id === groupId);
  const full = chosen && chosen.capacity !== null && chosen.count >= chosen.capacity;

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setGroupId("");
          setStudentId("");
        }
        onOpenChange(o);
      }}
      title={t("enrollTitle")}
      description={
        student
          ? t("enrollHint", { name: student.name })
          : group
            ? t("enrollHintGroup", { group: group.name })
            : undefined
      }
      action={enrollAction}
      submitLabel={t("enrollSubmit")}
      successToast={t("enrolled")}
      testId="enroll-dialog"
    >
      {(state) => (
        <>
          {student ? (
            <input type="hidden" name="studentId" value={student.id} />
          ) : (
            <ComboboxRow
              name="studentId"
              label={t("student")}
              state={state}
              options={students.map((s) => ({ value: s.id, label: s.name, hint: s.hint }))}
              value={studentId}
              onChange={setStudentId}
              placeholder={t("chooseStudent")}
            />
          )}
          {group ? (
            <input type="hidden" name="groupId" value={group.id} />
          ) : (
            <ComboboxRow
              name="groupId"
              label={t("group")}
              state={state}
              options={groups.map((g) => ({
                value: g.id,
                label: g.name,
                hint: g.capacity ? `${g.count}/${g.capacity}` : String(g.count),
              }))}
              value={groupId}
              onChange={setGroupId}
              placeholder={t("chooseGroup")}
            />
          )}
          {full ? (
            <Alert data-testid="capacity-warning">
              <AlertTriangle />
              <AlertDescription>
                {t("capacityWarning", { count: chosen.count, capacity: chosen.capacity ?? 0 })}
              </AlertDescription>
            </Alert>
          ) : null}
          <Field
            name="startDate"
            type="date"
            label={t("startDate")}
            hint={t("startDateHint")}
            state={state}
          />
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field
              name="discountPercent"
              inputMode="decimal"
              label={t("discountPercent")}
              hint={canDiscount ? undefined : t("discountCap")}
              state={state}
            />
            <Field name="discountReason" label={t("discountReason")} state={state} />
          </div>
          {canDiscount ? (
            <Field
              name="discountAmount"
              inputMode="decimal"
              label={t("discountAmount")}
              state={state}
            />
          ) : null}
          {canOverridePrice ? (
            <Field
              name="priceOverride"
              inputMode="decimal"
              label={t("priceOverride")}
              hint={t("priceOverrideHint")}
              state={state}
            />
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

type Kind = "freeze" | "transfer" | "end";
const EnrollmentActionsContext = createContext<((kind: Kind, e: EnrollmentRef) => void) | null>(
  null,
);

/**
 * Hosts Freeze / Transfer / End once per page. Ending with "moved to the next level" offers enrolling into
 * a group of that level right away (`onMovedLevel`).
 */
export function EnrollmentActionsProvider({
  groups,
  onMovedLevel,
  children,
}: {
  groups: GroupChoice[];
  onMovedLevel?: (e: EnrollmentRef) => void;
  children: ReactNode;
}) {
  const t = useTranslations("enrollments");
  const [current, setCurrent] = useState<{ kind: Kind; e: EnrollmentRef } | null>(null);
  const [targetId, setTargetId] = useState("");
  const e = current?.e;
  const close = (o: boolean) => {
    if (!o) setCurrent(null);
  };

  const end = async (prev: ActionState, form: FormData) => {
    const result = await endAction(prev, form);
    if (result?.ok && result.data?.reason === "moved_level" && e && onMovedLevel) {
      const ended = e;
      setTimeout(() => onMovedLevel(ended), 0);
    }
    return result;
  };

  return (
    <EnrollmentActionsContext.Provider
      value={(kind, ref) => {
        setTargetId("");
        setCurrent({ kind, e: ref });
      }}
    >
      {children}

      <FormDialog
        open={current?.kind === "freeze"}
        onOpenChange={close}
        title={t("freezeTitle")}
        description={e ? t("freezeHint", { name: e.studentName, group: e.groupName }) : undefined}
        action={freezeAction}
        submitLabel={t("freezeSubmit")}
        successToast={t("frozen")}
        testId="freeze-dialog"
      >
        {(state) =>
          e ? (
            <>
              <input type="hidden" name="enrollmentId" value={e.id} />
              <input type="hidden" name="studentId" value={e.studentId} />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  name="from"
                  type="date"
                  label={t("from")}
                  defaultValue={e.today}
                  state={state}
                  required
                />
                <Field name="to" type="date" label={t("to")} state={state} required />
              </div>
              <Field name="reason" label={t("reason")} state={state} />
            </>
          ) : null
        }
      </FormDialog>

      <FormDialog
        open={current?.kind === "transfer"}
        onOpenChange={close}
        title={t("transferTitle")}
        description={e ? t("transferHint", { name: e.studentName, group: e.groupName }) : undefined}
        action={transferAction}
        submitLabel={t("transferSubmit")}
        successToast={t("transferred")}
        testId="transfer-dialog"
      >
        {(state) =>
          e ? (
            <>
              <input type="hidden" name="enrollmentId" value={e.id} />
              <input type="hidden" name="studentId" value={e.studentId} />
              <ComboboxRow
                name="groupId"
                label={t("toGroup")}
                state={state}
                options={groups
                  .filter((g) => g.id !== e.groupId)
                  .map((g) => ({
                    value: g.id,
                    label: g.name,
                    hint: g.capacity ? `${g.count}/${g.capacity}` : String(g.count),
                  }))}
                value={targetId}
                onChange={setTargetId}
                placeholder={t("chooseGroup")}
              />
              <Field
                name="date"
                type="date"
                label={t("transferDate")}
                hint={t("transferDateHint")}
                defaultValue={e.today}
                state={state}
                required
              />
              <CheckboxField
                name="keepDiscount"
                value="on"
                label={t("keepDiscount")}
                defaultChecked
              />
            </>
          ) : null
        }
      </FormDialog>

      <FormDialog
        open={current?.kind === "end"}
        onOpenChange={close}
        title={t("endTitle")}
        description={e ? t("endHint", { name: e.studentName, group: e.groupName }) : undefined}
        action={end}
        submitLabel={t("endSubmit")}
        successToast={t("ended")}
        testId="end-dialog"
      >
        {(state) =>
          e ? (
            <>
              <input type="hidden" name="enrollmentId" value={e.id} />
              <input type="hidden" name="studentId" value={e.studentId} />
              <Field
                name="endDate"
                type="date"
                label={t("endDate")}
                hint={t("endDateHint")}
                defaultValue={e.today}
                state={state}
                required
              />
              <SelectField
                name="reason"
                label={t("endReason")}
                state={state}
                defaultValue="completed"
                options={(["completed", "dropped", "moved_level"] as const).map((r) => ({
                  value: r,
                  label: t(`reasons.${r}`),
                }))}
              />
              <CheckboxField
                name="credit"
                value="on"
                label={t("creditUnused")}
                hint={t("creditUnusedHint")}
                defaultChecked
              />
            </>
          ) : null
        }
      </FormDialog>
    </EnrollmentActionsContext.Provider>
  );
}

/** Freeze / Transfer / End icons for an enrollment row. */
export function EnrollmentRowActions({ enrollment }: { enrollment: EnrollmentRef }) {
  const t = useTranslations("enrollments");
  const open = useContext(EnrollmentActionsContext);
  if (!open) return null;
  const who = `${enrollment.studentName} · ${enrollment.groupName}`;
  const actions: RowAction[] = [
    {
      key: "freeze",
      label: t("rowFreeze", { who }),
      icon: Snowflake,
      onSelect: () => open("freeze", enrollment),
    },
    {
      key: "transfer",
      label: t("rowTransfer", { who }),
      icon: ArrowRightLeft,
      onSelect: () => open("transfer", enrollment),
    },
    {
      key: "end",
      label: t("rowEnd", { who }),
      icon: CircleStop,
      tone: "destructive",
      onSelect: () => open("end", enrollment),
    },
  ];
  return <RowActions actions={actions} />;
}

/** Toast + open the enroll dialog for next-level groups after "moved to the next level". */
export function useMovedLevel(groups: GroupChoice[]) {
  const t = useTranslations("enrollments");
  const [nextFor, setNextFor] = useState<EnrollmentRef | null>(null);
  const nextGroups = nextFor
    ? groups.filter((g) => g.levelId && g.levelId === nextFor.nextLevelId)
    : [];
  return {
    nextFor,
    nextGroups,
    close: () => setNextFor(null),
    onMovedLevel: (e: EnrollmentRef) => {
      if (e.nextLevelId) setNextFor(e);
      else toast(t("noNextLevel"));
    },
  };
}
