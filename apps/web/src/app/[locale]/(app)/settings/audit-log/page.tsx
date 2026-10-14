import { addDays, toInstant, todayIn } from "@uteach/core";
import { ArrowRight, History, SearchX } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  PageHeader,
  Pagination,
  Section,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { pageCountFor, parseListParams } from "@/components/patterns/list-params";
import { loadStaffNames } from "@/lib/billing";
import { requireAdminContext } from "@/lib/center";
import { isLocalDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { AuditToolbar } from "./audit-toolbar";

export async function generateMetadata() {
  const t = await getTranslations("auditLog");
  return { title: t("title") };
}

/** Tables with an audit trigger (02 § audit_log), plus the support view (written by /admin). */
const TABLES = [
  "payments",
  "charges",
  "balance_adjustments",
  "enrollments",
  "enrollment_freezes",
  "group_prices",
  "memberships",
  "centers",
  "platform_invoices",
] as const;
const SUPPORT_VIEW = "support_view";
const ACTIONS = ["insert", "update", "delete", "void", "support_view"] as const;
const ACTION_TONE: Record<(typeof ACTIONS)[number], ChipTone> = {
  insert: "success",
  update: "primary",
  delete: "destructive",
  void: "warning",
  support_view: "muted",
};
const SHOWN_FIELDS = 6;
/** Ids and timestamps say nothing to an owner; the row's "what" and "when" already cover them. */
const isTechnical = (key: string) =>
  key === "id" || key === "created_at" || key.endsWith("_id") || key.endsWith("_ids");

type Row = {
  id: number;
  actor_profile_id: string | null;
  actor_kind: "user" | "super_admin" | "system" | "provider";
  action: string;
  table_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
};

/**
 * Settings → Audit log (02 § audit_log, M7b): who changed what in this center, newest first, with the changed
 * columns before → after. Includes uteach support's views of the center. Owners only (RLS: `is_owner`).
 */
export default async function AuditLogPage({
  searchParams,
}: PageProps<"/[locale]/settings/audit-log">) {
  const ctx = await requireAdminContext();
  if (ctx.membership.role !== "owner") notFound();
  const t = await getTranslations("auditLog");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const format = await getFormatter();
  const list = parseListParams(await searchParams, ["table", "person", "from", "to"] as const);
  const tz = ctx.center.timezone;
  const today = todayIn(tz);
  const to = isLocalDate(list.filters.to) ? list.filters.to : today;
  const fromParam = isLocalDate(list.filters.from) ? list.filters.from : addDays(today, -30);
  const from = fromParam > to ? to : fromParam;
  const table =
    list.filters.table === SUPPORT_VIEW || TABLES.some((x) => x === list.filters.table)
      ? list.filters.table
      : null;
  const staff = await loadStaffNames(ctx);
  const person = list.filters.person ?? null;

  const supabase = await createClient();
  let q = supabase
    .from("audit_log")
    .select("id, actor_profile_id, actor_kind, action, table_name, before, after, at", {
      count: "exact",
    })
    .eq("center_id", ctx.center.id)
    .gte("at", toInstant(from, "00:00", tz).toISOString())
    .lt("at", toInstant(addDays(to, 1), "00:00", tz).toISOString());
  if (table === SUPPORT_VIEW) q = q.eq("action", SUPPORT_VIEW);
  else if (table) q = q.eq("table_name", table).neq("action", SUPPORT_VIEW);
  if (person === "super_admin" || person === "system") q = q.eq("actor_kind", person);
  else if (person && staff.has(person))
    q = q.eq("actor_profile_id", person).eq("actor_kind", "user");
  const { data, count } = await q
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range(list.from, list.to);
  const rows = (data ?? []) as unknown as Row[];

  const when = (r: Row) =>
    format.dateTime(new Date(r.at), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });
  const actor = (r: Row) =>
    r.actor_kind === "super_admin"
      ? t("actors.superAdmin")
      : r.actor_kind === "user" && r.actor_profile_id
        ? (staff.get(r.actor_profile_id) ?? t("actors.formerStaff"))
        : r.actor_kind === "provider"
          ? t("actors.provider")
          : t("actors.system");
  const action = (r: Row) => {
    const a = ACTIONS.find((x) => x === r.action);
    return a ? <StatusChip tone={ACTION_TONE[a]}>{t(`actions.${a}`)}</StatusChip> : r.action;
  };
  const what = (r: Row) =>
    r.action === SUPPORT_VIEW
      ? t("supportViewed")
      : TABLES.some((x) => x === r.table_name)
        ? t(`tables.${r.table_name as (typeof TABLES)[number]}`)
        : (r.table_name ?? "—");
  const value = (v: unknown) =>
    v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v);
  const changes = (r: Row) => {
    const keys = Object.keys(r.after ?? r.before ?? {}).filter((k) => !isTechnical(k));
    if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <ul className="space-y-0.5 text-sm" data-testid="audit-changes">
        {keys.slice(0, SHOWN_FIELDS).map((k) => (
          <li key={k} className="break-all">
            <span className="font-mono text-xs text-muted-foreground">{k}</span>{" "}
            {r.before && r.after ? (
              <>
                <span className="text-muted-foreground line-through">{value(r.before[k])}</span>
                <ArrowRight className="mx-1 inline size-3.5 text-muted-foreground" aria-hidden />
                <span className="font-medium">{value(r.after[k])}</span>
              </>
            ) : (
              <span className="font-medium">{value((r.after ?? r.before)?.[k])}</span>
            )}
          </li>
        ))}
        {keys.length > SHOWN_FIELDS ? (
          <li className="text-muted-foreground">
            {t("moreFields", { count: keys.length - SHOWN_FIELDS })}
          </li>
        ) : null}
      </ul>
    );
  };

  const people = [
    ...[...staff].map(([id, name]) => ({ value: id, label: name })),
    { value: "super_admin", label: t("actors.superAdmin") },
    { value: "system", label: t("actors.system") },
  ];
  const tables = [
    ...TABLES.map((x) => ({ value: x, label: t(`tables.${x}`) })),
    { value: SUPPORT_VIEW, label: t("supportViewed") },
  ];

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
        title={t("listTitle")}
        description={t("listHint", { count: count ?? 0 })}
        tools={<AuditToolbar from={from} to={to} tables={tables} people={people} />}
      >
        <DataTable
          testId="audit-row"
          rows={rows}
          rowKey={(r) => String(r.id)}
          empty={
            table || person ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={History} title={t("empty")} hint={t("emptyHint")} />
            )
          }
          columns={[
            { key: "at", header: t("when"), cell: when, className: "w-44" },
            { key: "who", header: t("who"), cell: actor },
            { key: "action", header: t("action"), cell: action },
            { key: "what", header: t("what"), cell: what },
            { key: "changes", header: t("changes"), cell: changes },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={what(r)}
              subtitle={`${when(r)} · ${actor(r)}`}
              status={action(r)}
              fields={[{ label: t("changes"), value: changes(r) }]}
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
