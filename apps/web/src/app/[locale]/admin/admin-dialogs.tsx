"use client";

import {
  Ban,
  CalendarPlus,
  CircleCheck,
  Eye,
  KeyRound,
  Layers,
  ReceiptText,
  ToggleLeft,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { ConfirmDialog, Field, FormDialog, RowActions, SelectField } from "@/components/patterns";
import { Textarea } from "@/components/ui/textarea";
import {
  adminSetPasswordAction,
  extendTrialAction,
  issueInvoiceAction,
  markInvoicePaidAction,
  setCenterPlanAction,
  setCenterStatusAction,
  voidInvoiceAction,
} from "./actions";

export type Option = { value: string; label: string };

const STATUSES = ["trial", "active", "past_due", "read_only", "cancelled"] as const;

/** Row actions of a center on /admin/centers: support view, extend trial, plan, status, invoice. */
export function CenterRowActions({
  center,
  plans,
  invoicePlans,
  defaultPeriod,
}: {
  center: { id: string; name: string; status: string; planId: string; canExtend: boolean };
  plans: Option[];
  /** Plans an invoice can be for (not the trial). */
  invoicePlans: Option[];
  defaultPeriod: { start: string; end: string };
}) {
  const t = useTranslations("admin.centers");
  const [open, setOpen] = useState<null | "trial" | "plan" | "status" | "invoice">(null);
  const close = (o: boolean) => !o && setOpen(null);

  return (
    <>
      <RowActions
        actions={[
          {
            key: "view",
            label: t("supportView", { name: center.name }),
            icon: Eye,
            href: `/admin/centers/${center.id}`,
          },
          {
            key: "trial",
            label: t("extendTrial"),
            icon: CalendarPlus,
            disabled: !center.canExtend,
            onSelect: () => setOpen("trial"),
          },
          { key: "plan", label: t("changePlan"), icon: Layers, onSelect: () => setOpen("plan") },
          {
            key: "status",
            label: t("setStatus"),
            icon: ToggleLeft,
            onSelect: () => setOpen("status"),
          },
          {
            key: "invoice",
            label: t("issueInvoice"),
            icon: ReceiptText,
            onSelect: () => setOpen("invoice"),
          },
        ]}
      />
      <CenterFormDialog
        open={open === "trial"}
        onOpenChange={close}
        title={t("extendTitle", { name: center.name })}
        description={t("extendHint")}
        action={extendTrialAction}
        submitLabel={t("extendSubmit")}
        successToast={t("extended")}
        centerId={center.id}
        testId="extend-trial-dialog"
      >
        {(state) => (
          <Field
            name="days"
            type="number"
            min={1}
            max={90}
            label={t("days")}
            defaultValue="7"
            state={state}
            required
          />
        )}
      </CenterFormDialog>
      <CenterFormDialog
        open={open === "plan"}
        onOpenChange={close}
        title={t("planTitle", { name: center.name })}
        description={t("planHint")}
        action={setCenterPlanAction}
        submitLabel={t("save")}
        successToast={t("planChanged")}
        centerId={center.id}
        testId="center-plan-dialog"
      >
        {(state) => (
          <SelectField
            name="planId"
            label={t("plan")}
            state={state}
            defaultValue={plans.some((p) => p.value === center.planId) ? center.planId : undefined}
            options={plans}
          />
        )}
      </CenterFormDialog>
      <StatusDialog open={open === "status"} onOpenChange={close} center={center} />
      <IssueInvoiceDialog
        open={open === "invoice"}
        onOpenChange={close}
        centers={[{ value: center.id, label: center.name }]}
        plans={invoicePlans}
        defaultCenterId={center.id}
        defaultPlanId={center.planId}
        defaultPeriod={defaultPeriod}
      />
    </>
  );
}

function StatusDialog({
  open,
  onOpenChange,
  center,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  center: { id: string; name: string; status: string };
}) {
  const t = useTranslations("admin.centers");
  const ts = useTranslations("centerStatus");
  return (
    <CenterFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("statusTitle", { name: center.name })}
      description={t("statusHint")}
      action={setCenterStatusAction}
      submitLabel={t("save")}
      successToast={t("statusChanged")}
      centerId={center.id}
      testId="center-status-dialog"
    >
      {(state) => (
        <SelectField
          name="status"
          label={t("status")}
          state={state}
          defaultValue={center.status}
          options={STATUSES.map((s) => ({ value: s, label: ts(s) }))}
        />
      )}
    </CenterFormDialog>
  );
}

