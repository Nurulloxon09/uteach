"use client";

import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import {
  CheckboxField,
  ConfirmDialog,
  Field,
  FormDialog,
  FormMessage,
  RowActions,
  SubmitButton,
} from "@/components/patterns";
import { Textarea } from "@/components/ui/textarea";
import {
  archivePlanAction,
  deletePlanAction,
  savePaymentInstructionsAction,
  savePlanAction,
} from "../actions";

export type PlanFormValues = {
  id: string;
  code: string;
  name: string;
  studentLimit: string;
  branchLimit: string;
  price: string;
  isPublic: boolean;
  sortOrder: string;
};

/** Add or edit a plan. The code is set once; empty limits mean "no limit". */
export function PlanDialog({
  plan,
  trigger,
  open,
  onOpenChange,
}: {
  plan?: PlanFormValues;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("admin.plans");
  const isTrial = plan?.code === "trial";
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? t("editTitle", { name: plan.name }) : t("addTitle")}
      description={t("formHint")}
      action={savePlanAction}
      submitLabel={plan ? t("save") : t("addSubmit")}
      successToast={plan ? t("saved") : t("added")}
      testId="plan-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="planId" value={plan?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="code"
              label={t("code")}
              hint={plan ? t("codeFixed") : t("codeHint")}
              defaultValue={plan?.code}
              disabled={Boolean(plan)}
              state={state}
              required={!plan}
            />
            <Field name="name" label={t("name")} defaultValue={plan?.name} state={state} required />
            <Field
              name="studentLimit"
              type="number"
              min={1}
              label={t("studentLimit")}
              hint={t("noLimitHint")}
              defaultValue={plan?.studentLimit}
              state={state}
            />
            <Field
              name="branchLimit"
              type="number"
              min={1}
              label={t("branchLimit")}
              hint={t("noLimitHint")}
              defaultValue={plan?.branchLimit}
              state={state}
            />
            <Field
              name="price"
              inputMode="decimal"
              label={t("price")}
              defaultValue={plan?.price ?? "0"}
              state={state}
              required
            />
            <Field
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              label={t("sortOrder")}
              defaultValue={plan?.sortOrder ?? "0"}
              state={state}
            />
          </div>
          {isTrial ? null : (
            <CheckboxField
              name="isPublic"
              value="on"
              label={t("isPublic")}
              hint={t("isPublicHint")}
              defaultChecked={plan?.isPublic ?? true}
            />
          )}
        </>
      )}
    </FormDialog>
  );
}

/** Edit, hide / show and delete (only a plan nobody used) on a plan's row. */
export function PlanRowActions({ plan, archived }: { plan: PlanFormValues; archived: boolean }) {
  const t = useTranslations("admin.plans");
  const tc = useTranslations("common");
  const [open, setOpen] = useState<null | "edit" | "archive" | "delete">(null);
  const close = (o: boolean) => !o && setOpen(null);
  const isTrial = plan.code === "trial";
  return (
    <>
      <RowActions
        actions={[
          {
            key: "edit",
            label: t("editRow", { name: plan.name }),
            icon: Pencil,
            onSelect: () => setOpen("edit"),
          },
          ...(isTrial
            ? []
            : [
                {
                  key: "archive",
                  label: archived
                    ? t("restoreRow", { name: plan.name })
                    : t("hideRow", { name: plan.name }),
                  icon: archived ? ArchiveRestore : Archive,
                  onSelect: () => setOpen("archive"),
                },
                {
                  key: "delete",
                  label: t("deleteRow", { name: plan.name }),
                  icon: Trash2,
                  tone: "destructive" as const,
                  onSelect: () => setOpen("delete"),
                },
              ]),
        ]}
      />
      <PlanDialog plan={plan} open={open === "edit"} onOpenChange={close} />
      <ConfirmDialog
        open={open === "archive"}
        onOpenChange={close}
        title={
          archived ? t("restoreTitle", { name: plan.name }) : t("hideTitle", { name: plan.name })
        }
        description={archived ? t("restoreHint") : t("hideHint")}
        confirmLabel={archived ? t("restore") : t("hide")}
        action={archivePlanAction}
        fields={{ planId: plan.id, archived: archived ? "0" : "1" }}
        successToast={archived ? t("restored") : t("hidden")}
      />
      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={close}
        title={t("deleteTitle", { name: plan.name })}
        description={t("deleteHint")}
        confirmLabel={tc("remove")}
        tone="destructive"
        action={deletePlanAction}
        fields={{ planId: plan.id }}
        successToast={t("deleted")}
      />
    </>
  );
}

/** "How to pay" texts owners see on Settings → Subscription, one per language. */
export function PaymentInstructionsForm({ values }: { values: Record<string, string> }) {
  const t = useTranslations("admin.plans");
  const [state, action] = useActionState(savePaymentInstructionsAction, null);
  const languages = [
    { key: "uz", label: t("languages.uz") },
    { key: "ru", label: t("languages.ru") },
    { key: "en", label: t("languages.en") },
  ];
  return (
    <form action={action} className="space-y-4" data-testid="payment-instructions">
      <div className="grid gap-4 lg:grid-cols-3">
        {languages.map((l) => (
          <div key={l.key} className="space-y-2">
            <label htmlFor={`pay-${l.key}`} className="text-sm font-semibold text-foreground">
              {l.label}
            </label>
            <Textarea
              id={`pay-${l.key}`}
              name={l.key}
              rows={5}
              maxLength={2000}
              defaultValue={
                state && !state.ok ? (state.values?.[l.key] ?? "") : (values[l.key] ?? "")
              }
            />
          </div>
        ))}
      </div>
      <FormMessage state={state} success={t("instructionsSaved")} />
      <SubmitButton>{t("saveInstructions")}</SubmitButton>
    </form>
  );
}
