"use client";

import { parseMajorUnits } from "@uteach/core";
import { Ban, FileText, HandCoins, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import {
  BalancePreview,
  CheckboxField,
  Field,
  FormDialog,
  RowActions,
  SelectField,
  type RowAction,
} from "@/components/patterns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActionState } from "@/lib/actions";
import {
  adjustBalanceAction,
  voidAdjustmentAction,
  voidChargeAction,
  voidPaymentAction,
  waiveChargeAction,
} from "./actions";
import { useBalanceWords } from "./payment-dialog";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Reason-only dialog for voids and waivers (the database requires the reason and the flag). */
function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  submitLabel,
  successToast,
  id,
  studentId,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  action: Action;
  submitLabel: ReactNode;
  successToast: string;
  id: string;
  studentId: string;
  testId: string;
  children?: ReactNode;
}) {
  const t = useTranslations("billing.void");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      action={action}
      submitLabel={submitLabel}
      successToast={successToast}
      testId={testId}
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="studentId" value={studentId} />
          <Field
            name="reason"
            label={t("reason")}
            placeholder={t("reasonPlaceholder")}
            state={state}
            required
          />
          {children}
        </>
      )}
    </FormDialog>
  );
}

const ICON_LINK =
  "grid size-10 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 sm:size-9";

