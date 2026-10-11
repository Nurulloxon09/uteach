import { addDays, todayIn } from "@uteach/core";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/patterns";
import { loadBranches, loadRooms, loadTeachers } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { dayAsDate, isLocalDate, localParts, weekDays, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { ScheduleView, type ConflictItem, type ScheduleLesson } from "./schedule-view";

export async function generateMetadata() {
  const t = await getTranslations("schedule");
  return { title: t("title") };
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Timetable (13): week or day, by room or by teacher, for one branch. Drag (or the Move dialog) moves one
 * lesson; the database refuses clashes. The conflicts inbox lists occurrences generation couldn't place.
 */
export default async function SchedulePage({ searchParams }: PageProps<"/[locale]/schedule">) {
  const ctx = await requireAdminContext();
  const t = await getTranslations("schedule");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const raw = (await searchParams) as Raw;

  const branches = await loadBranches(ctx);
  const branch = branches.find((b) => b.id === one(raw.branch)) ?? branches[0];
  if (!branch) {
    return (
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
      />
    );
  }

  const today = todayIn(branch.timezone);
  const view = one(raw.view) === "day" ? "day" : "week";
  const by = one(raw.by) === "teacher" ? "teacher" : "room";
  const date = isLocalDate(one(raw.date)) ? one(raw.date)! : today;
  const from = view === "week" ? weekStart(date) : date;
  const to = view === "week" ? addDays(from, 6) : date;

  const supabase = await createClient();
  const [rooms, teachers, { data: lessons }, { data: conflicts }] = await Promise.all([
    loadRooms(ctx),
    loadTeachers(ctx),
    supabase
      .from("lessons")
      .select(
        "id, group_id, local_date, starts_at, ends_at, room_id, teacher_membership_id, original_teacher_membership_id, status, is_makeup, is_billable, groups ( name )",
      )
      .eq("branch_id", branch.id)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("starts_at"),
    ctx.can.academics
      ? supabase
          .from("schedule_conflicts")
          .select(
            "id, group_id, rule_id, local_date, conflict_kind, conflicting_lesson_id, groups ( name ), group_schedule_rules ( start_time, duration_minutes )",
          )
          .eq("branch_id", branch.id)
          .is("resolved_at", null)
          .order("local_date")
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);

  // Names of the lessons the conflicts clashed with.
  const otherIds = (conflicts ?? [])
    .map((c) => c.conflicting_lesson_id)
    .filter((id): id is string => Boolean(id));
  const { data: others } = otherIds.length
    ? await supabase.from("lessons").select("id, groups ( name )").in("id", otherIds)
    : { data: [] as { id: string; groups: { name: string } | null }[] };
  const otherName = new Map((others ?? []).map((o) => [o.id, o.groups?.name ?? "—"]));

  const teacherName = new Map(teachers.map((m) => [m.id, m.name]));
  const branchRooms = rooms.filter((r) => r.branchId === branch.id);

  const scheduleLessons: ScheduleLesson[] = (lessons ?? []).map((l) => {
    const start = localParts(l.starts_at, branch.timezone);
    const end = localParts(l.ends_at, branch.timezone);
    return {
      id: l.id,
      groupId: l.group_id,
      groupName: l.groups?.name ?? "—",
      branchId: branch.id,
      date: start.date,
      startMinutes: start.minutes,
      endMinutes: end.date === start.date ? end.minutes : 24 * 60,
      roomId: l.room_id,
      teacherId: l.teacher_membership_id,
      status: l.status,
      isBillable: l.is_billable,
      isMakeup: l.is_makeup,
      substituted: l.original_teacher_membership_id !== null,
    };
  });

  const conflictItems: ConflictItem[] = (conflicts ?? []).map((c) => ({
    id: c.id,
    groupId: c.group_id,
    groupName: c.groups?.name ?? "—",
    date: c.local_date,
    time: c.group_schedule_rules?.start_time.slice(0, 5) ?? "18:00",
    kind: c.conflict_kind as "room" | "teacher",
    otherGroup: c.conflicting_lesson_id ? (otherName.get(c.conflicting_lesson_id) ?? "—") : "—",
  }));

  const dayLabel = (d: string, style: "short" | "long") =>
    format.dateTime(dayAsDate(d), {
      weekday: style,
      day: "numeric",
      month: style === "long" ? "long" : "short",
      timeZone: "UTC",
    });
  const rangeLabel =
    view === "week"
      ? t("weekOf", {
          from: format.dateTime(dayAsDate(from), {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }),
          to: format.dateTime(dayAsDate(to), {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }),
        })
      : dayLabel(date, "long");

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
      />
      <ScheduleView
        view={view}
        by={by}
        date={date}
        today={today}
        prevDate={addDays(date, view === "week" ? -7 : -1)}
        nextDate={addDays(date, view === "week" ? 7 : 1)}
        rangeLabel={rangeLabel}
        days={weekDays(from)
          .slice(0, view === "week" ? 7 : 1)
          .map((d) => ({ date: d, label: dayLabel(d, "short") }))}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        branchId={branch.id}
        focus={one(raw.focus) ?? ""}
        rooms={branchRooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId }))}
        allRooms={rooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId }))}
        teachers={teachers.map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          branchIds: m.branchIds,
          palette: m.palette,
        }))}
        teacherNames={Object.fromEntries(teacherName)}
        lessons={scheduleLessons}
        conflicts={conflictItems}
        canEdit={ctx.can.academics && ctx.can.inBranch(branch.id)}
      />
    </>
  );
}
