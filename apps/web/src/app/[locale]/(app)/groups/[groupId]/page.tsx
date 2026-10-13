import { addDays, todayIn } from "@uteach/core";
import { Building2, CalendarDays, CalendarRange, DoorOpen, UserRound, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  DetailPage,
  EmptyState,
  InitialsAvatar,
  MobileRecord,
  PageHeader,
  ProfileCard,
  Section,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { loadGroupOptions, loadRooms, loadTeachers, teachersFor } from "@/lib/academics";
import { MARKING_OPENS_MS, markState, nowMs, type LessonStats } from "@/lib/attendance";
import { loadMatrix, monthParam, shiftMonth } from "@/lib/attendance-matrix";
import { getCenterContext } from "@/lib/center";
import { defaultExamType, loadExamTypes } from "@/lib/exams";
import { dayAsDate, hhmm, localParts, monthStart, weekdayLabels } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { minorToInput } from "@/lib/validation";
import { MarkChip } from "../../attendance/mark-chip";
import { groupFormData } from "../data";
import { EditGroupDialog } from "../group-dialog";
import {
  ExtraLessonButton,
  LessonActionsProvider,
  LessonRowActions,
  type LessonRef,
} from "../lesson-actions";
import { AttendanceTab, type TabLesson } from "./attendance-tab";
import { PricePanel } from "./price-panel";
import { RosterPanel, type RosterRow } from "./roster";
import { RulesEditor } from "./rules-editor";
import { ScoresTab } from "./scores-tab";

export async function generateMetadata() {
  const t = await getTranslations("groups");
  return { title: t("title") };
}

const STATUS_TONE: Record<string, ChipTone> = {
  forming: "warning",
  active: "success",
  finished: "muted",
};
const LESSON_TONE: Record<string, ChipTone> = {
  scheduled: "primary",
  held: "success",
  cancelled: "muted",
};

type LessonRow = LessonRef & {
  teacherName: string;
  roomName: string;
  isMakeup: boolean;
  substituted: boolean;
  cancelReason: string | null;
};

/**
 * Group page (12): ProfileCard + tabs Lessons | Roster | Attendance | Scores (16) | Schedule | Price (billing).
 * Teachers get a read-only view (and mark attendance and enter scores). `?tab=attendance&month=YYYY-MM` opens a
 * month; `?tab=scores&exam=` an exam type.
 */
export default async function GroupPage({
  params,
  searchParams,
}: PageProps<"/[locale]/groups/[groupId]">) {
  const { groupId } = await params;
  const sp = await searchParams;
  const ctx = await getCenterContext();
  const t = await getTranslations("groups");
  const tl = await getTranslations("lessons");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tAtt = await getTranslations("attendance");
  const tx = await getTranslations("exams");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id, name, branch_id, course_id, level_id, teacher_membership_id, room_id, capacity, status, start_date, end_date, archived_at, courses ( name, exam_type_id ), levels ( name )",
    )
    .eq("id", groupId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!group) notFound();

  const { data: branch } = await supabase
    .from("branches")
    .select("name, timezone")
    .eq("id", group.branch_id)
    .single();
  const tz = branch?.timezone ?? ctx.center.timezone;
  const today = todayIn(tz);
  const isStaff = ctx.can.seeAdminPages;
  const editable =
    ctx.can.academics && ctx.can.inBranch(group.branch_id) && group.archived_at === null;
  const showPrice = ctx.can.billing && isStaff;

  const [rooms, teachers, { data: rules }, { data: upcoming }, { data: past }, { data: prices }] =
    await Promise.all([
      loadRooms(ctx),
      loadTeachers(ctx),
      supabase
        .from("group_schedule_rules")
        .select(
          "id, weekday, start_time, duration_minutes, room_id, teacher_membership_id, valid_to",
        )
        .eq("group_id", groupId)
        .or(`valid_to.is.null,valid_to.gte.${today}`)
        .order("weekday")
        .order("start_time"),
      supabase
        .from("lessons")
        .select(
          "id, local_date, starts_at, ends_at, room_id, teacher_membership_id, original_teacher_membership_id, status, is_makeup, is_billable, cancel_reason",
        )
        .eq("group_id", groupId)
        .gte("local_date", today)
        .order("starts_at")
        .limit(24),
      supabase
        .from("lessons")
        .select(
          "id, local_date, starts_at, ends_at, room_id, teacher_membership_id, original_teacher_membership_id, status, is_makeup, is_billable, cancel_reason",
        )
        .eq("group_id", groupId)
        .lt("local_date", today)
        .order("starts_at", { ascending: false })
        .limit(24),
      showPrice
        ? supabase
            .from("group_prices")
            .select("id, price_amount, cycle_lessons, effective_from")
            .eq("group_id", groupId)
            .order("effective_from", { ascending: false })
        : Promise.resolve({
            data: [] as {
              id: string;
              price_amount: number;
              cycle_lessons: number;
              effective_from: string;
            }[],
          }),
    ]);

  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const teacherName = new Map(teachers.map((m) => [m.id, m.name]));
  const days = weekdayLabels(ctx.locale, "short");

  const toRow = (l: NonNullable<typeof upcoming>[number]): LessonRow => {
    const start = localParts(l.starts_at, tz);
    const end = localParts(l.ends_at, tz);
    return {
      id: l.id,
      groupId: group.id,
      groupName: group.name,
      branchId: group.branch_id,
      date: start.date,
      startMinutes: start.minutes,
      endMinutes: end.date === start.date ? end.minutes : 24 * 60,
      roomId: l.room_id,
      teacherId: l.teacher_membership_id,
      status: l.status,
      isBillable: l.is_billable,
      teacherName: teacherName.get(l.teacher_membership_id) ?? "—",
      roomName: l.room_id ? (roomName.get(l.room_id) ?? "—") : "—",
      isMakeup: l.is_makeup,
      substituted: l.original_teacher_membership_id !== null,
      cancelReason: l.cancel_reason,
    };
  };
  const upcomingRows = (upcoming ?? []).map(toRow);
  const pastRows = (past ?? []).map(toRow);

  // Attendance: counts per lesson for the Lessons tab, and one month for the Attendance tab (14).
  const thisMonth = today.slice(0, 7);
  const month = monthParam(sp.month, thisMonth);
  const lessonIds = [...upcomingRows, ...pastRows].map((r) => r.id);
  const [{ data: stats }, matrix, { data: centerRules }] = await Promise.all([
    lessonIds.length
      ? supabase.rpc("lesson_attendance_stats", { p_lesson_ids: lessonIds })
      : Promise.resolve({ data: [] }),
    loadMatrix(supabase, group.id, month, tz),
    supabase.from("centers").select("attendance_edit_hours").eq("id", ctx.center.id).single(),
  ]);
  const statsOf = new Map<string, LessonStats>(
    (stats ?? []).map((s) => [
      s.lesson_id,
      { expected: s.expected, marked: s.marked, absent: s.absent },
    ]),
  );
  const now = nowMs();
  const editHours = centerRules?.attendance_edit_hours ?? 48;
  const markAnyTime = ctx.can.attendance && ctx.can.inBranch(group.branch_id);
  const tabLessons: TabLesson[] = (matrix?.lessons ?? []).map((l) => ({
    id: l.id,
    date: l.date,
    startMinutes: l.startMinutes,
    cancelled: l.cancelled,
    // A hint only: save_attendance applies the same rules.
    editable:
      !l.cancelled &&
      now >= Date.parse(l.startsAt) - MARKING_OPENS_MS &&
      (markAnyTime ||
        (l.teacherId === ctx.membership.id && now < Date.parse(l.endsAt) + editHours * 3_600_000)),
  }));
  const startsOf = new Map(
    [...(upcoming ?? []), ...(past ?? [])].map((l) => [
      l.id,
      { startsAt: l.starts_at, endsAt: l.ends_at },
    ]),
  );
  const attendanceOf = (r: LessonRow) => {
    const times = startsOf.get(r.id);
    const chip = (
      <MarkChip
        state={markState(
          { status: r.status, startsAt: times?.startsAt ?? "", endsAt: times?.endsAt ?? "" },
          statsOf.get(r.id),
          now,
        )}
      />
    );
    return r.status === "cancelled" ? (
      chip
    ) : (
      <Link
        href={`/attendance/${r.id}`}
        aria-label={tAtt("list.open", { name: whenOf(r) })}
        className="inline-block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {chip}
      </Link>
    );
  };

  const whenOf = (r: LessonRow) =>
    `${format.dateTime(dayAsDate(r.date), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${hhmm(r.startMinutes)}–${hhmm(r.endMinutes)}`;
  const statusOf = (r: LessonRow) => (
    <span className="flex flex-wrap gap-1.5">
      <StatusChip tone={LESSON_TONE[r.status] ?? "muted"}>{tl(`status.${r.status}`)}</StatusChip>
      {r.isMakeup ? <StatusChip tone="primary">{tl("makeupChip")}</StatusChip> : null}
      {r.substituted ? <StatusChip tone="warning">{tl("substituteChip")}</StatusChip> : null}
    </span>
  );
  const teacherOf = (r: LessonRow) => r.teacherName;

  const lessonTable = (rows: LessonRow[], testId: string, empty: string) => (
    <DataTable
      testId={testId}
      rows={rows}
      rowKey={(r) => r.id}
      empty={<EmptyState icon={CalendarDays} title={empty} />}
      columns={[
        { key: "when", header: tl("when"), cell: whenOf },
        ...(isStaff ? [{ key: "teacher", header: tl("teacher"), cell: teacherOf }] : []),
        { key: "room", header: tl("room"), cell: (r: LessonRow) => r.roomName },
        { key: "status", header: tc("status"), cell: statusOf },
        { key: "attendance", header: tAtt("title"), cell: attendanceOf },
        ...(editable
          ? [
              {
                key: "actions",
                header: tc("actions"),
                cell: (r: LessonRow) => <LessonRowActions lesson={r} />,
                className: "w-36",
              },
            ]
          : []),
      ]}
      mobileCard={(r) => (
        <MobileRecord
          title={whenOf(r)}
          subtitle={isStaff ? `${r.teacherName} · ${r.roomName}` : r.roomName}
          status={statusOf(r)}
          fields={[
            { label: tAtt("title"), value: attendanceOf(r) },
            ...(r.cancelReason ? [{ label: tl("reason"), value: r.cancelReason }] : []),
          ]}
          actions={editable ? <LessonRowActions lesson={r} /> : undefined}
        />
      )}
    />
  );

  const ruleText = (rules ?? [])
    .map((r) => `${days[r.weekday]} ${r.start_time.slice(0, 5)}`)
    .join(", ");
  const branchRooms = rooms
    .filter((r) => r.branchId === group.branch_id)
    .map((r) => ({ value: r.id, label: r.name }));
  const branchTeachers = teachersFor(teachers, group.branch_id).map((m) => ({
    value: m.id,
    label: m.name,
  }));

  const priceRows = (prices ?? []).map((p) => ({
    id: p.id,
    from: p.effective_from,
    price: formatMinor(p.price_amount, ctx.center.currency, ctx.locale),
    cycleLessons: p.cycle_lessons,
    current: false,
  }));
  const currentIndex = priceRows.findIndex((p) => p.from <= today);
  if (currentIndex >= 0) priceRows[currentIndex]!.current = true;
  const currentPrice = (prices ?? [])[currentIndex >= 0 ? currentIndex : 0];

  const extra: LessonRef = {
    id: "",
    groupId: group.id,
    groupName: group.name,
    branchId: group.branch_id,
    date: today,
    startMinutes: 18 * 60,
    endMinutes: 18 * 60 + (rules?.[0]?.duration_minutes ?? 90),
    roomId: group.room_id,
    teacherId: group.teacher_membership_id ?? "",
    status: "scheduled",
    isBillable: true,
  };

  const formData = editable ? await groupFormData(ctx) : null;

  // Roster: staff read enrollments (with students); teachers get names only from group_roster() (03).
  const canEnroll =
    isStaff && ctx.can.students && ctx.can.inBranch(group.branch_id) && group.archived_at === null;
  const { data: levelRow } = group.level_id
    ? await supabase.from("levels").select("next_level_id").eq("id", group.level_id).maybeSingle()
    : { data: null };
  const rosterBase = {
    groupId: group.id,
    groupName: group.name,
    nextLevelId: levelRow?.next_level_id ?? null,
    today,
  };
  let rosterRows: RosterRow[];
  if (isStaff) {
    const { data: enrolled } = await supabase
      .from("enrollments")
      .select("id, student_id, status, start_date, end_date, students ( full_name )")
      .eq("group_id", group.id)
      .neq("status", "ended")
      .order("start_date");
    rosterRows = (enrolled ?? []).map((e) => ({
      ...rosterBase,
      id: e.id,
      studentId: e.student_id,
      studentName: e.students?.full_name ?? "—",
      status: e.status,
      startDate: e.start_date,
      endDate: e.end_date,
    }));
  } else {
    const { data: roster } = await supabase.rpc("group_roster", { p_group_id: group.id });
    rosterRows = (roster ?? []).map((e) => ({
      ...rosterBase,
      id: e.enrollment_id,
      studentId: e.student_id,
      studentName: e.full_name,
      status: e.status,
      startDate: e.start_date,
      endDate: e.end_date,
    }));
  }
  const [studentChoices, groupChoices] = canEnroll
    ? await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, phone")
          .eq("center_id", ctx.center.id)
          .is("archived_at", null)
          .order("full_name")
          .then(({ data }) =>
            (data ?? []).map((s) => ({ id: s.id, name: s.full_name, hint: s.phone ?? undefined })),
          ),
        loadGroupOptions(ctx).then((list) =>
          list
            .filter((g) => ctx.can.inBranch(g.branchId))
            .map((g) => ({
              id: g.id,
              name: g.name,
              capacity: g.capacity,
              count: g.count,
              levelId: g.levelId,
            })),
        ),
      ])
    : [[], []];
  const course = group.courses?.name ?? "";
  // Scores (16): the course's exam type unless `?exam=` picks another.
  const examTypes = (await loadExamTypes(ctx)).filter((x) => !x.archived);
  const examType =
    examTypes.find((x) => x.id === sp.exam) ??
    defaultExamType(examTypes, group.courses?.exam_type_id);
  const canEnterScores = isStaff
    ? ctx.can.academics && ctx.can.inBranch(group.branch_id) && group.archived_at === null
    : group.archived_at === null;
  const subtitle = [course, group.levels?.name].filter(Boolean).join(" · ");

  const tabs = [
    {
      value: "lessons",
      label: t("tabLessons"),
      content: (
        <div className="space-y-6">
          {editable ? (
            <div className="flex justify-end">
              <ExtraLessonButton lesson={extra} />
            </div>
          ) : null}
          <Section title={tl("upcoming")} titleSize="card" className="p-0 shadow-none sm:p-0">
            {lessonTable(upcomingRows, "lesson-row", tl("noUpcoming"))}
          </Section>
          <Section title={tl("past")} titleSize="card" className="p-0 shadow-none sm:p-0">
            {lessonTable(pastRows, "past-lesson-row", tl("noPast"))}
          </Section>
        </div>
      ),
    },
    {
      value: "roster",
      label: t("tabRoster"),
      content: (
        <RosterPanel
          group={{ id: group.id, name: group.name }}
          rows={rosterRows}
          isStaff={isStaff}
          editable={canEnroll}
          capacity={group.capacity}
          students={studentChoices}
          groups={groupChoices}
          canDiscount={ctx.can.discounts}
          canOverridePrice={ctx.can.discounts && ctx.can.billing}
        />
      ),
    },
    {
      value: "attendance",
      label: t("tabAttendance"),
      content: matrix ? (
        <AttendanceTab
          month={month}
          prevMonth={shiftMonth(month, -1)}
          nextMonth={shiftMonth(month, 1)}
          thisMonth={thisMonth}
          exportHref={`/${ctx.locale}/groups/${group.id}/attendance/export?month=${month}`}
          lessons={tabLessons}
          students={matrix.students}
        />
      ) : null,
    },
    ...(examType
      ? [
          {
            value: "scores",
            label: tx("group.tab"),
            content: (
              <ScoresTab
                groupId={group.id}
                type={examType}
                types={examTypes}
                canEnter={canEnterScores}
              />
            ),
          },
        ]
      : []),
    {
      value: "schedule",
      label: t("tabSchedule"),
      content: editable ? (
        <RulesEditor
          groupId={group.id}
          timeZone={tz}
          rooms={branchRooms}
          teachers={branchTeachers}
          slots={(rules ?? []).map((r) => ({
            id: r.id,
            weekday: r.weekday,
            startTime: r.start_time.slice(0, 5),
            durationMinutes: r.duration_minutes,
            roomId: r.room_id,
            teacherMembershipId: r.teacher_membership_id,
          }))}
        />
      ) : (
        <p className="text-[15px] text-secondary-foreground">{ruleText || t("noSchedule")}</p>
      ),
    },
    ...(showPrice
      ? [
          {
            value: "price",
            label: t("tabPrice"),
            content: (
              <PricePanel
                groupId={group.id}
                rows={priceRows}
                editable={editable}
                nextMonth={monthStart(addDays(monthStart(today), 32)).slice(0, 7)}
                currentPrice={minorToInput(currentPrice?.price_amount)}
                currentCycle={currentPrice?.cycle_lessons ?? 12}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <LessonActionsProvider
      rooms={rooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId }))}
      teachers={teachers.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        branchIds: m.branchIds,
      }))}
    >
      <PageHeader
        title={group.name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: isStaff ? "/home" : "/today" },
          { label: isStaff ? tn("groups") : tn("myGroups"), href: "/groups" },
          { label: group.name },
        ]}
        action={
          editable && formData ? (
            <EditGroupDialog
              data={formData}
              group={{
                id: group.id,
                name: group.name,
                branchId: group.branch_id,
                courseId: group.course_id,
                levelId: group.level_id,
                teacherId: group.teacher_membership_id,
                roomId: group.room_id,
                capacity: group.capacity,
                status: group.status,
                startDate: group.start_date,
                endDate: group.end_date,
              }}
              trigger={
                <Button variant="outline-primary" size="lg">
                  {tc("edit")}
                </Button>
              }
            />
          ) : undefined
        }
      />
      <DetailPage
        header={
          <ProfileCard
            avatar={<InitialsAvatar name={group.courses?.name ?? group.name} size="lg" />}
            name={group.name}
            subtitle={subtitle}
            rows={[
              ...(isStaff
                ? [
                    {
                      key: "teacher",
                      icon: UserRound,
                      value: group.teacher_membership_id
                        ? (teacherName.get(group.teacher_membership_id) ?? "—")
                        : t("noTeacher"),
                    },
                  ]
                : []),
              {
                key: "room",
                icon: DoorOpen,
                value: group.room_id ? (roomName.get(group.room_id) ?? "—") : t("noRoom"),
              },
              { key: "branch", icon: Building2, value: branch?.name ?? "—" },
              { key: "schedule", icon: CalendarDays, value: ruleText || t("noSchedule") },
              {
                key: "dates",
                icon: CalendarRange,
                value: group.end_date
                  ? t("datesRange", {
                      from: format.dateTime(dayAsDate(group.start_date), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }),
                      to: format.dateTime(dayAsDate(group.end_date), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }),
                    })
                  : t("datesFrom", {
                      from: format.dateTime(dayAsDate(group.start_date), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }),
                    }),
              },
              ...(group.capacity
                ? [
                    {
                      key: "capacity",
                      icon: Users,
                      value: t("capacityValue", { count: group.capacity }),
                    },
                  ]
                : []),
            ]}
            chip={
              group.archived_at ? (
                <StatusChip tone="muted">{tc("archived")}</StatusChip>
              ) : (
                <StatusChip tone={STATUS_TONE[group.status] ?? "muted"}>
                  {t(`status.${group.status}`)}
                </StatusChip>
              )
            }
          />
        }
        tabs={tabs}
        defaultTab={
          typeof sp.tab === "string" && tabs.some((x) => x.value === sp.tab) ? sp.tab : undefined
        }
      />
    </LessonActionsProvider>
  );
}
