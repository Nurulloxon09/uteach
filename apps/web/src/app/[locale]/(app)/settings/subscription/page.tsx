import { readOnlyAt } from "@uteach/core";
import type { CenterStatus } from "@uteach/db";
import { CalendarClock, CreditCard, Building2, UsersRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  MoneyAmount,
  PageHeader,
  Section,
  StatTiles,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("subscription");
  return { title: t("title") };
}

const STATUS_TONE: Record<CenterStatus, ChipTone> = {
  trial: "primary",
  active: "success",
  past_due: "warning",
  read_only: "destructive",
  cancelled: "muted",
};

type InvoiceStatus = "draft" | "issued" | "paid" | "void";

const INVOICE_TONE: Record<InvoiceStatus, ChipTone> = {
  draft: "muted",
  issued: "warning",
  paid: "success",
  void: "muted",
};

type Usage = {
  activeStudents: number;
  studentLimit: number | null;
  branches: number;
  branchLimit: number | null;
  planCode: string;
  planName: string;
};

type Invoice = {
  id: string;
  number: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  paid_at: string | null;
};

/**
 * Settings → Subscription (10, M7a): the center's plan and status, usage against the limits, how to pay, the
 * public plans and uteach's invoices. Owners only; changing the plan goes through uteach (manual invoices).
 */
