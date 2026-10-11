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
import { loadRooms, loadTeachers, teachersFor } from "@/lib/academics";
import { getCenterContext } from "@/lib/center";
import { dayAsDate, hhmm, localParts, monthStart, weekdayLabels } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { minorToInput } from "@/lib/validation";
import { groupFormData } from "../data";
import { EditGroupDialog } from "../group-dialog";
import {
  ExtraLessonButton,
  LessonActionsProvider,
  LessonRowActions,
  type LessonRef,
} from "../lesson-actions";
import { PricePanel } from "./price-panel";
import { RulesEditor } from "./rules-editor";

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

/** Group page (12): ProfileCard + tabs Lessons | Schedule | Price (billing). Teachers get a read-only view. */
export default async function GroupPage({ params }: PageProps<"/[locale]/groups/[groupId]">) {
  const { groupId } = await params;
  const ctx = await getCenterContext();
  const t = await getTranslations("groups");
  const tl = await getTranslations("lessons");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id, name, branch_id, course_id, level_id, teacher_membership_id, room_id, capacity, status, start_date, end_date, archived_at, courses ( name ), levels ( name )",
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
          fields={r.cancelReason ? [{ label: tl("reason"), value: r.cancelReason }] : []}
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
  const course = group.courses?.name ?? "";
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
      />
    </LessonActionsProvider>
  );
}
