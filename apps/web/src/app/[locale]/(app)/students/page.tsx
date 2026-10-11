import { BookOpen, Building2, CircleDot, GraduationCap, SearchX, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
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
import { loadBranches, loadCourses, loadGroupOptions } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { AddStudentDialog } from "./student-dialog";
import { StudentRowActions } from "./student-row-actions";

export async function generateMetadata() {
  const t = await getTranslations("students");
  return { title: t("title") };
}

type Row = {
  id: string;
  branch_id: string;
  full_name: string;
  phone: string | null;
  archived_at: string | null;
  is_active: boolean;
  group_ids: string[];
};

/**
 * Students (12): search by name, phone or a guardian's phone; filter by branch, group, course and
 * active/inactive (active = an active or frozen enrollment). Reads `student_overview` (RLS applies).
 */
export default async function StudentsPage({ searchParams }: PageProps<"/[locale]/students">) {
  const ctx = await requireAdminContext();
  const t = await getTranslations("students");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const list = parseListParams(await searchParams, [
    "branch",
    "group",
    "course",
    "status",
  ] as const);
  const supabase = await createClient();

  let query = supabase
    .from("student_overview")
    .select("id, branch_id, full_name, phone, archived_at, is_active, group_ids", {
      count: "exact",
    })
    .eq("center_id", ctx.center.id);
  if (list.filters.status === "archived") query = query.not("archived_at", "is", null);
  else {
    query = query.is("archived_at", null);
    if (list.filters.status === "active") query = query.eq("is_active", true);
    if (list.filters.status === "inactive") query = query.eq("is_active", false);
  }
  if (list.filters.branch) query = query.eq("branch_id", list.filters.branch);
  if (list.filters.group) query = query.contains("group_ids", [list.filters.group]);
  if (list.filters.course) query = query.contains("course_ids", [list.filters.course]);
  // Phone searches ignore spaces and dashes ("90 123 45" finds +99890123 45 67).
  const digits = list.q.replace(/[\s()+-]/g, "");
  const pattern = ilikePattern(/^\d{3,}$/.test(digits) ? digits : list.q);
  if (pattern) query = query.ilike("search_text", pattern);

  const [{ data, count }, branches, groups, courses] = await Promise.all([
    query.order("full_name").range(list.from, list.to),
    loadBranches(ctx),
    loadGroupOptions(ctx),
    loadCourses(ctx),
  ]);
  const students = (data ?? []) as Row[];
  const filtered = Boolean(pattern || Object.values(list.filters).some(Boolean));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const groupsOf = (s: Row) => s.group_ids.map((id) => groupName.get(id) ?? "—").join(", ") || "—";
  const statusOf = (s: Row) =>
    s.archived_at ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : s.is_active ? (
      <StatusChip tone="success">{t("status.active")}</StatusChip>
    ) : (
      <StatusChip tone="muted">{t("status.inactive")}</StatusChip>
    );
  const actionsOf = (s: Row) => (
    <StudentRowActions
      id={s.id}
      name={s.full_name}
      archived={s.archived_at !== null}
      canManage={ctx.can.students}
    />
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
        action={ctx.can.students ? <AddStudentDialog branches={branches} /> : undefined}
      />

      <Section
        title={t("listTitle")}
        tools={
          <>
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
              icon={<UsersRound strokeWidth={1.8} />}
              label={t("filterGroup")}
              param="group"
              allLabel={tc("all")}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
            {courses.length > 1 ? (
              <FilterButton
                icon={<BookOpen strokeWidth={1.8} />}
                label={t("filterCourse")}
                param="course"
                allLabel={tc("all")}
                options={courses.map((c) => ({ value: c.id, label: c.name }))}
              />
            ) : null}
            <FilterButton
              icon={<CircleDot strokeWidth={1.8} />}
              label={tc("status")}
              param="status"
              allLabel={tc("all")}
              options={[
                { value: "active", label: t("status.active") },
                { value: "inactive", label: t("status.inactive") },
                { value: "archived", label: tc("archived") },
              ]}
            />
          </>
        }
      >
        <DataTable
          testId="student-row"
          rows={students}
          rowKey={(s) => s.id}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={GraduationCap} title={t("emptyTitle")} hint={t("emptyHint")} />
            )
          }
          columns={[
            {
              key: "name",
              header: t("fields.fullName"),
              cell: (s) => (
                <NameCell avatar={<InitialsAvatar name={s.full_name} />} name={s.full_name} />
              ),
            },
            { key: "phone", header: t("fields.phone"), cell: (s) => s.phone ?? "—" },
            { key: "groups", header: t("columns.groups"), cell: groupsOf },
            ...(branches.length > 1
              ? [
                  {
                    key: "branch",
                    header: t("fields.branch"),
                    cell: (s: Row) => branchName.get(s.branch_id) ?? "—",
                  },
                ]
              : []),
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-28" },
          ]}
          mobileCard={(s) => (
            <MobileRecord
              avatar={<InitialsAvatar name={s.full_name} />}
              title={s.full_name}
              subtitle={s.phone ?? undefined}
              status={statusOf(s)}
              fields={[{ label: t("columns.groups"), value: groupsOf(s) }]}
              actions={actionsOf(s)}
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
