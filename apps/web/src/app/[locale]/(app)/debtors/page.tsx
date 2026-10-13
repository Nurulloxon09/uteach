import { addDays, todayIn } from "@uteach/core";
import {
  BookOpen,
  Megaphone,
  Building2,
  CircleCheck,
  Hourglass,
  Phone,
  SearchX,
  TimerReset,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  EmptyState,
  FilterButton,
  InitialsAvatar,
  MobileRecord,
  MoneyAmount,
  NameCell,
  PageHeader,
  Pagination,
  Section,
  StatTiles,
  StatusChip,
  TableSearch,
  pageCountFor,
  parseListParams,
  type ChipTone,
  type StatTile,
} from "@/components/patterns";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { loadBranches, loadCourses, loadGroupOptions } from "@/lib/academics";
import { loadAccounts } from "@/lib/billing";
import { loadComposerOptions } from "@/lib/broadcasts";
import { requireAdminContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import {
  AGING_BUCKETS,
  isBucket,
  loadDebtors,
  type AgingBucket,
  type DebtorRow,
} from "@/lib/debtors";
import { formatMinor } from "@/lib/money";
import { BroadcastComposer } from "../broadcasts/broadcast-composer";
import { RecordPaymentDialog } from "../payments/payment-dialog";
import { DebtorsExportLink } from "./export-link";
import { ReminderButton } from "./reminder-button";

export async function generateMetadata() {
  const t = await getTranslations("debtors");
  return { title: t("title") };
}

const BUCKET_TONE: Record<AgingBucket, ChipTone> = {
  "0-30": "warning",
  "31-60": "warning",
  "61-90": "destructive",
  "90+": "destructive",
};
const BUCKET_TILE: Record<AgingBucket, Pick<StatTile, "icon" | "tone">> = {
  "0-30": { icon: Hourglass, tone: "green" },
  "31-60": { icon: TimerReset, tone: "blue" },
  "61-90": { icon: TriangleAlert, tone: "orange" },
  "90+": { icon: TriangleAlert, tone: "purple" },
};

/**
 * Debtors (15): students with a negative balance, most overdue first, with aging-bucket tiles (each filters
 * the list), filters for branch, group, course and bucket, call and record-payment actions, and an Excel
 * export of the same rows. `billing`; RLS keeps it to the user's branches.
 */
export default async function DebtorsPage({ searchParams }: PageProps<"/[locale]/debtors">) {
  const ctx = await requireAdminContext();
  if (!ctx.can.billing) notFound();
  const t = await getTranslations("debtors");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tb = await getTranslations("billing");
  const tStates = await getTranslations("states");
  const format = await getFormatter();
  const raw = await searchParams;
  const list = parseListParams(raw, ["branch", "group", "course", "bucket"] as const);

  const [branches, courses, groups, accounts, composer] = await Promise.all([
    loadBranches(ctx),
    loadCourses(ctx),
    loadGroupOptions(ctx),
    loadAccounts(ctx),
    ctx.can.broadcasts ? loadComposerOptions(ctx) : null,
  ]);
  const filters = {
    q: list.q,
    branch: branches.some((b) => b.id === list.filters.branch)
      ? (list.filters.branch ?? null)
      : null,
    group: groups.some((g) => g.id === list.filters.group) ? (list.filters.group ?? null) : null,
    course: courses.some((c) => c.id === list.filters.course)
      ? (list.filters.course ?? null)
      : null,
    bucket: isBucket(list.filters.bucket) ? list.filters.bucket : null,
  };
  const { rows, summary, total } = await loadDebtors(ctx, filters);
  const page = rows.slice(list.from, list.to + 1);
  const currency = ctx.center.currency;
  const today = todayIn(ctx.center.timezone);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const anyFilter = Boolean(
    filters.q || filters.branch || filters.group || filters.course || filters.bucket,
  );

  // Tiles keep the other filters and toggle the bucket.
  const tileHref = (bucket: AgingBucket) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value && k !== "bucket" && k !== "page") params.set(k, value);
    }
    if (filters.bucket !== bucket) params.set("bucket", bucket);
    const query = params.toString();
    return query ? `/debtors?${query}` : "/debtors";
  };

  const dateLabel = (date: string) =>
    format.dateTime(dayAsDate(date), { day: "numeric", month: "short", timeZone: "UTC" });
  const studentCell = (d: DebtorRow) => (
    <Link href={`/students/${d.studentId}?tab=payments`} className="hover:text-primary">
      <NameCell
        avatar={<InitialsAvatar name={d.name} />}
        name={d.name}
        sub={d.groups.join(", ") || undefined}
      />
    </Link>
  );
  const contactCell = (d: DebtorRow) => {
    const phone = d.guardianPhone ?? d.phone;
    return phone ? (
      <div className="space-y-0.5">
        <a href={`tel:${phone}`} className="font-medium tabular-nums hover:text-primary">
          {phone}
        </a>
        <p className="text-sm text-muted-foreground">
          {d.guardianPhone ? (d.guardianName ?? t("guardian")) : t("student")}
        </p>
      </div>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  };
  const debtCell = (d: DebtorRow) => (
    <MoneyAmount minor={d.debt} currency={currency} className="font-semibold text-destructive" />
  );
  const overdueCell = (d: DebtorRow) =>
    d.daysOverdue > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={BUCKET_TONE[d.bucket]}>
          {t("daysOverdue", { count: d.daysOverdue })}
        </StatusChip>
        {d.oldestDueDate ? (
          <span className="text-sm text-muted-foreground">
            {t("since", { date: dateLabel(d.oldestDueDate) })}
          </span>
        ) : null}
      </div>
    ) : (
      <StatusChip tone="muted">
        {d.oldestDueDate ? t("dueOn", { date: dateLabel(d.oldestDueDate) }) : t("notDue")}
      </StatusChip>
    );
  const lastPaymentCell = (d: DebtorRow) =>
    d.lastPayment ? (
      <div className="space-y-0.5">
        <MoneyAmount minor={d.lastPayment.amount} currency={currency} />
        <p className="text-sm text-muted-foreground">
          {format.dateTime(new Date(d.lastPayment.paidAt), {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: ctx.center.timezone,
          })}
        </p>
      </div>
    ) : (
      <span className="text-muted-foreground">{t("never")}</span>
    );
  const reminderCell = (d: DebtorRow) =>
    d.lastReminderAt ? (
      <span className="text-sm text-muted-foreground" data-testid="last-reminder">
        {format.dateTime(new Date(d.lastReminderAt), {
          day: "numeric",
          month: "short",
          timeZone: ctx.center.timezone,
        })}
      </span>
    ) : (
      <span className="text-muted-foreground">{t("noReminder")}</span>
    );
  const actionsOf = (d: DebtorRow) => {
    const phone = d.guardianPhone ?? d.phone;
    return (
      <div className="flex items-center gap-2">
        {ctx.can.inBranch(d.branchId) ? (
          <ReminderButton studentId={d.studentId} name={d.name} />
        ) : null}
        {phone ? (
          <a
            href={`tel:${phone}`}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label={t("call", { name: d.name })}
            title={t("call", { name: d.name })}
          >
            <Phone />
          </a>
        ) : null}
        {ctx.can.payments && ctx.can.inBranch(d.branchId) ? (
          <RecordPaymentDialog
            student={{
              id: d.studentId,
              name: d.name,
              branchId: d.branchId,
              balance: `-${d.debt}`,
              payer: d.guardianName ?? "",
            }}
            accounts={accounts}
            currency={currency}
            today={today}
            minDate={ctx.can.void ? null : addDays(today, -7)}
            trigger={
              <Button variant="outline" size="sm">
                {tb("record.button")}
              </Button>
            }
          />
        ) : null}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
        action={
          <div className="flex flex-wrap gap-3">
            {composer && rows.length > 0 ? (
              <BroadcastComposer
                options={composer}
                preset={{
                  studentIds: rows.map((r) => r.studentId),
                  label: t("broadcastPreset", { count: rows.length }),
                }}
                trigger={
                  <Button variant="outline" size="lg" data-testid="broadcast-debtors">
                    <Megaphone />
                    {t("broadcast")}
                  </Button>
                }
              />
            ) : null}
            <DebtorsExportLink label={t("export")} />
          </div>
        }
      />

      <StatTiles
        className="mb-6"
        items={AGING_BUCKETS.map((bucket) => ({
          key: bucket,
          label: (
            <span data-testid={`bucket-${bucket}`}>
              {t(`buckets.${bucket}`)} · {t("students", { count: summary[bucket].count })}
            </span>
          ),
          value: formatMinor(summary[bucket].total, currency, ctx.locale),
          href: tileHref(bucket),
          ...BUCKET_TILE[bucket],
        }))}
      />

      <Section
        title={t("listTitle")}
        description={`${t("total", { amount: formatMinor(total, currency, ctx.locale) })} · ${t("students", { count: rows.length })}`}
        tools={
          <>
            <TableSearch placeholder={t("search")} label={t("search")} />
            <FilterButton
              icon={<Hourglass strokeWidth={1.8} />}
              label={t("bucket")}
              param="bucket"
              allLabel={tc("all")}
              options={AGING_BUCKETS.map((b) => ({ value: b, label: t(`buckets.${b}`) }))}
            />
            {branches.length > 1 ? (
              <FilterButton
                icon={<Building2 strokeWidth={1.8} />}
                label={t("branch")}
                param="branch"
                allLabel={tc("all")}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            ) : null}
            <FilterButton
              icon={<UsersRound strokeWidth={1.8} />}
              label={t("group")}
              param="group"
              allLabel={tc("all")}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
            {courses.length > 1 ? (
              <FilterButton
                icon={<BookOpen strokeWidth={1.8} />}
                label={t("course")}
                param="course"
                allLabel={tc("all")}
                options={courses.map((c) => ({ value: c.id, label: c.name }))}
              />
            ) : null}
          </>
        }
      >
        <DataTable
          testId="debtor-row"
          rows={page}
          rowKey={(d) => d.studentId}
          empty={
            anyFilter ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={CircleCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
            )
          }
          columns={[
            { key: "student", header: t("student"), cell: studentCell },
            { key: "contact", header: t("contact"), cell: contactCell },
            ...(branches.length > 1
              ? [
                  {
                    key: "branch",
                    header: t("branch"),
                    cell: (d: DebtorRow) => branchName.get(d.branchId) ?? "—",
                  },
                ]
              : []),
            { key: "debt", header: t("debt"), cell: debtCell },
            { key: "overdue", header: t("overdue"), cell: overdueCell },
            { key: "last", header: t("lastPayment"), cell: lastPaymentCell },
            { key: "reminder", header: t("lastReminder"), cell: reminderCell },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-64" },
          ]}
          mobileCard={(d) => (
            <MobileRecord
              avatar={<InitialsAvatar name={d.name} />}
              title={d.name}
              subtitle={d.groups.join(", ") || undefined}
              status={debtCell(d)}
              fields={[
                { label: t("overdue"), value: overdueCell(d) },
                { label: t("contact"), value: contactCell(d) },
                { label: t("lastPayment"), value: lastPaymentCell(d) },
                { label: t("lastReminder"), value: reminderCell(d) },
              ]}
              actions={actionsOf(d)}
            />
          )}
        />
      </Section>

      <Pagination
        page={list.page}
        pageCount={pageCountFor(rows.length, list.size)}
        pageSize={list.size}
      />
    </>
  );
}
