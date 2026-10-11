import { todayIn } from "@uteach/core";
import { CalendarOff } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  PageHeader,
  Pagination,
  Section,
  StatusChip,
  pageCountFor,
  parseListParams,
} from "@/components/patterns";
import { loadBranches } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { AddHolidayDialog, HolidayRowActions } from "./holiday-dialog";

export async function generateMetadata() {
  const t = await getTranslations("holidays");
  return { title: t("title") };
}

type Holiday = { id: string; date: string; name: string; branch_id: string | null };

/** Holidays (13): days without lessons, center-wide or per branch. Upcoming first. */
export default async function HolidaysPage({
  searchParams,
}: PageProps<"/[locale]/settings/holidays">) {
  const ctx = await requireAdminContext();
  const t = await getTranslations("holidays");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const list = parseListParams(await searchParams, [] as const);
  const today = todayIn(ctx.center.timezone);
  const supabase = await createClient();

  const [{ data, count }, branches] = await Promise.all([
    supabase
      .from("holidays")
      .select("id, date, name, branch_id", { count: "exact" })
      .eq("center_id", ctx.center.id)
      .order("date", { ascending: false })
      .range(list.from, list.to),
    loadBranches(ctx),
  ]);
  const holidays = (data ?? []) as Holiday[];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const dateOf = (h: Holiday) =>
    format.dateTime(dayAsDate(h.date), { dateStyle: "full", timeZone: "UTC" });
  const scopeOf = (h: Holiday) =>
    h.branch_id ? (branchName.get(h.branch_id) ?? "—") : t("allBranches");
  const whenOf = (h: Holiday) =>
    h.date < today ? (
      <StatusChip tone="muted">{t("past")}</StatusChip>
    ) : (
      <StatusChip tone="primary">{t("upcoming")}</StatusChip>
    );
  const canEdit = (h: Holiday) =>
    ctx.can.academics &&
    (h.branch_id ? ctx.can.inBranch(h.branch_id) : ctx.membership.role === "owner");

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
        action={
          ctx.can.academics ? (
            <AddHolidayDialog
              branches={branches}
              allowCenterWide={ctx.membership.role === "owner"}
              defaultDate={today}
            />
          ) : undefined
        }
      />
      <Section title={t("listTitle")} description={t("listHint")}>
        <DataTable
          testId="holiday-row"
          rows={holidays}
          rowKey={(h) => h.id}
          empty={<EmptyState icon={CalendarOff} title={t("emptyTitle")} hint={t("emptyHint")} />}
          columns={[
            {
              key: "name",
              header: t("fields.name"),
              cell: (h) => (
                <NameCell avatar={<InitialsAvatar name={h.name} size="sm" />} name={h.name} />
              ),
            },
            { key: "date", header: t("fields.date"), cell: dateOf },
            { key: "branch", header: t("fields.branch"), cell: scopeOf },
            { key: "when", header: tc("status"), cell: whenOf },
            {
              key: "actions",
              header: tc("actions"),
              cell: (h) => (canEdit(h) ? <HolidayRowActions id={h.id} name={h.name} /> : null),
              className: "w-20",
            },
          ]}
          mobileCard={(h) => (
            <MobileRecord
              avatar={<InitialsAvatar name={h.name} size="sm" />}
              title={h.name}
              subtitle={dateOf(h)}
              status={whenOf(h)}
              fields={[{ label: t("fields.branch"), value: scopeOf(h) }]}
              actions={canEdit(h) ? <HolidayRowActions id={h.id} name={h.name} /> : undefined}
            />
          )}
        />
      </Section>
      <Pagination
        page={list.page}
        pageCount={pageCountFor(count ?? 0, list.size)}
        pageSize={list.size}
      />
    </>
  );
}
