import { addDays, todayIn } from "@uteach/core";
import { ReceiptText } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  MoneyAmount,
  PageAction,
  PageHeader,
  Section,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { InvoiceRowActions, IssueInvoiceDialog } from "../admin-dialogs";

export async function generateMetadata() {
  const t = await getTranslations("admin.invoices");
  return { title: t("title") };
}

const TONE: Record<"draft" | "issued" | "paid" | "void", ChipTone> = {
  draft: "muted",
  issued: "warning",
  paid: "success",
  void: "muted",
};

/**
 * /admin/invoices (M7b): uteach's invoices to centers (manual at launch). Issue one; mark it paid with a note
 * (the center becomes active on its plan, paid through the period end); or void it.
 */
export default async function AdminInvoicesPage() {
  const admin = await requireSuperAdmin();
  const db = admin.db!;
  const t = await getTranslations("admin.invoices");
  const ts = await getTranslations("subscription.invoiceStatus");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: invoices }, { data: centers }, { data: plans }] = await Promise.all([
    db.rpc("admin_invoices", { p_actor: admin.id }),
    db.rpc("admin_centers", { p_actor: admin.id }),
    supabase
      .from("plans")
      .select("id, name")
      .neq("code", "trial")
      .is("archived_at", null)
      .order("sort_order"),
  ]);
  const rows = invoices ?? [];
  type Row = (typeof rows)[number];
  const today = todayIn("Asia/Tashkent");

  const day = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const period = (r: Row) => t("period", { from: day(r.period_start), to: day(r.period_end) });
  const status = (r: Row) => <StatusChip tone={TONE[r.status]}>{ts(r.status)}</StatusChip>;
  const amount = (r: Row) => <MoneyAmount minor={r.amount} currency={r.currency} />;
  const actions = (r: Row) => (
    <InvoiceRowActions invoice={{ id: r.id, number: r.number, issued: r.status === "issued" }} />
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          <IssueInvoiceDialog
            trigger={<PageAction>{t("issueButton")}</PageAction>}
            centers={(centers ?? []).map((c) => ({ value: c.id, label: c.name }))}
            plans={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))}
            defaultPeriod={{ start: today, end: addDays(today, 29) }}
          />
        }
      />
      <Section title={t("listTitle")} description={t("listHint")}>
        <DataTable
          testId="admin-invoice-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ReceiptText} title={t("empty")} hint={t("emptyHint")} />}
          columns={[
            {
              key: "number",
              header: t("number"),
              cell: (r) => <span className="font-medium tabular-nums">{r.number}</span>,
            },
            {
              key: "center",
              header: t("center"),
              cell: (r) => (
                <Link href={`/admin/centers/${r.center_id}`} className="hover:text-primary">
                  {r.center_name}
                </Link>
              ),
            },
            { key: "plan", header: t("plan"), cell: (r) => r.plan_name },
            { key: "period", header: t("periodLabel"), cell: period },
            { key: "amount", header: t("amount"), cell: amount },
            {
              key: "status",
              header: t("status"),
              cell: (r) => (
                <div className="space-y-1">
                  {status(r)}
                  {r.payment_note ? (
                    <p className="text-sm text-muted-foreground">{r.payment_note}</p>
                  ) : null}
                </div>
              ),
            },
            { key: "actions", header: t("actions"), cell: actions, className: "w-28" },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={`${r.number} · ${r.center_name}`}
              subtitle={period(r)}
              status={status(r)}
              fields={[
                { label: t("plan"), value: r.plan_name },
                { label: t("amount"), value: amount(r) },
              ]}
              actions={actions(r)}
            />
          )}
        />
      </Section>
    </>
  );
}
