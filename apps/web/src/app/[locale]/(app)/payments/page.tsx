import { addDays, todayIn, toInstant } from "@uteach/core";
import { Receipt, SearchX } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  EmptyState,
  InitialsAvatar,
  MobileRecord,
  MoneyAmount,
  NameCell,
  PageAction,
  PageHeader,
  Pagination,
  Section,
  StatusChip,
  pageCountFor,
  parseListParams,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { loadBranches } from "@/lib/academics";
import { loadAccounts, loadStaffNames, type PaymentMethod } from "@/lib/billing";
import { requireAdminContext } from "@/lib/center";
import { isLocalDate, monthStart } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { PaymentRowActions } from "./billing-actions";
import { RecordPaymentDialog } from "./payment-dialog";
import { PaymentsToolbar } from "./payments-toolbar";

export async function generateMetadata() {
  const t = await getTranslations("billing.page");
  return { title: t("title") };
}

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "online"];

/**
 * Payments (15): payments of a period (this month by default) in the user's branches, searchable by student or
 * receipt number, filtered by method and branch, with the period total; "+ Record payment" picks the student.
 * `billing` or `payments`; RLS limits the rows to the user's branches.
 */
export default async function PaymentsPage({ searchParams }: PageProps<"/[locale]/payments">) {
  const ctx = await requireAdminContext();
  if (!ctx.can.billing && !ctx.can.payments) notFound();
  const t = await getTranslations("billing");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const format = await getFormatter();
  const raw = await searchParams;
  const list = parseListParams(raw, ["method", "branch", "from", "to"] as const);
  const supabase = await createClient();

  const tz = ctx.center.timezone;
  const today = todayIn(tz);
  const to = isLocalDate(list.filters.to) ? list.filters.to : today;
  const fromParam = isLocalDate(list.filters.from) ? list.filters.from : monthStart(today);
  const from = fromParam > to ? to : fromParam;
  const method = METHODS.find((m) => m === list.filters.method) ?? null;
  const branches = await loadBranches(ctx);
  const branch = branches.some((b) => b.id === list.filters.branch) ? list.filters.branch : null;

  // Search: receipt number, or the names of matching students.
  const pattern = ilikePattern(list.q);
  let studentIds: string[] | null = null;
  if (pattern) {
    const { data } = await supabase
      .from("students")
      .select("id")
      .eq("center_id", ctx.center.id)
      .ilike("full_name", pattern)
      .limit(200);
    studentIds = (data ?? []).map((s) => s.id);
  }

  const build = (columns: string, count?: "exact") => {
    let q = supabase
      .from("payments")
      .select(columns, count ? { count } : undefined)
      .eq("center_id", ctx.center.id)
      .gte("paid_at", toInstant(from, "00:00", tz).toISOString())
      .lt("paid_at", toInstant(addDays(to, 1), "00:00", tz).toISOString());
    if (method) q = q.eq("method", method);
    if (branch) q = q.eq("branch_id", branch);
    if (pattern) {
      q = studentIds?.length
        ? q.or(`receipt_no.ilike.${pattern},student_id.in.(${studentIds.join(",")})`)
        : q.ilike("receipt_no", pattern);
    }
    return q;
  };

  type Row = {
    id: string;
    student_id: string;
    branch_id: string;
    account_id: string;
    amount: number;
    method: PaymentMethod;
    paid_at: string;
    receipt_no: string;
    received_by: string | null;
    voided_at: string | null;
    students: { full_name: string } | null;
  };

  const [page, totals, accounts, staff, { data: students }] = await Promise.all([
    build(
      "id, student_id, branch_id, account_id, amount, method, paid_at, receipt_no, received_by, voided_at, students ( full_name )",
      "exact",
    )
      .order("paid_at", { ascending: false })
      .range(list.from, list.to),
    build("amount").is("voided_at", null).limit(10000),
    loadAccounts(ctx),
    loadStaffNames(ctx),
    ctx.can.payments
      ? supabase
          .from("student_overview")
          .select("id, full_name, phone, branch_id")
          .eq("center_id", ctx.center.id)
          .is("archived_at", null)
          .order("full_name")
          .limit(2000)
      : Promise.resolve({
          data: [] as { id: string; full_name: string; phone: string | null; branch_id: string }[],
        }),
  ]);
  const rows = (page.data ?? []) as unknown as Row[];
  const total = ((totals.data ?? []) as unknown as { amount: number }[]).reduce(
    (sum, p) => sum + BigInt(p.amount),
    0n,
  );
  const accountLabel = new Map(accounts.map((a) => [a.id, a.label]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const anyFilter = Boolean(pattern || method || branch);

  const paidAt = (p: Row) =>
    format.dateTime(new Date(p.paid_at), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });
  const studentCell = (p: Row) => (
    <Link href={`/students/${p.student_id}`} className="hover:text-primary">
      <NameCell
        avatar={<InitialsAvatar name={p.students?.full_name ?? "?"} />}
        name={p.students?.full_name ?? "—"}
      />
    </Link>
  );
  const amountCell = (p: Row) => (
    <div className="flex flex-wrap items-center gap-2">
      <MoneyAmount
        minor={p.amount}
        currency={ctx.center.currency}
        tone={p.voided_at ? "muted" : "plain"}
      />
      {p.voided_at ? <StatusChip tone="muted">{t("payments.voided")}</StatusChip> : null}
    </div>
  );
  const actionsOf = (p: Row) => (
    <PaymentRowActions
      payment={{ id: p.id, receiptNo: p.receipt_no, voided: p.voided_at !== null }}
      studentId={p.student_id}
      canVoid={ctx.can.void}
    />
  );

  return (
    <>
      <PageHeader
        title={t("page.title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("page.title") }]}
        action={
          ctx.can.payments ? (
            <RecordPaymentDialog
              students={(students ?? []).flatMap((s) =>
                s.id && s.full_name && s.branch_id && ctx.can.inBranch(s.branch_id)
                  ? [
                      {
                        id: s.id,
                        name: s.full_name,
                        hint: s.phone ?? undefined,
                        branchId: s.branch_id,
                      },
                    ]
                  : [],
              )}
              accounts={accounts}
              currency={ctx.center.currency}
              today={today}
              minDate={ctx.can.void ? null : addDays(today, -7)}
              trigger={<PageAction>{t("record.button")}</PageAction>}
            />
          ) : undefined
        }
      />

      <Section
        title={t("page.listTitle")}
        description={`${t("page.total", { amount: formatMinor(total, ctx.center.currency, ctx.locale) })} · ${t("page.count", { count: page.count ?? 0 })}`}
        tools={
          <PaymentsToolbar
            from={from}
            to={to}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          />
        }
      >
        <DataTable
          testId="payments-row"
          rows={rows}
          rowKey={(p) => p.id}
          empty={
            anyFilter ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={Receipt} title={t("page.emptyTitle")} hint={t("page.emptyHint")} />
            )
          }
          columns={[
            { key: "student", header: t("payments.student"), cell: studentCell },
            { key: "date", header: t("payments.date"), cell: paidAt },
            {
              key: "receipt",
              header: t("payments.receipt"),
              cell: (p) => <span className="font-medium tabular-nums">{p.receipt_no}</span>,
            },
            {
              key: "method",
              header: t("payments.method"),
              cell: (p) => (
                <div className="space-y-0.5">
                  <p>{t(`methods.${p.method}`)}</p>
                  <p className="text-sm text-muted-foreground">
                    {accountLabel.get(p.account_id) ?? "—"}
                  </p>
                </div>
              ),
            },
            ...(branches.length > 1
              ? [
                  {
                    key: "branch",
                    header: t("page.branch"),
                    cell: (p: Row) => branchName.get(p.branch_id) ?? "—",
                  },
                ]
              : []),
            { key: "amount", header: t("payments.amount"), cell: amountCell },
            {
              key: "by",
              header: t("payments.receivedBy"),
              cell: (p) => (p.received_by ? (staff.get(p.received_by) ?? "—") : "—"),
            },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-36" },
          ]}
          mobileCard={(p) => (
            <MobileRecord
              avatar={<InitialsAvatar name={p.students?.full_name ?? "?"} />}
              title={p.students?.full_name ?? "—"}
              subtitle={`${paidAt(p)} · ${p.receipt_no}`}
              status={amountCell(p)}
              fields={[{ label: t("payments.method"), value: t(`methods.${p.method}`) }]}
              actions={actionsOf(p)}
            />
          )}
        />
      </Section>

      <Pagination
        page={list.page}
        pageCount={pageCountFor(page.count ?? 0, list.size)}
        pageSize={list.size}
      />
    </>
  );
}