/** A FormDialog that sends the center's id along. */
function CenterFormDialog({
  centerId,
  children,
  ...props
}: Omit<Parameters<typeof FormDialog>[0], "children"> & {
  centerId: string;
  children: Parameters<typeof FormDialog>[0]["children"];
}) {
  return (
    <FormDialog {...props}>
      {(state) => (
        <>
          <input type="hidden" name="centerId" value={centerId} />
          {children(state)}
        </>
      )}
    </FormDialog>
  );
}

/** "Issue invoice": center, plan, period and an amount (empty = the plan's price). */
export function IssueInvoiceDialog({
  centers,
  plans,
  defaultCenterId,
  defaultPlanId,
  defaultPeriod,
  trigger,
  open,
  onOpenChange,
}: {
  centers: Option[];
  plans: Option[];
  defaultCenterId?: string;
  defaultPlanId?: string;
  defaultPeriod: { start: string; end: string };
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("admin.invoices");
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("issueTitle")}
      description={t("issueHint")}
      action={issueInvoiceAction}
      submitLabel={t("issueSubmit")}
      successToast={t("issued")}
      testId="issue-invoice-dialog"
    >
      {(state) => (
        <>
          <SelectField
            name="centerId"
            label={t("center")}
            state={state}
            defaultValue={defaultCenterId ?? centers[0]?.value}
            options={centers}
          />
          <SelectField
            name="planId"
            label={t("plan")}
            state={state}
            defaultValue={
              plans.some((p) => p.value === defaultPlanId) ? defaultPlanId : plans[0]?.value
            }
            options={plans}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="periodStart"
              type="date"
              label={t("periodStart")}
              defaultValue={defaultPeriod.start}
              state={state}
              required
            />
            <Field
              name="periodEnd"
              type="date"
              label={t("periodEnd")}
              defaultValue={defaultPeriod.end}
              state={state}
              required
            />
          </div>
          <Field
            name="amount"
            inputMode="decimal"
            label={t("amount")}
            hint={t("amountHint")}
            state={state}
          />
        </>
      )}
    </FormDialog>
  );
}

/** Row actions of an issued invoice: mark paid (with a note) or void. */
export function InvoiceRowActions({
  invoice,
}: {
  invoice: { id: string; number: string; issued: boolean };
}) {
  const t = useTranslations("admin.invoices");
  const [open, setOpen] = useState<null | "paid" | "void">(null);
  if (!invoice.issued) return null;
  return (
    <>
      <RowActions
        actions={[
          {
            key: "paid",
            label: t("markPaid", { number: invoice.number }),
            icon: CircleCheck,
            onSelect: () => setOpen("paid"),
          },
          {
            key: "void",
            label: t("void", { number: invoice.number }),
            icon: Ban,
            tone: "destructive",
            onSelect: () => setOpen("void"),
          },
        ]}
      />
      <FormDialog
        open={open === "paid"}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t("paidTitle", { number: invoice.number })}
        description={t("paidHint")}
        action={markInvoicePaidAction}
        submitLabel={t("paidSubmit")}
        successToast={t("paid")}
        testId="invoice-paid-dialog"
      >
        {(state) => (
          <div className="space-y-2">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label htmlFor="invoice-note" className="text-sm font-semibold text-foreground">
              {t("note")}
            </label>
            <Textarea
              id="invoice-note"
              name="note"
              rows={3}
              maxLength={500}
              placeholder={t("notePlaceholder")}
              defaultValue={state && !state.ok ? (state.values?.note ?? "") : ""}
            />
          </div>
        )}
      </FormDialog>
      <ConfirmDialog
        open={open === "void"}
        onOpenChange={(o) => !o && setOpen(null)}
        title={t("voidTitle", { number: invoice.number })}
        description={t("voidHint")}
        confirmLabel={t("voidSubmit")}
        tone="destructive"
        action={voidInvoiceAction}
        fields={{ invoiceId: invoice.id }}
        successToast={t("voided")}
      />
    </>
  );
}

/** "Set new password" for one person of a center on the support view (M7f). */
export function AdminPasswordAction({ profileId, name }: { profileId: string; name: string }) {
  const t = useTranslations("auth.setPassword");
  const [open, setOpen] = useState(false);

  return (
    <>
      <RowActions
        actions={[
          {
            key: "password",
            label: t("row", { name }),
            icon: KeyRound,
            onSelect: () => setOpen(true),
          },
        ]}
      />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title", { name })}
        description={t("description")}
        action={adminSetPasswordAction}
        submitLabel={t("submit")}
        successToast={t("done", { name })}
        testId="set-password-dialog"
      >
        {(state) => (
          <>
            <input type="hidden" name="profileId" value={profileId} />
            <Field
              name="password"
              type="text"
              autoComplete="off"
              label={t("password")}
              hint={t("hint")}
              state={state}
              required
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
