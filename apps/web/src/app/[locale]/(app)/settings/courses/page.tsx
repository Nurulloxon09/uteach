import { CircleDot, GraduationCap, SearchX } from "lucide-react";
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
import { loadCoursePrices } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { formatMinor } from "@/lib/money";
import { AddCourseDialog } from "./course-dialog";
import { CourseRowActions } from "./course-row-actions";

export async function generateMetadata() {
  const t = await getTranslations("courses");
  return { title: t("title") };
}

type Course = {
  id: string;
  name: string;
  kind: string;
  default_lesson_minutes: number | null;
  archived_at: string | null;
};

/** Courses & levels (12-students-groups): a ListPage; levels are edited on the course page. */
export default async function CoursesPage({
  searchParams,
}: PageProps<"/[locale]/settings/courses">) {
  const ctx = await requireAdminContext();
  const t = await getTranslations("courses");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const list = parseListParams(await searchParams, ["status"] as const);
  const supabase = await createClient();

  let query = supabase
    .from("courses")
    .select("id, name, kind, default_lesson_minutes, archived_at", { count: "exact" })
    .eq("center_id", ctx.center.id);
  if (list.filters.status === "archived") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);
  const pattern = ilikePattern(list.q);
  if (pattern) query = query.ilike("name", pattern);

  const { data, count } = await query.order("name").range(list.from, list.to);
  const courses = (data ?? []) as Course[];
  const filtered = Boolean(pattern || list.filters.status);

  const [{ data: levels }, prices] = await Promise.all([
    courses.length
      ? supabase
          .from("levels")
          .select("course_id")
          .in(
            "course_id",
            courses.map((c) => c.id),
          )
          .is("archived_at", null)
      : Promise.resolve({ data: [] as { course_id: string }[] }),
    loadCoursePrices(ctx),
  ]);
  const levelCount = new Map<string, number>();
  for (const l of levels ?? []) levelCount.set(l.course_id, (levelCount.get(l.course_id) ?? 0) + 1);

  const kindOf = (c: Course) => t(`kinds.${c.kind as "language"}`);
  const priceOf = (c: Course) =>
    prices[c.id] ? formatMinor(prices[c.id]!, ctx.center.currency, ctx.locale) : "—";
  const statusOf = (c: Course) =>
    c.archived_at ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : (
      <StatusChip tone="success">{tc("active")}</StatusChip>
    );
  const actionsOf = (c: Course) => (
    <CourseRowActions
      id={c.id}
      name={c.name}
      archived={c.archived_at !== null}
      canManage={ctx.can.academics}
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
        action={ctx.can.academics ? <AddCourseDialog showPrice={ctx.can.billing} /> : undefined}
      />

      <Section
        title={t("listTitle")}
        tools={
          <>
            <TableSearch placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
            <FilterButton
              icon={<CircleDot strokeWidth={1.8} />}
              label={tc("status")}
              param="status"
              allLabel={tc("active")}
              options={[{ value: "archived", label: tc("archived") }]}
            />
          </>
        }
      >
        <DataTable
          testId="course-row"
          rows={courses}
          rowKey={(c) => c.id}
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
              header: t("fields.name"),
              cell: (c) => <NameCell avatar={<InitialsAvatar name={c.name} />} name={c.name} />,
            },
            { key: "kind", header: t("fields.kind"), cell: kindOf },
            { key: "levels", header: t("columns.levels"), cell: (c) => levelCount.get(c.id) ?? 0 },
            {
              key: "minutes",
              header: t("fields.minutes"),
              cell: (c) =>
                c.default_lesson_minutes
                  ? t("minutesValue", { count: c.default_lesson_minutes })
                  : "—",
            },
            ...(ctx.can.billing
              ? [{ key: "price", header: t("fields.price"), cell: priceOf }]
              : []),
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-28" },
          ]}
          mobileCard={(c) => (
            <MobileRecord
              avatar={<InitialsAvatar name={c.name} />}
              title={c.name}
              subtitle={kindOf(c)}
              status={statusOf(c)}
              fields={[
                { label: t("columns.levels"), value: levelCount.get(c.id) ?? 0 },
                ...(ctx.can.billing ? [{ label: t("fields.price"), value: priceOf(c) }] : []),
              ]}
              actions={actionsOf(c)}
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