export default async function SubscriptionPage() {
  const ctx = await requireAdminContext();
  if (ctx.membership.role !== "owner") notFound();
  const t = await getTranslations("subscription");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const ts = await getTranslations("centerStatus");
  const format = await getFormatter();
  const supabase = await createClient();

  const [
    { data: usageData },
    { data: center },
    { data: plans },
    { data: invoices },
    { data: setting },
  ] = await Promise.all([
    supabase.rpc("center_usage", { p_center_id: ctx.center.id }),
    supabase.from("centers").select("paid_until").eq("id", ctx.center.id).single(),
    supabase
      .from("plans")
      .select("id, code, name, student_limit, branch_limit, price_amount, currency")
      .eq("is_public", true)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("platform_invoices")
      .select("id, number, period_start, period_end, amount, currency, status, paid_at")
      .eq("center_id", ctx.center.id)
      .order("period_start", { ascending: false })
      .limit(24),
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_instructions")
      .maybeSingle(),
  ]);
  const usage = usageData as Usage | null;
  const status = ctx.center.status;
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const instant = (d: string) =>
    format.dateTime(new Date(d), { dateStyle: "medium", timeZone: ctx.center.timezone });
  const limit = (n: number | null) => (n === null ? t("unlimited") : format.number(n));
  // "15 of 50"; just "1" when the plan has no limit.
  const used = (n: number, max: number | null) =>
    max === null
      ? format.number(n)
      : t("used", { used: format.number(n), limit: format.number(max) });
  const instructions = (setting?.value as Record<string, string> | undefined)?.[ctx.locale]?.trim();

  // What the status means for this center, in one line.
  const statusLine =
    status === "trial" && ctx.center.trialEndsAt
      ? t("trialUntil", { date: instant(ctx.center.trialEndsAt) })
      : status === "active" && center?.paid_until
        ? t("paidUntil", { date: day(center.paid_until) })
        : status === "past_due" && ctx.center.pastDueSince
          ? t("graceUntil", {
              date: instant(readOnlyAt(new Date(ctx.center.pastDueSince)).toISOString()),
            })
          : status === "read_only"
            ? t("readOnlyHint")
            : null;

  const invoiceRows = (invoices ?? []) as Invoice[];
  const period = (r: Invoice) => t("period", { from: day(r.period_start), to: day(r.period_end) });
  const invoiceStatus = (r: Invoice) => (
    <StatusChip tone={INVOICE_TONE[r.status]}>{t(`invoiceStatus.${r.status}`)}</StatusChip>
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: tn("settings") },
          { label: t("title") },
        ]}
      />

      <Section
        title={t("planTitle")}
        description={statusLine ?? undefined}
        tools={<StatusChip tone={STATUS_TONE[status]}>{ts(status)}</StatusChip>}
      >
        <StatTiles
          items={[
            {
              key: "plan",
              label: t("plan"),
              value: usage?.planCode === "trial" ? t("trialPlan") : (usage?.planName ?? "—"),
              icon: CreditCard,
              tone: "purple",
            },
            {
              key: "students",
              label: t("students"),
              value: used(usage?.activeStudents ?? 0, usage?.studentLimit ?? null),
              icon: UsersRound,
              tone: "blue",
            },
            {
              key: "branches",
              label: t("branches"),
              value: used(usage?.branches ?? 0, usage?.branchLimit ?? null),
              icon: Building2,
              tone: "green",
            },
            {
              key: "until",
              label: status === "trial" ? t("trialEnds") : t("paidThrough"),
              value:
                status === "trial" && ctx.center.trialEndsAt
                  ? instant(ctx.center.trialEndsAt)
                  : center?.paid_until
                    ? day(center.paid_until)
                    : "—",
              icon: CalendarClock,
              tone: "orange",
            },
          ]}
        />
      </Section>

      <Section title={t("payTitle")} description={t("payHint")}>
        <p
          className="whitespace-pre-line text-[15px] text-secondary-foreground"
          data-testid="payment-instructions"
        >
          {instructions || t("payFallback")}
        </p>
      </Section>

      <Section title={t("plansTitle")} description={t("plansHint")}>
        <DataTable
          testId="plan-row"
          rows={plans ?? []}
          rowKey={(p) => p.id}
          columns={[
            {
              key: "name",
              header: t("plan"),
              cell: (p) => (
                <span className="font-medium text-foreground">
                  {p.name}
                  {p.code === usage?.planCode ? (
                    <StatusChip tone="primary" className="ml-2">
                      {t("current")}
                    </StatusChip>
                  ) : null}
                </span>
              ),
            },
            { key: "students", header: t("students"), cell: (p) => limit(p.student_limit) },
            { key: "branches", header: t("branches"), cell: (p) => limit(p.branch_limit) },
            {
              key: "price",
              header: t("pricePerMonth"),
              cell: (p) => <MoneyAmount minor={p.price_amount} currency={p.currency} />,
            },
          ]}
          mobileCard={(p) => (
            <MobileRecord
              title={p.name}
              fields={[
                { label: t("students"), value: limit(p.student_limit) },
                { label: t("branches"), value: limit(p.branch_limit) },
                {
                  label: t("pricePerMonth"),
                  value: <MoneyAmount minor={p.price_amount} currency={p.currency} />,
                },
              ]}
            />
          )}
        />
      </Section>

      <Section title={t("invoicesTitle")}>
        <DataTable
          testId="invoice-row"
          rows={invoiceRows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState icon={CreditCard} title={t("noInvoices")} hint={t("noInvoicesHint")} />
          }
          columns={[
            {
              key: "number",
              header: t("number"),
              cell: (r) => <span className="font-medium text-foreground">{r.number}</span>,
            },
            { key: "period", header: t("periodLabel"), cell: period },
            {
              key: "amount",
              header: t("amount"),
              cell: (r) => <MoneyAmount minor={r.amount} currency={r.currency} />,
            },
            { key: "status", header: t("status"), cell: invoiceStatus },
            {
              key: "paid",
              header: t("paidOn"),
              cell: (r) => (r.paid_at ? instant(r.paid_at) : "—"),
            },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={r.number}
              subtitle={period(r)}
              status={invoiceStatus(r)}
              fields={[
                {
                  label: t("amount"),
                  value: <MoneyAmount minor={r.amount} currency={r.currency} />,
                },
              ]}
            />
          )}
        />
      </Section>
    </>
  );
}
