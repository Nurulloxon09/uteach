import {
  isLeadStatus,
  LEAD_SOURCES,
  LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
  type LeadStatus,
} from "@uteach/core";
import {
  BellRing,
  BookOpen,
  Building2,
  CircleDot,
  Radio,
  SearchX,
  Target,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
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
  type KanbanColumn,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { loadBranches, loadCourses } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { LEAD_COLUMNS, loadAssignees, loadLostReasons, type LeadRow } from "@/lib/leads";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { AddLeadDialog } from "./lead-dialog";
import { STATUS_TONES } from "./lead-meta";
import { LeadBoard, type LeadCardData } from "./lead-ui";
import { LeadViewSwitch } from "./view-switch";

export async function generateMetadata() {
  const t = await getTranslations("leads");
  return { title: t("title") };
}

/** Cards on the board at most; the list view pages through everything. */
const BOARD_LIMIT = 400;

/**
 * Leads (11): the pipeline board (drag between stages; Won and Lost as counts) or a list with phone/name
 * search, filtered by branch, source, assignee, course and "follow-up overdue".
 */
export default async function LeadsPage({ searchParams }: PageProps<"/[locale]/leads">) {
  const ctx = await requireAdminContext();
  if (!ctx.can.leads) notFound();
  const t = await getTranslations("leads");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const format = await getFormatter();
  const raw = await searchParams;
  const view = raw.view === "list" ? "list" : "board";
  const list = parseListParams(raw, [
    "branch",
    "source",
    "assignee",
    "course",
    "followUp",
    "status",
  ] as const);
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const digits = list.q.replace(/[\s()+-]/g, "");
  const pattern = ilikePattern(/^\d{3,}$/.test(digits) ? digits : list.q);

  const leads = (head = false) =>
    supabase.from("leads").select(LEAD_COLUMNS, { count: "exact", head });
  const withFilters = <Q extends ReturnType<typeof leads>>(query: Q): Q => {
    let q = query.eq("center_id", ctx.center.id);
    if (list.filters.status === "archived") q = q.not("archived_at", "is", null);
    else q = q.is("archived_at", null);
    if (list.filters.branch) q = q.eq("branch_id", list.filters.branch);
    if (list.filters.source && (LEAD_SOURCES as readonly string[]).includes(list.filters.source))
      q = q.eq("source", list.filters.source as (typeof LEAD_SOURCES)[number]);
    if (list.filters.assignee) q = q.eq("assigned_membership_id", list.filters.assignee);
    if (list.filters.course) q = q.eq("interested_course_id", list.filters.course);
    if (list.filters.followUp === "overdue") q = q.lt("next_follow_up_at", nowIso);
    if (pattern) q = q.or(`full_name.ilike.${pattern},phone.ilike.${pattern}`);
    return q as Q;
  };

  const [branches, courses, assignees, reasons] = await Promise.all([
    loadBranches(ctx),
    loadCourses(ctx),
    loadAssignees(ctx),
    loadLostReasons(ctx),
  ]);
  const assigneeName = new Map(assignees.map((a) => [a.id, a.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const filtered = Boolean(pattern || Object.values(list.filters).some(Boolean));
  const reasonOptions = reasons
    .filter((r) => !r.archived)
    .map((r) => ({ id: r.id, label: r.label ?? t(`lostReason.${r.systemKey ?? "other"}`) }));

  const followUpOf = (lead: LeadRow) =>
    lead.next_follow_up_at
      ? {
          label: format.dateTime(new Date(lead.next_follow_up_at), {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: ctx.center.timezone,
          }),
          overdue: lead.next_follow_up_at < nowIso,
        }
      : null;

  const header = (
    <PageHeader
      title={t("title")}
      breadcrumbLabel={tc("breadcrumb")}
      crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
      action={
        <AddLeadDialog
          options={{
            branches: branches.filter((b) => ctx.can.inBranch(b.id)),
            courses,
            assignees,
          }}
          defaultAssigneeId={ctx.membership.id}
        />
      }
    />
  );

  const tools = (
    <>
      <LeadViewSwitch view={view} />
      <TableSearch placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
      {branches.length > 1 ? (
        <FilterButton
          icon={<Building2 strokeWidth={1.8} />}
          label={t("fields.branch")}
          param="branch"
          allLabel={tc("all")}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : null}
      <FilterButton
        icon={<Radio strokeWidth={1.8} />}
        label={t("fields.source")}
        param="source"
        allLabel={tc("all")}
        options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
      />
      <FilterButton
        icon={<UserRound strokeWidth={1.8} />}
        label={t("fields.assignee")}
        param="assignee"
        allLabel={tc("all")}
        options={assignees.map((a) => ({ value: a.id, label: a.name }))}
      />
      {courses.length > 0 ? (
        <FilterButton
          icon={<BookOpen strokeWidth={1.8} />}
          label={t("fields.course")}
          param="course"
          allLabel={tc("all")}
          options={courses.map((c) => ({ value: c.id, label: c.name }))}
        />
      ) : null}
      <FilterButton
        icon={<BellRing strokeWidth={1.8} />}
        label={t("filterFollowUp")}
        param="followUp"
        allLabel={tc("all")}
        options={[{ value: "overdue", label: t("followUpOverdue") }]}
      />
      {view === "list" ? (
        <FilterButton
          icon={<CircleDot strokeWidth={1.8} />}
          label={tc("status")}
          param="status"
          allLabel={tc("all")}
          options={[
            ...LEAD_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
            { value: "archived", label: tc("archived") },
          ]}
        />
      ) : null}
    </>
  );

  if (view === "board") {
    const [{ data }, won, lost] = await Promise.all([
      withFilters(leads())
        .in("status", [...OPEN_LEAD_STATUSES])
        .order("created_at", { ascending: false })
        .limit(BOARD_LIMIT),
      withFilters(leads(true)).eq("status", "won"),
      withFilters(leads(true)).eq("status", "lost"),
    ]);
    const rows = (data ?? []) as unknown as LeadRow[];
    const cards: LeadCardData[] = rows.map((lead) => ({
      id: lead.id,
      column: lead.status,
      title: lead.full_name,
      phone: lead.phone,
      source: lead.source,
      goal: lead.goal,
      assigneeName: lead.assigned_membership_id
        ? (assigneeName.get(lead.assigned_membership_id) ?? null)
        : null,
      followUp: followUpOf(lead),
    }));
    const closed = (status: "won" | "lost", count: number | null): KanbanColumn => ({
      key: status,
      title: t(`status.${status}`),
      count: count ?? 0,
      tone: STATUS_TONES[status],
      compact: true,
      footer: (
        <Link
          href={`/leads?view=list&status=${status}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t("board.show")}
        </Link>
      ),
    });
    const columns: KanbanColumn[] = [
      ...OPEN_LEAD_STATUSES.map((s) => ({
        key: s,
        title: t(`status.${s}`),
        count: 0,
        tone: STATUS_TONES[s],
      })),
      closed("won", won.count),
      closed("lost", lost.count),
    ];

    return (
      <>
        {header}
        <Section title={t("boardTitle")} tools={tools}>
          {rows.length === 0 && !filtered && !won.count && !lost.count ? (
            <EmptyState icon={Target} title={t("emptyTitle")} hint={t("emptyHint")} />
          ) : (
            <LeadBoard cards={cards} columns={columns} reasons={reasonOptions} />
          )}
          {rows.length === BOARD_LIMIT ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("board.limited", { count: BOARD_LIMIT })}
            </p>
          ) : null}
        </Section>
      </>
    );
  }

  let query = withFilters(leads());
  const status = list.filters.status;
  if (status && isLeadStatus(status)) query = query.eq("status", status);
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(list.from, list.to);
  const rows = (data ?? []) as unknown as LeadRow[];

  const statusOf = (lead: LeadRow) =>
    lead.archived_at ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : (
      <StatusChip tone={STATUS_TONES[lead.status as LeadStatus]}>
        {t(`status.${lead.status}`)}
      </StatusChip>
    );
  const followUpCell = (lead: LeadRow) => {
    const f = followUpOf(lead);
    return f ? <StatusChip tone={f.overdue ? "destructive" : "muted"}>{f.label}</StatusChip> : "—";
  };
  const nameOf = (lead: LeadRow) => (
    <Link
      href={`/leads/${lead.id}`}
      className="outline-none hover:text-primary focus-visible:underline"
    >
      <NameCell avatar={<InitialsAvatar name={lead.full_name} />} name={lead.full_name} />
    </Link>
  );

  return (
    <>
      {header}
      <Section title={t("listTitle")} tools={tools}>
        <DataTable
          testId="lead-row"
          rows={rows}
          rowKey={(l) => l.id}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={Target} title={t("emptyTitle")} hint={t("emptyHint")} />
            )
          }
          columns={[
            { key: "name", header: t("fields.fullName"), cell: nameOf },
            { key: "phone", header: t("fields.phone"), cell: (l) => l.phone ?? "—" },
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "source", header: t("fields.source"), cell: (l) => t(`source.${l.source}`) },
            {
              key: "assignee",
              header: t("fields.assignee"),
              cell: (l) =>
                l.assigned_membership_id
                  ? (assigneeName.get(l.assigned_membership_id) ?? "—")
                  : "—",
            },
            ...(branches.length > 1
              ? [
                  {
                    key: "branch",
                    header: t("fields.branch"),
                    cell: (l: LeadRow) => branchName.get(l.branch_id) ?? "—",
                  },
                ]
              : []),
            { key: "followUp", header: t("fields.nextFollowUp"), cell: followUpCell },
          ]}
          mobileCard={(l) => (
            <MobileRecord
              avatar={<InitialsAvatar name={l.full_name} />}
              title={<Link href={`/leads/${l.id}`}>{l.full_name}</Link>}
              subtitle={l.phone ?? undefined}
              status={statusOf(l)}
              fields={[
                { label: t("fields.source"), value: t(`source.${l.source}`) },
                { label: t("fields.nextFollowUp"), value: followUpCell(l) },
              ]}
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