/** Print links (80 mm / A4) as row icons; plain anchors, since the receipt is a PDF route. */
function ReceiptIcons({ paymentId, receiptNo }: { paymentId: string; receiptNo: string }) {
  const t = useTranslations("billing.receipt");
  const locale = useLocale();
  return (
    <>
      {(["80mm", "a4"] as const).map((size) => {
        const label = `${size === "80mm" ? t("print80") : t("printA4")} · ${receiptNo}`;
        return (
          <Tooltip key={size}>
            <TooltipTrigger asChild>
              <a
                href={`/${locale}/receipts/${paymentId}?size=${size}`}
                target="_blank"
                rel="noopener"
                aria-label={label}
                className={ICON_LINK}
              >
                {size === "80mm" ? (
                  <Printer className="size-[18px]" strokeWidth={1.7} />
                ) : (
                  <FileText className="size-[18px]" strokeWidth={1.7} />
                )}
              </a>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

/** Payment row: print the receipt; void it (`void`). */
export function PaymentRowActions({
  payment,
  studentId,
  canVoid,
}: {
  payment: { id: string; receiptNo: string; voided: boolean };
  studentId: string;
  canVoid: boolean;
}) {
  const t = useTranslations("billing.void");
  const [open, setOpen] = useState(false);
  const actions: RowAction[] =
    canVoid && !payment.voided
      ? [
          {
            key: "void",
            label: t("rowPayment", { receipt: payment.receiptNo }),
            icon: Ban,
            tone: "destructive",
            onSelect: () => setOpen(true),
          },
        ]
      : [];
  return (
    <div className="flex items-center gap-1">
      <ReceiptIcons paymentId={payment.id} receiptNo={payment.receiptNo} />
      {actions.length ? <RowActions actions={actions} /> : null}
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={t("paymentTitle")}
        description={t("paymentHint")}
        action={voidPaymentAction}
        submitLabel={t("paymentSubmit")}
        successToast={t("paymentDone")}
        id={payment.id}
        studentId={studentId}
        testId="void-payment-dialog"
      />
    </div>
  );
}

/** Charge row: waive the unpaid part (`adjustments`); void, optionally reissue (`void`). */
export function ChargeRowActions({
  charge,
  studentId,
  canVoid,
  canAdjust,
}: {
  charge: { id: string; label: string; groupName: string; owed: boolean; voided: boolean };
  studentId: string;
  canVoid: boolean;
  canAdjust: boolean;
}) {
  const t = useTranslations("billing");
  const [open, setOpen] = useState<"void" | "waive" | null>(null);
  if (charge.voided) return null;
  const actions: RowAction[] = [
    ...(canAdjust && charge.owed
      ? [
          {
            key: "waive",
            label: t("adjust.rowWaive", { cycle: charge.label }),
            icon: HandCoins,
            onSelect: () => setOpen("waive"),
          },
        ]
      : []),
    ...(canVoid
      ? [
          {
            key: "void",
            label: t("void.rowCharge", { cycle: charge.label }),
            icon: Ban,
            tone: "destructive" as const,
            onSelect: () => setOpen("void"),
          },
        ]
      : []),
  ];
  const close = (o: boolean) => {
    if (!o) setOpen(null);
  };
  return (
    <>
      <RowActions actions={actions} />
      <ReasonDialog
        open={open === "waive"}
        onOpenChange={close}
        title={t("adjust.waiveTitle")}
        description={t("adjust.waiveHint", { cycle: charge.label, group: charge.groupName })}
        action={waiveChargeAction}
        submitLabel={t("adjust.waiveSubmit")}
        successToast={t("adjust.waiveDone")}
        id={charge.id}
        studentId={studentId}
        testId="waive-dialog"
      />
      <ReasonDialog
        open={open === "void"}
        onOpenChange={close}
        title={t("void.chargeTitle")}
        description={t("void.chargeHint")}
        action={voidChargeAction}
        submitLabel={t("void.chargeSubmit")}
        successToast={t("void.chargeDone")}
        id={charge.id}
        studentId={studentId}
        testId="void-charge-dialog"
      >
        <CheckboxField name="reissue" value="on" label={t("void.reissue")} />
      </ReasonDialog>
    </>
  );
}

/** Adjustment row: void it (`void`). */
export function AdjustmentRowActions({
  adjustmentId,
  studentId,
  canVoid,
}: {
  adjustmentId: string;
  studentId: string;
  canVoid: boolean;
}) {
  const t = useTranslations("billing.void");
  const [open, setOpen] = useState(false);
  if (!canVoid) return null;
  return (
    <>
      <RowActions
        actions={[
          {
            key: "void",
            label: t("rowAdjustment"),
            icon: Ban,
            tone: "destructive",
            onSelect: () => setOpen(true),
          },
        ]}
      />
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={t("adjustmentTitle")}
        action={voidAdjustmentAction}
        submitLabel={t("adjustmentSubmit")}
        successToast={t("adjustmentDone")}
        id={adjustmentId}
        studentId={studentId}
        testId="void-adjustment-dialog"
      />
    </>
  );
}

/** Adjust balance (15): a correction (signed amount) or a write-off of the whole debt, with a reason. */
export function AdjustBalanceDialog({
  trigger,
  studentId,
  balance,
  currency,
}: {
  trigger: ReactNode;
  studentId: string;
  /** Minor units; positive = credit. */
  balance: string;
  currency: string;
}) {
  const t = useTranslations("billing.adjust");
  const tr = useTranslations("billing.record");
  const describe = useBalanceWords(currency);
  const [kind, setKind] = useState<"correction" | "write_off">("correction");
  const [amount, setAmount] = useState("");

  const before = BigInt(balance);
  let after: bigint | null = null;
  if (kind === "write_off" && amount.trim() === "") {
    after = before < 0n ? 0n : null;
  } else {
    try {
      const negative = /^\s*[-−]/.test(amount);
      const minor = parseMajorUnits(amount.replace(/^\s*[-−+]\s*/, ""));
      if (minor > 0n && !(negative && kind === "write_off")) {
        after = before + (negative ? -minor : minor);
      }
    } catch {
      after = null;
    }
  }

  return (
    <FormDialog
      trigger={trigger}
      onOpenChange={(o) => {
        if (o) {
          setKind("correction");
          setAmount("");
        }
      }}
      title={t("title")}
      description={t("hint")}
      action={adjustBalanceAction}
      submitLabel={t("submit")}
      successToast={t("done")}
      testId="adjust-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="studentId" value={studentId} />
          <SelectField
            name="kind"
            label={t("kind")}
            state={state}
            value={kind}
            onValueChange={(v) => setKind(v as typeof kind)}
            options={(["correction", "write_off"] as const).map((k) => ({
              value: k,
              label: t(`kinds.${k}`),
            }))}
          />
          <Field
            name="amount"
            inputMode="decimal"
            label={t("amount")}
            hint={kind === "correction" ? t("correctionHint") : t("writeOffHint")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            state={state}
          />
          <Field name="reason" label={t("reason")} state={state} required />
          <BalancePreview
            before={balance}
            after={after}
            beforeLabel={tr("now")}
            afterLabel={t("after")}
            describe={describe}
          />
        </>
      )}
    </FormDialog>
  );
}
