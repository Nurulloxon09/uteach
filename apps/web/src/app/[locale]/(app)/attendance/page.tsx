import { addDays, todayIn } from "@uteach/core";
import { CalendarCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  PageHeader,
  Section,
} from "@/components/patterns";
import { loadBranches, loadRooms, loadTeachers } from "@/lib/academics";
import { markState, nowMs, type LessonStats } from "@/lib/attendance";
import { requireAdminContext } from "@/lib/center";
import { dayAsDate, hhmm, isLocalDate, localParts } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { AttendanceToolbar } from "./attendance-toolbar";
import { MarkChip } from "./mark-chip";
import { OpenSheetAction } from "./open-sheet-action";

export async function generateMetadata() {
  const t = await getTranslations("attendance");
  return { title: t("title") };
}

/**
 * Owner/admin Attendance (14, M2 plan): the lessons of one day in the user's branches with their marking
 * state, or the lessons of the last 7 days that nobody marked. Each opens the sheet.
 */
export default async function AttendancePage({ searchParams }: PageProps<"/[locale]/attendance">) {
  const ctx = await requireAdminContext();
  const sp = await searchParams;
  const t = await getTranslations("attendance");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();

  const today = todayIn(ctx.center.timezone);
  const date = isLocalDate(sp.date) ? sp.date : today;
  const view = sp.view === "unmarked" ? "unmarked" : "day";
  const branches = await loadBranches(ctx);
  const branch =
    typeof sp.branch === "string" && branches.some((b) => b.id === sp.branch) ? sp.branch : null;

  let query = supabase
    .from("lessons")
    .select(
      "id, group_id, branch_id, local_date, starts_at, ends_at, room_id, status, teacher_membership_id, groups ( name )",
    )
    .eq("center_id", ctx.center.id);
  query =
    view === "day"
      ? query.eq("local_date", date)
      : query
          .gte("local_date", addDays(today, -6))
          .lte("local_date", today)
          .eq("status", "scheduled")
          .lt("ends_at", new Date(nowMs()).toISOString());
  if (branch) query = query.eq("branch_id", branch);

  const [{ data: lessons }, rooms, teachers] = await Promise.all([
    query.order("starts_at").limit(500),
    loadRooms(ctx),
    loadTeachers(ctx),
  ]);
  const ids = (lessons ?? []).map((l) => l.id);
  const { data: stats } = ids.length
    ? await supabase.rpc("lesson_attendance_stats", { p_lesson_ids: ids })
    : { data: [] };

  const statsOf = new Map<string, LessonStats>(
    (stats ?? []).map((s) => [
      s.lesson_id,
      { expected: s.expected, marked: s.marked, absent: s.absent },
    ]),
  );
  const tzOf = new Map(branches.map((b) => [b.id, b.timezone]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const teacherName = new Map(teachers.map((m) => [m.id, m.name]));
  const now = nowMs();

  type Row = NonNullable<typeof lessons>[number];
  const timeOf = (l: Row) => {
    const tz = tzOf.get(l.branch_id) ?? ctx.center.timezone;
    const range = `${hhmm(localParts(l.starts_at, tz).minutes)}–${hhmm(localParts(l.ends_at, tz).minutes)}`;
    return view === "day"
      ? range
      : `${format.dateTime(dayAsDate(l.local_date), { day: "numeric", month: "short", timeZone: "UTC" })} · ${range}`;
  };
  const groupName = (l: Row) => l.groups?.name ?? "—";
  const stateOf = (l: Row) => (
    <MarkChip
      state={markState(
        { status: l.status, startsAt: l.starts_at, endsAt: l.ends_at },
        statsOf.get(l.id),
        now,
      )}
    />
  );
  const actionsOf = (l: Row) => (
    <OpenSheetAction
      href={`/attendance/${l.id}`}
      label={t("list.open", { name: `${groupName(l)} ${timeOf(l)}` })}
    />
  );

  const title =
    view === "day"
      ? t("list.dayTitle", {
          date: format.dateTime(dayAsDate(date), {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }),
        })
      : t("list.unmarkedTitle");

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
      />
      <Section
        title={title}
        tools={
          <AttendanceToolbar
            view={view}
            prevDate={addDays(date, -1)}
            nextDate={addDays(date, 1)}
            today={today}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          />
        }
      >
        <DataTable
          testId="attendance-lesson"
          rows={lessons ?? []}
          rowKey={(l) => l.id}
          empty={
            <EmptyState
              icon={CalendarCheck}
              title={view === "day" ? t("list.emptyTitle") : t("list.unmarkedEmptyTitle")}
              hint={view === "day" ? t("list.emptyHint") : t("list.unmarkedEmptyHint")}
            />
          }
          columns={[
            { key: "time", header: view === "day" ? t("list.time") : t("list.date"), cell: timeOf },
            {
              key: "group",
              header: t("list.group"),
              cell: (l) => (
                <NameCell avatar={<InitialsAvatar name={groupName(l)} />} name={groupName(l)} />
              ),
            },
            {
              key: "teacher",
              header: t("list.teacher"),
              cell: (l) => teacherName.get(l.teacher_membership_id) ?? "—",
            },
            {
              key: "room",
              header: t("list.room"),
              cell: (l) => (l.room_id ? (roomName.get(l.room_id) ?? "—") : t("list.noRoom")),
            },
            { key: "state", header: t("list.state"), cell: stateOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-20" },
          ]}
          mobileCard={(l) => (
            <MobileRecord
              avatar={<InitialsAvatar name={groupName(l)} />}
              title={groupName(l)}
              subtitle={timeOf(l)}
              status={stateOf(l)}
              fields={[
                {
                  label: t("list.teacher"),
                  value: teacherName.get(l.teacher_membership_id) ?? "—",
                },
              ]}
              actions={actionsOf(l)}
            />
          )}
        />
      </Section>
    </>
  );
}
