"use client";

import { parseMajorUnits } from "@uteach/core";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import {
  BalancePreview,
  Combobox,
  Field,
  FieldError,
  FormDialog,
  SelectField,
} from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AccountKind, AccountOption } from "@/lib/billing";
import { formatMinor } from "@/lib/money";
import { minorToInput } from "@/lib/validation";
import { paymentDefaultsAction, recordPaymentAction } from "./actions";

type Method = "cash" | "card" | "transfer";
const METHODS: Method[] = ["cash", "card", "transfer"];
/** Default account kind per method (record_payment picks the same one). */
const METHOD_ACCOUNT: Record<Method, AccountKind> = {
  cash: "cash",
  card: "terminal",
  transfer: "bank",
};

export type PaymentStudent = {
  id: string;
  name: string;
  branchId: string;
  /** Minor units; positive = credit. */
  balance: string;
  /** Primary guardian's name, the default payer. */
  payer: string;
};

export type StudentPick = { id: string; name: string; hint?: string; branchId: string };

/** "Debt 540 000 so'm" / "Credit …" / "Settled": words, so the sign is never the only cue. */
export function useBalanceWords(currency: string) {
  const t = useTranslations("billing");
  const locale = useLocale();
  return (minor: bigint): string =>
    minor < 0n
      ? t("debt", { amount: formatMinor(-minor, currency, locale) })
      : minor > 0n
        ? t("credit", { amount: formatMinor(minor, currency, locale) })
        : t("settled");
}

/** Links to the printable receipt PDFs (80 mm thermal and A4), opened in a new tab. */
export function ReceiptLinks({ paymentId, className }: { paymentId: string; className?: string }) {
  const t = useTranslations("billing.receipt");
  const locale = useLocale();
  return (
    <div className={className ?? "flex flex-wrap gap-3"}>
      {(["80mm", "a4"] as const).map((size) => (
        <a
          key={size}
          href={`/${locale}/receipts/${paymentId}?size=${size}`}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "outline" })}
          data-testid={`receipt-${size}`}
        >
          <Printer />
          {size === "80mm" ? t("print80") : t("printA4")}
        </a>
      ))}
    </div>
  );
}

/**
 * Record payment (15): student → amount (prefilled with the debt) → method → account (defaults by method) →
 * date (up to 7 days back without `void`) → payer → note, with the resulting balance shown before saving. On
 * success it shows the receipt number and the print links.
 */
export function RecordPaymentDialog({
  trigger,
  student,
  students = [],
  accounts,
  currency,
  today,
  minDate,
}: {
  trigger: ReactNode;
  /** Fixed student (student profile, debtors); otherwise the dialog asks for one from `students`. */
  student?: PaymentStudent;
  students?: StudentPick[];
  accounts: AccountOption[];
  currency: string;
  today: string;
  /** Earliest date offered (null = any, for staff with `void`). */
  minDate: string | null;
}) {
  const t = useTranslations("billing.record");
  const tm = useTranslations("billing.methods");
  const describe = useBalanceWords(currency);
  const [picked, setPicked] = useState<PaymentStudent | null>(student ?? null);
  const [pickedId, setPickedId] = useState(student?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [loading, startLoading] = useTransition();

  const reset = () => {
    setPicked(student ?? null);
    setPickedId(student?.id ?? "");
    setMethod("cash");
    setAmount(student ? owedInput(student.balance) : "");
  };

  const pick = (id: string) => {
    setPickedId(id);
    setPicked(null);
    const s = students.find((x) => x.id === id);
    if (!s) return;
    startLoading(async () => {
      const defaults = await paymentDefaultsAction(id);
      if (!defaults) return;
      setPicked({ id, name: s.name, branchId: s.branchId, ...defaults });
      setAmount(owedInput(defaults.balance));
    });
  };

  let after: bigint | null = null;
  if (picked) {
    try {
      const minor = parseMajorUnits(amount);
      if (minor > 0n) after = BigInt(picked.balance) + minor;
    } catch {
      after = null;
    }
  }
  const accountOptions = accounts.filter(
    (a) =>
      a.kind === METHOD_ACCOUNT[method] &&
      (a.branchId === null || !picked || a.branchId === picked.branchId),
  );

  return (
    <FormDialog
      trigger={trigger}
      onOpenChange={(o) => {
        if (o) reset();
      }}
      title={t("title")}
      description={student ? t("hint", { name: student.name }) : t("hintPick")}
      action={recordPaymentAction}
      submitLabel={t("submit")}
      testId="payment-dialog"
      success={(state) => (
        <div className="space-y-4" data-testid="payment-recorded">
          <p className="text-[15px] font-semibold text-foreground">
            {t("recorded", { receiptNo: state.data?.receiptNo ?? "" })}
          </p>
          {state.data?.balance ? (
            <p className="text-sm text-muted-foreground">
              {t("now")}: {describe(BigInt(state.data.balance))}
            </p>
          ) : null}
          {state.data?.paymentId ? <ReceiptLinks paymentId={state.data.paymentId} /> : null}
        </div>
      )}
    >
      {(state) => (
        <>
          {student ? (
            <input type="hidden" name="studentId" value={student.id} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="field-studentId">{t("student")}</Label>
              <Combobox
                id="field-studentId"
                name="studentId"
                options={students.map((s) => ({ value: s.id, label: s.name, hint: s.hint }))}
                value={pickedId}
                onValueChange={pick}
                placeholder={t("studentPlaceholder")}
                searchPlaceholder={t("studentSearch")}
                emptyText={t("studentEmpty")}
              />
              <FieldError name="studentId" state={state} />
            </div>
          )}
          <Field
            name="amount"
            inputMode="decimal"
            label={t("amount")}
            hint={t("amountHint")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
            state={state}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="method"
              label={t("method")}
              state={state}
              value={method}
              onValueChange={(v) => setMethod(v as Method)}
              options={METHODS.map((m) => ({ value: m, label: tm(m) }))}
            />
            <SelectField
              key={method}
              name="accountId"
              label={t("account")}
              state={state}
              defaultValue="default"
              options={[
                { value: "default", label: t("accountDefault") },
                ...accountOptions.map((a) => ({ value: a.id, label: a.label })),
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="paidAt"
              type="date"
              label={t("paidAt")}
              hint={minDate ? t("paidAtHint") : undefined}
              defaultValue={today}
              min={minDate ?? undefined}
              max={today}
              state={state}
              required
            />
            <Field
              key={picked?.id ?? "none"}
              name="payerName"
              label={t("payer")}
              placeholder={t("payerPlaceholder")}
              defaultValue={picked?.payer ?? ""}
              state={state}
            />
          </div>
          <Field name="note" label={t("note")} state={state} />
          {picked ? (
            <BalancePreview
              before={picked.balance}
              after={after}
              beforeLabel={t("now")}
              afterLabel={t("after")}
              describe={describe}
            />
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

/** What is owed now, as the amount input shows it ("" when nothing is owed). */
function owedInput(balance: string): string {
  const value = BigInt(balance);
  return value < 0n ? minorToInput(-value) : "";
}
