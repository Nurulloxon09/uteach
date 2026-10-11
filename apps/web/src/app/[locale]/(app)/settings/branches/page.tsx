import { Building2, CircleDot, SearchX } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  FilterButton,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  PageHeader,
  Pagination,
  Section,
  StatusChip,
  TableSearch,
  pageCountFor,
  parseListParams,
} from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { AddBranchDialog } from "./branch-form";
import { BranchRowActions } from "./branch-row-actions";

export async function generateMetadata() {
  const t = await getTranslations("settings.branches");
  return { title: t("title") };
}

type Branch = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  archived_at: string | null;
};

/** Branches & rooms: a ListPage with search, an active/archived filter and the add-branch dialog. */
export default async function BranchesPage({
  searchParams,
}: PageProps<"/[locale]/settings/branches">) {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.branches");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const format = await getFormatter();
  const list = parseListParams(await searchParams, ["status"] as const);
  const supabase = await createClient();

  let query = supabase
    .from("branches")
    .select("id, name, address, timezone, archived_at", { count: "exact" })
    .eq("center_id", ctx.center.id);
  if (list.filters.status === "active") query = query.is("archived_at", null);
  if (list.filters.status === "archived") query = query.not("archived_at", "is", null);
  const pattern = ilikePattern(list.q);
  if (pattern) query = query.or(`name.ilike.${pattern},address.ilike.${pattern}`);

  const { data, count } = await query
    .order("archived_at", { nullsFirst: true })
    .order("created_at")
    .range(list.from, list.to);
  const branches = (data ?? []) as Branch[];
  const filtered = Boolean(pattern || list.filters.status);

  const { data: rooms } = branches.length
    ? await supabase
        .from("rooms")
        .select("branch_id")
        .in(
          "branch_id",
          branches.map((b) => b.id),
        )
        .is("archived_at", null)
    : { data: [] as { branch_id: string }[] };
  const roomCount = new Map<string, number>();
  for (const r of rooms ?? []) roomCount.set(r.branch_id, (roomCount.get(r.branch_id) ?? 0) + 1);

  const statusOf = (b: Branch) =>
    b.archived_at ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : (
      <StatusChip tone="success">{t("statusActive")}</StatusChip>
    );
  const roomsOf = (b: Branch) => t("roomsCount", { count: roomCount.get(b.id) ?? 0 });
  const actionsOf = (b: Branch) => (
    <BranchRowActions
      id={b.id}
      name={b.name}
      archived={b.archived_at !== null}
      canManage={ctx.can.manageBranches}
    />
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
        action={
          ctx.can.manageBranches ? (
            <AddBranchDialog defaultTimezone={ctx.center.timezone} />
          ) : undefined
        }
      />

      <Section
        title={t("listTitle")}
        tools={
          <>
            <TableSearch placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
            <FilterButton
              icon={<CircleDot strokeWidth={1.8} />}
              label={t("filterStatus")}
              param="status"
              allLabel={tc("all")}
              options={[
                { value: "active", label: t("statusActive") },
                { value: "archived", label: t("statusArchived") },
              ]}
            />
          </>
        }
      >
        <DataTable
          testId="branch-row"
          rows={branches}
          rowKey={(b) => b.id}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={Building2} title={t("emptyTitle")} hint={t("emptyHint")} />
            )
          }
          columns={[
            {
              key: "name",
              header: t("columns.name"),
              cell: (b) => <NameCell avatar={<InitialsAvatar name={b.name} />} name={b.name} />,
            },
            { key: "address", header: t("columns.address"), cell: (b) => b.address ?? "—" },
            {
              key: "timezone",
              header: t("columns.timezone"),
              cell: (b) => b.timezone.replaceAll("_", " "),
            },
            {
              key: "rooms",
              header: t("columns.rooms"),
              cell: (b) => format.number(roomCount.get(b.id) ?? 0),
            },
            { key: "status", header: t("filterStatus"), cell: statusOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-28" },
          ]}
          mobileCard={(b) => (
            <MobileRecord
              avatar={<InitialsAvatar name={b.name} />}
              title={b.name}
              subtitle={b.address ?? undefined}
              status={statusOf(b)}
              fields={[
                { label: t("columns.timezone"), value: b.timezone.replaceAll("_", " ") },
                { label: t("columns.rooms"), value: roomsOf(b) },
              ]}
              actions={actionsOf(b)}
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
