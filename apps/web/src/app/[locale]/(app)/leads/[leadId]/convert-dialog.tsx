"use client";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Field, FormDialog, SegmentedControl, SelectField } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AccountOption } from "@/lib/billing";
import { paymentDefaultsAction } from "../../payments/actions";
import { RecordPaymentDialog, type PaymentStudent } from "../../payments/payment-dialog";
import { convertLeadAction } from "../actions";

export type ConvertGroup = { id: string; label: string; courseId: string };

export type PaymentSetup = {
  accounts: AccountOption[];
  currency: string;
  today: string;
  minDate: string | null;
};

const RELATIONS = ["mother", "father", "parent", "other"] as const;

/** After converting: open the M3 payment dialog for the new student, prefilled with what they owe. */
function FirstPayment({
  studentId,
  name,
  branchId,
  payment,
}: {
  studentId: string;
  name: string;
  branchId: string;
  payment: PaymentSetup;
}) {
  const t = useTranslations("leads.convert");
  const [student, setStudent] = useState<PaymentStudent | null>(null);
  useEffect(() => {
    let live = true;
    void paymentDefaultsAction(studentId).then((d) => {
      if (live && d) setStudent({ id: studentId, name, branchId, ...d });
    });
    return () => {
      live = false;
    };
  }, [studentId, name, branchId]);
  if (!student) return null;
  return (
    <RecordPaymentDialog
      student={student}
      accounts={payment.accounts}
      currency={payment.currency}
      today={payment.today}
      minDate={payment.minDate}
      trigger={
        <Button data-testid="convert-first-payment">
          <Wallet />
          {t("firstPayment")}
        </Button>
      }
    />
  );
}

/**
 * Convert to student (11): who the student is (new from the lead, or an existing student with the same
 * phone), the guardian (re-used by phone), the group and start day, an optional discount. One RPC does it
 * all; then the first payment can be taken right away.
 */
export function ConvertDialog({
  leadId,
  leadName,
  leadPhone,
  branchId,
  students,
  groups,
  defaultCourseId,
  defaultGroupId,
  canDiscount,
  payment,
  open,
  onOpenChange,
  trigger,
}: {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  branchId: string;
  /** Existing students with the lead's phone (duplicate check). */
  students: { id: string; name: string }[];
  groups: ConvertGroup[];
  defaultCourseId: string | null;
  /** The group of the trial the lead attended, if any. */
  defaultGroupId: string | null;
  canDiscount: boolean;
  /** Null when the user can't take payments. */
  payment: PaymentSetup | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  const t = useTranslations("leads.convert");
  const ts = useTranslations("students");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [owner, setOwner] = useState<"student" | "parent">("student");
  const ordered = defaultCourseId
    ? [
        ...groups.filter((g) => g.courseId === defaultCourseId),
        ...groups.filter((g) => g.courseId !== defaultCourseId),
      ]
    : groups;
  const firstGroup = defaultGroupId ?? ordered[0]?.id;

  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name: leadName })}
      description={t("hint")}
      action={convertLeadAction}
      submitLabel={t("submit")}
      testId="convert-dialog"
      success={(state) => {
        const studentId = state.data?.studentId ?? "";
        return (
          <div className="space-y-4" data-testid="convert-done">
            <p className="text-[15px] text-foreground">{t("done", { name: leadName })}</p>
            <div className="flex flex-wrap gap-3">
              {payment && studentId ? (
                <FirstPayment
                  studentId={studentId}
                  name={leadName}
                  branchId={branchId}
                  payment={payment}
                />
              ) : null}
              {studentId ? (
                <Link
                  href={`/students/${studentId}`}
                  className="self-center font-semibold text-primary hover:underline"
                >
                  {t("openStudent")}
                </Link>
              ) : null}
            </div>
          </div>
        );
      }}
    >
      {(state) => (
        <>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="studentMode" value={mode} />
          <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
            <legend className="px-1 text-[15px] font-semibold text-foreground">
              {t("student")}
            </legend>
            {students.length > 0 ? (
              <SegmentedControl
                label={t("student")}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "new", label: t("newStudent") },
                  { value: "existing", label: t("existingStudent") },
                ]}
              />
            ) : null}
            {mode === "existing" ? (
              <SelectField
                name="studentId"
                label={t("existingStudent")}
                state={state}
                defaultValue={students[0]?.id}
                options={students.map((s) => ({ value: s.id, label: s.name }))}
              />
            ) : (
              <>
                <Field
                  name="studentName"
                  label={ts("fields.fullName")}
                  defaultValue={leadName}
                  state={state}
                  required
                />
                {leadPhone ? (
                  <SegmentedControl
                    label={t("phoneOwner")}
                    value={owner}
                    onChange={setOwner}
                    options={[
                      { value: "student", label: t("phoneIsStudent") },
                      { value: "parent", label: t("phoneIsParent") },
                    ]}
                  />
                ) : null}
                <Field
                  key={`student-${owner}`}
                  name="studentPhone"
                  type="tel"
                  inputMode="tel"
                  label={ts("fields.phone")}
                  defaultValue={owner === "student" ? (leadPhone ?? "") : ""}
                  state={state}
                />
              </>
            )}
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
            <legend className="px-1 text-[15px] font-semibold text-foreground">
              {t("guardian")}
            </legend>
            <p className="text-sm text-muted-foreground">{t("guardianHint")}</p>
            <Field name="guardianName" label={ts("guardian.name")} state={state} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                key={`guardian-${owner}`}
                name="guardianPhone"
                type="tel"
                inputMode="tel"
                label={ts("guardian.phone")}
                defaultValue={owner === "parent" ? (leadPhone ?? "") : ""}
                state={state}
              />
              <SelectField
                name="relation"
                label={ts("guardian.relation")}
                state={state}
                defaultValue="parent"
                options={RELATIONS.map((r) => ({ value: r, label: ts(`relations.${r}`) }))}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
            <legend className="px-1 text-[15px] font-semibold text-foreground">{t("group")}</legend>
            <SelectField
              name="groupId"
              label={t("group")}
              placeholder={t("groupPlaceholder")}
              state={state}
              defaultValue={firstGroup}
              options={ordered.map((g) => ({ value: g.id, label: g.label }))}
            />
            <Field
              name="startDate"
              type="date"
              label={t("startDate")}
              hint={t("startDateHint")}
              state={state}
            />
            {canDiscount ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  name="discountPercent"
                  inputMode="decimal"
                  label={t("discountPercent")}
                  state={state}
                />
                <Field name="discountReason" label={t("discountReason")} state={state} />
              </div>
            ) : null}
          </fieldset>
        </>
      )}
    </FormDialog>
  );
}
