import { addDays, todayIn } from "@uteach/core";
import { Plus, Receipt, Scale, Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  MoneyAmount,
  PageAction,
  Section,
  StatusChip,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { loadAccounts, loadStudentBilling, type CycleRow, type PaymentRow } from "@/lib/billing";
import type { CenterContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import {
  AdjustBalanceDialog,
  AdjustmentRowActions,
  ChargeRowActions,
  PaymentRowActions,
} from "../../payments/billing-actions";
import { RecordPaymentDialog } from "../../payments/payment-dialog";

/**
 * Student profile → Payments (15): balance with "Record payment" / "Adjust balance", the lesson cycles with
 * lessons used and what is still owed (FIFO), payments with their receipts, and adjustments. Staff with only
 * `payments` see the balance and payments; charges and adjustments need `billing`.
 */
export async function BillingPanel({
  ctx,
  student,
}: {
  ctx: CenterContext;
  student: { id: string; name: string; branchId: string; payer: string; archived: boolean };
}) {
  const t = await getTranslations("billing");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const locale = await getLocale();
  const [billing, accounts] = await Promise.all([
    loadStudentBilling(ctx, student.id),
    loadAccounts(ctx),
  ]);
  const currency = ctx.center.currency;
  const money = (minor: string | bigint) => formatMinor(minor, currency, locale);
  const day = (d: string) =>
    format.dateTime(dayAsDate(d), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const inBranch = ctx.can.inBranch(student.branchId);
  const canPay = ctx.can.payments && inBranch && !student.archived;
  const canVoid = ctx.can.void && inBranch;
  const canAdjust = ctx.can.adjustments && inBranch;
  const balance = billing.balance;
  const today = todayIn(ctx.center.timezone);

  const balanceWords =
    balance === null
      ? "—"
      : BigInt(balance) < 0n
        ? t("debt", { amount: money(-BigInt(balance)) })
        : BigInt(balance) > 0n
          ? t("credit", { amount: money(balance) })
          : t("settled");

  const cycleLabel = (c: CycleRow) =>
    c.cycleNo ? t("cycles.cycle", { no: c.cycleNo }) : t("cycles.manual");
  const cycleState = (c: CycleRow) => {
    if (c.voided) return <StatusChip tone="muted">{t("cycles.void")}</StatusChip>;
    if (BigInt(c.outstanding) === 0n)
      return <StatusChip tone="success">{t("cycles.paid")}</StatusChip>;
    if (c.daysOverdue > 0)
      return (
        <StatusChip tone="destructive">{t("cycles.overdue", { days: c.daysOverdue })}</StatusChip>
      );
    return (
      <StatusChip tone="warning">
        {t("cycles.owed")} {money(c.outstanding)}
      </StatusChip>
    );
  };
  const lessonsOf = (c: CycleRow) => (
    <div className="space-y-0.5">
      <p>{t("cycles.lessons", { used: c.used ?? 0, total: c.cycleLessons ?? 0 })}</p>
      <p className="text-sm text-muted-foreground">
        {c.firstLessonDate && c.firstLessonDate > today
          ? t("cycles.notStarted", { date: day(c.firstLessonDate) })
          : c.expectedLastDate
            ? t("cycles.ends", { date: day(c.expectedLastDate) })
            : day(c.startDate)}
      </p>
    </div>
  );
  const amountOf = (c: CycleRow) => (
    <div className="space-y-0.5">
      <MoneyAmount minor={c.amount} currency={currency} tone={c.voided ? "muted" : "plain"} />
      {c.cycleLessons && !c.isManual ? (
        <p className="text-sm text-muted-foreground">
          {t("cycles.calc", {
            lessons: c.cycleLessons,
            price: money(c.priceAmount),
            amount: money(c.amount),
          })}
        </p>
      ) : null}
    </div>
  );
  const cycleActions = (c: CycleRow) => (
    <ChargeRowActions
      charge={{
        id: c.id,
        label: cycleLabel(c),
        groupName: c.groupName,
        owed: BigInt(c.outstanding) > 0n,
        voided: c.voided,
      }}
      studentId={student.id}
      canVoid={canVoid}
      canAdjust={canAdjust}
    />
  );

  const paidAt = (p: PaymentRow) =>
    format.dateTime(new Date(p.paidAt), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: ctx.center.timezone,
    });
  const paymentAmount = (p: PaymentRow) => (
    <div className="flex flex-wrap items-center gap-2">
      <MoneyAmount minor={p.amount} currency={currency} tone={p.voided ? "muted" : "plain"} />
      {p.voided ? <StatusChip tone="muted">{t("payments.voided")}</StatusChip> : null}
    </div>
  );
  const paymentActions = (p: PaymentRow) => (
    <PaymentRowActions
      payment={{ id: p.id, receiptNo: p.receiptNo, voided: p.voided }}
      studentId={student.id}
      canVoid={canVoid}
    />
  );

  return (
    <div className="space-y-5" data-testid="billing-panel">
      <Section
        title={t("balance")}
        tools={
          <>
            {canAdjust && balance !== null ? (
              <AdjustBalanceDialog
                studentId={student.id}
                balance={balance}
                currency={currency}
                trigger={
                  <Button variant="outline" size="lg">
                    <Scale />
                    {t("adjust.button")}
                  </Button>
                }
              />
            ) : null}
            {canPay && balance !== null ? (
              <RecordPaymentDialog
                student={{
                  id: student.id,
                  name: student.name,
                  branchId: student.branchId,
                  balance,
                  payer: student.payer,
                }}
                accounts={accounts}
                currency={currency}
                today={today}
                minDate={ctx.can.void ? null : addDays(today, -7)}
                trigger={<PageAction icon={Plus}>{t("record.button")}</PageAction>}
              />
            ) : null}
          </>
        }
      >
        <p
          className={
            balance !== null && BigInt(balance) < 0n
              ? "text-2xl font-bold text-destructive"
              : balance !== null && BigInt(balance) > 0n
                ? "text-2xl font-bold text-success"
                : "text-2xl font-bold text-foreground"
          }
          data-testid="student-balance"
        >
          {balanceWords}
        </p>
      </Section>

      {ctx.can.billing ? (
        <Section title={t("cycles.title")}>
          <DataTable
            testId="cycle-row"
            rows={billing.cycles}
            rowKey={(c) => c.id}
            empty={
              <EmptyState
                icon={Wallet}
                title={t("cycles.emptyTitle")}
                hint={t("cycles.emptyHint")}
              />
            }
            columns={[
              {
                key: "cycle",
                header: t("cycles.colCycle"),
                cell: (c) => (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">{cycleLabel(c)}</p>
                    <p className="text-sm text-muted-foreground">{c.groupName}</p>
                  </div>
                ),
              },
              { key: "lessons", header: t("cycles.colLessons"), cell: lessonsOf },
              { key: "due", header: t("cycles.colDue"), cell: (c) => day(c.dueDate) },
              { key: "amount", header: t("cycles.amount"), cell: amountOf },
              { key: "state", header: tc("status"), cell: cycleState },
              { key: "actions", header: tc("actions"), cell: cycleActions, className: "w-28" },
            ]}
            mobileCard={(c) => (
              <MobileRecord
                title={`${cycleLabel(c)} · ${c.groupName}`}
                subtitle={t("cycles.lessons", { used: c.used ?? 0, total: c.cycleLessons ?? 0 })}
                status={cycleState(c)}
                fields={[
                  { label: t("cycles.amount"), value: money(c.amount) },
                  { label: t("cycles.colDue"), value: day(c.dueDate) },
                ]}
                actions={cycleActions(c)}
              />
            )}
          />
        </Section>
      ) : null}

      <Section title={t("payments.title")}>
        <DataTable
          testId="payment-row"
          rows={billing.payments}
          rowKey={(p) => p.id}
          empty={
            <EmptyState
              icon={Receipt}
              title={t("payments.emptyTitle")}
              hint={t("payments.emptyHint")}
            />
          }
          columns={[
            { key: "date", header: t("payments.date"), cell: paidAt },
            {
              key: "receipt",
              header: t("payments.receipt"),
              cell: (p) => <span className="font-medium tabular-nums">{p.receiptNo}</span>,
            },
            {
              key: "method",
              header: t("payments.method"),
              cell: (p) => (
                <div className="space-y-0.5">
                  <p>{t(`methods.${p.method}`)}</p>
                  <p className="text-sm text-muted-foreground">{p.accountLabel}</p>
                </div>
              ),
            },
            { key: "amount", header: t("payments.amount"), cell: paymentAmount },
            {
              key: "by",
              header: t("payments.receivedBy"),
              cell: (p) => p.receivedBy ?? "—",
            },
            { key: "actions", header: tc("actions"), cell: paymentActions, className: "w-36" },
          ]}
          mobileCard={(p) => (
            <MobileRecord
              title={money(p.amount)}
              subtitle={`${paidAt(p)} · ${p.receiptNo}`}
              status={
                p.voided ? <StatusChip tone="muted">{t("payments.voided")}</StatusChip> : undefined
              }
              fields={[{ label: t("payments.method"), value: t(`methods.${p.method}`) }]}
              actions={paymentActions(p)}
            />
          )}
        />
      </Section>

      {ctx.can.billing && billing.adjustments.length > 0 ? (
        <Section title={t("adjustments.title")}>
          <DataTable
            testId="adjustment-row"
            rows={billing.adjustments}
            rowKey={(a) => a.id}
            columns={[
              {
                key: "date",
                header: t("payments.date"),
                cell: (a) =>
                  format.dateTime(new Date(a.createdAt), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: ctx.center.timezone,
                  }),
              },
              {
                key: "kind",
                header: t("adjust.kind"),
                cell: (a) => (
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {t(`adjustments.kinds.${a.kind}`)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {a.kind === "unused_lessons" && a.details.unused
                        ? t("adjustments.unusedDetail", {
                            unused: a.details.unused,
                            cycleLessons: a.details.cycleLessons ?? 0,
                          })
                        : (a.reason ?? "")}
                    </p>
                  </div>
                ),
              },
              {
                key: "amount",
                header: t("payments.amount"),
                cell: (a) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <MoneyAmount
                      minor={a.amount}
                      currency={currency}
                      tone={a.voided ? "muted" : "balance"}
                    />
                    {a.voided ? <StatusChip tone="muted">{t("payments.voided")}</StatusChip> : null}
                  </div>
                ),
              },
              { key: "by", header: t("payments.receivedBy"), cell: (a) => a.createdBy ?? "—" },
              {
                key: "actions",
                header: tc("actions"),
                className: "w-28",
                cell: (a) =>
                  a.voided ? null : (
                    <AdjustmentRowActions
                      adjustmentId={a.id}
                      studentId={student.id}
                      canVoid={canVoid}
                    />
                  ),
              },
            ]}
            mobileCard={(a) => (
              <MobileRecord
                title={t(`adjustments.kinds.${a.kind}`)}
                subtitle={a.reason ?? undefined}
                status={
                  a.voided ? (
                    <StatusChip tone="muted">{t("payments.voided")}</StatusChip>
                  ) : undefined
                }
                fields={[{ label: t("payments.amount"), value: money(a.amount) }]}
                actions={
                  a.voided ? undefined : (
                    <AdjustmentRowActions
                      adjustmentId={a.id}
                      studentId={student.id}
                      canVoid={canVoid}
                    />
                  )
                }
              />
            )}
          />
        </Section>
      ) : null}
    </div>
  );
}
