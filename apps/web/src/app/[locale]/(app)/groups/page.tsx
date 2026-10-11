import { todayIn } from "@uteach/core";
import { BookOpen, CircleDot, SearchX, Users } from "lucide-react";
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
  type ChipTone,
} from "@/components/patterns";
import { loadCourses, loadRooms, loadTeachers } from "@/lib/academics";
import { getCenterContext } from "@/lib/center";
import { weekdayLabels } from "@/lib/dates";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { groupFormData } from "./data";
import { NewGroupDialog } from "./group-dialog";
import { GroupRowActions } from "./group-row-actions";

export async function generateMetadata() {
  const t = await getTranslations("groups");
  return { title: t("title") };
}

const STATUS_TONE: Record<string, ChipTone> = {
  forming: "warning",
  active: "success",
  finished: "muted",
};

type Group = {
  id: string;
  name: string;
  branch_id: string;
  course_id: string;
  level_id: string | null;
  teacher_membership_id: string | null;
  room_id: string | null;
  status: "forming" | "active" | "finished";
  archived_at: string | null;
};

/**
 * Groups (12): a ListPage for owners and admins; "My groups" for teachers (RLS shows only theirs).
 * Search by name, filter by course and status.
 */
export default async function GroupsPage({ searchParams }: PageProps<"/[locale]/groups">) {
  const ctx = await getCenterContext();
  const isStaff = ctx.can.seeAdminPages;
  const t = await getTranslations("groups");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const list = parseListParams(await searchParams, ["course", "status"] as const);
  const supabase = await createClient();

  let query = supabase
    .from("groups")
    .select(
      "id, name, branch_id, course_id, level_id, teacher_membership_id, room_id, status, archived_at",
      {
        count: "exact",
      },
    )
    .eq("center_id", ctx.center.id);
  if (list.filters.status === "archived") query = query.not("archived_at", "is", null);
  else {
    query = query.is("archived_at", null);
    if (
      list.filters.status === "forming" ||
      list.filters.status === "active" ||
      list.filters.status === "finished"
    ) {
      query = query.eq("status", list.filters.status);
    }
  }
  if (list.filters.course) query = query.eq("course_id", list.filters.course);
  const pattern = ilikePattern(list.q);
  if (pattern) query = query.ilike("name", pattern);

  const [{ data, count }, courses, teachers, rooms] = await Promise.all([
    query.order("name").range(list.from, list.to),
    loadCourses(ctx),
    loadTeachers(ctx),
    loadRooms(ctx),
  ]);
  const groups = (data ?? []) as Group[];
  const filtered = Boolean(pattern || list.filters.status || list.filters.course);

  const today = todayIn(ctx.center.timezone);
  const { data: rules } = groups.length
    ? await supabase
        .from("group_schedule_rules")
        .select("group_id, weekday, start_time")
        .in(
          "group_id",
          groups.map((g) => g.id),
        )
        .or(`valid_to.is.null,valid_to.gte.${today}`)
        .order("weekday")
    : { data: [] as { group_id: string; weekday: number; start_time: string }[] };

  const days = weekdayLabels(ctx.locale, "short");
  const scheduleOf = new Map<string, string>();
  for (const g of groups) {
    const own = (rules ?? []).filter((r) => r.group_id === g.id);
    const times = new Set(own.map((r) => r.start_time.slice(0, 5)));
    const text =
      times.size === 1
        ? `${own.map((r) => days[r.weekday]).join("/")} ${[...times][0]}`
        : own.map((r) => `${days[r.weekday]} ${r.start_time.slice(0, 5)}`).join(", ");
    scheduleOf.set(g.id, text || "—");
  }

  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const levelName = new Map(courses.flatMap((c) => c.levels.map((l) => [l.id, l.name] as const)));
  const teacherName = new Map(teachers.map((m) => [m.id, m.name]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  const courseOf = (g: Group) =>
    [courseName.get(g.course_id), g.level_id ? levelName.get(g.level_id) : null]
      .filter(Boolean)
      .join(" · ") || "—";
  const statusOf = (g: Group) =>
    g.archived_at ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : (
      <StatusChip tone={STATUS_TONE[g.status] ?? "muted"}>{t(`status.${g.status}`)}</StatusChip>
    );
  const teacherOf = (g: Group) =>
    g.teacher_membership_id ? (teacherName.get(g.teacher_membership_id) ?? "—") : "—";
  const actionsOf = (g: Group) => (
    <GroupRowActions
      id={g.id}
      name={g.name}
      archived={g.archived_at !== null}
      canManage={ctx.can.academics && ctx.can.inBranch(g.branch_id)}
    />
  );

  const title = isStaff ? t("title") : t("myTitle");
  const formData = isStaff && ctx.can.academics ? await groupFormData(ctx) : null;

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: isStaff ? "/home" : "/today" }, { label: title }]}
        action={formData ? <NewGroupDialog data={formData} /> : undefined}
      />

      <Section
        title={t("listTitle")}
        tools={
          <>
            <TableSearch placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
            {courses.length > 1 ? (
              <FilterButton
                icon={<BookOpen strokeWidth={1.8} />}
                label={t("fields.course")}
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
                ...(["forming", "active", "finished"] as const).map((s) => ({
                  value: s,
                  label: t(`status.${s}`),
                })),
                ...(isStaff ? [{ value: "archived", label: tc("archived") }] : []),
              ]}
            />
          </>
        }
      >
        <DataTable
          testId="group-row"
          rows={groups}
          rowKey={(g) => g.id}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState
                icon={Users}
                title={t("emptyTitle")}
                hint={isStaff ? t("emptyHint") : t("emptyHintTeacher")}
              />
            )
          }
          columns={[
            {
              key: "name",
              header: t("fields.name"),
              cell: (g) => (
                <NameCell
                  avatar={<InitialsAvatar name={courseName.get(g.course_id) ?? g.name} />}
                  name={g.name}
                  sub={courseOf(g)}
                />
              ),
            },
            { key: "schedule", header: t("columns.schedule"), cell: (g) => scheduleOf.get(g.id) },
            ...(isStaff ? [{ key: "teacher", header: t("fields.teacher"), cell: teacherOf }] : []),
            {
              key: "room",
              header: t("fields.room"),
              cell: (g: Group) => (g.room_id ? (roomName.get(g.room_id) ?? "—") : "—"),
            },
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-28" },
          ]}
          mobileCard={(g) => (
            <MobileRecord
              avatar={<InitialsAvatar name={courseName.get(g.course_id) ?? g.name} />}
              title={g.name}
              subtitle={courseOf(g)}
              status={statusOf(g)}
              fields={[
                { label: t("columns.schedule"), value: scheduleOf.get(g.id) },
                ...(isStaff ? [{ label: t("fields.teacher"), value: teacherOf(g) }] : []),
              ]}
              actions={actionsOf(g)}
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
