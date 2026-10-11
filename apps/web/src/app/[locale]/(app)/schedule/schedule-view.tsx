"use client";

import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  UserRound,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  Field,
  FormDialog,
  LessonList,
  MobileCard,
  MobileList,
  SegmentedControl,
  Section,
  SelectField,
  StatusChip,
  Timetable,
  type TimetableColumn,
  type TimetableLesson,
} from "@/components/patterns";
import { useListParams } from "@/components/patterns/url-params";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions";
import { hhmm } from "@/lib/dates";
import type { PaletteKey } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { dropLessonAction, placeConflictAction, skipConflictAction } from "../groups/actions";
import { LessonActionsProvider, LessonMenu, type LessonRef } from "../groups/lesson-actions";

export type ScheduleLesson = LessonRef & { isMakeup: boolean; substituted: boolean };
export type ConflictItem = {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  time: string;
  kind: "room" | "teacher";
  otherGroup: string;
};
type Teacher = { id: string; name: string; role: string; branchIds: string[]; palette: PaletteKey };
type Room = { id: string; name: string; branchId: string };

const ALL = "__all__";
const NO_ROOM = "__none__";

export function ScheduleView({
  view,
  by,
  date,
  today,
  prevDate,
  nextDate,
  rangeLabel,
  days,
  branches,
  branchId,
  focus,
  rooms,
  allRooms,
  teachers,
  teacherNames,
  lessons,
  conflicts,
  canEdit,
}: {
  view: "week" | "day";
  by: "room" | "teacher";
  date: string;
  today: string;
  prevDate: string;
  nextDate: string;
  rangeLabel: string;
  days: { date: string; label: string }[];
  branches: { id: string; name: string }[];
  branchId: string;
  focus: string;
  rooms: Room[];
  allRooms: Room[];
  teachers: Teacher[];
  teacherNames: Record<string, string>;
  lessons: ScheduleLesson[];
  conflicts: ConflictItem[];
  canEdit: boolean;
}) {
  const t = useTranslations("schedule");
  const tl = useTranslations("lessons");
  const te = useTranslations("errors");
  const { setParams, hrefWith } = useListParams();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [, startTransition] = useTransition();

  const palette = new Map(teachers.map((m) => [m.id, m.palette]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const nameOf = (id: string) => teacherNames[id] ?? "—";

  // Columns and which lessons show.
  let columns: TimetableColumn[];
  let shown = lessons;
  let columnOf: (l: ScheduleLesson) => string;
  if (view === "week") {
    columns = days.map((d) => ({ key: d.date, label: d.label }));
    columnOf = (l) => l.date;
    if (focus)
      shown = lessons.filter((l) => (by === "room" ? l.roomId === focus : l.teacherId === focus));
  } else if (by === "room") {
    columns = rooms.map((r) => ({ key: r.id, label: r.name }));
    if (lessons.some((l) => !l.roomId)) columns.push({ key: NO_ROOM, label: t("noRoom") });
    columnOf = (l) => l.roomId ?? NO_ROOM;
  } else {
    const ids = new Set([
      ...lessons.map((l) => l.teacherId),
      ...teachers
        .filter((m) => m.role === "teacher" && m.branchIds.includes(branchId))
        .map((m) => m.id),
    ]);
    columns = [...ids].map((id) => ({ key: id, label: nameOf(id) }));
    columnOf = (l) => l.teacherId;
  }

  const timetableLessons: TimetableLesson[] = shown.map((l) => ({
    id: l.id,
    column: columnOf(l),
    startMinutes: l.startMinutes,
    endMinutes: l.endMinutes,
    title: l.groupName,
    subtitle:
      by === "room" || view === "week"
        ? `${nameOf(l.teacherId)} · ${l.roomId ? (roomName.get(l.roomId) ?? "—") : t("noRoom")}`
        : l.roomId
          ? (roomName.get(l.roomId) ?? "—")
          : t("noRoom"),
    palette: palette.get(l.teacherId) ?? "violet",
    status: l.status,
    badge: l.isMakeup
      ? tl("makeupChip")
      : l.substituted
        ? tl("substituteChip")
        : l.status === "cancelled"
          ? tl("status.cancelled")
          : undefined,
    draggable: canEdit,
  }));

  const starts = shown.map((l) => l.startMinutes);
  const ends = shown.map((l) => l.endMinutes);
  const startHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)));
  const endHour = Math.max(21, ...ends.map((m) => Math.ceil(m / 60)));

  const byId = new Map(lessons.map((l) => [l.id, l]));
  const onMove = (lessonId: string, column: string, startMinutes: number) => {
    const lesson = byId.get(lessonId);
    if (!lesson) return;
    let newDate = lesson.date;
    let roomId: string | null = null;
    if (view === "week") newDate = column;
    else if (by === "room") roomId = column === NO_ROOM ? null : column;
    else if (column !== lesson.teacherId) {
      toast.error(t("useSubstitute"));
      return;
    }
    startTransition(async () => {
      const result = await dropLessonAction(lessonId, newDate, startMinutes, roomId);
      if (result.ok) toast.success(tl("moved"));
      else toast.error(te(result.error as never));
    });
  };

  const focusOptions =
    by === "room"
      ? rooms.map((r) => ({ value: r.id, label: r.name }))
      : teachers
          .filter((m) => m.role === "owner" || m.branchIds.includes(branchId))
          .map((m) => ({ value: m.id, label: m.name }));

  const dayLessons = lessons
    .filter((l) => l.date === date)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <LessonActionsProvider rooms={allRooms} teachers={teachers}>
      <Section
        title={rangeLabel}
        tools={
          <>
            <div className="flex items-center gap-1">
              <Link
                href={hrefWith({ date: prevDate })}
                aria-label={t("previous")}
                className={buttonVariants({ variant: "outline", size: "icon" })}
              >
                <ChevronLeft />
              </Link>
              <Link
                href={hrefWith({ date: today })}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("today")}
              </Link>
              <Link
                href={hrefWith({ date: nextDate })}
                aria-label={t("next")}
                className={buttonVariants({ variant: "outline", size: "icon" })}
              >
                <ChevronRight />
              </Link>
            </div>
            <SegmentedControl
              label={t("viewLabel")}
              value={view}
              options={[
                { value: "week", label: t("week") },
                { value: "day", label: t("day") },
              ]}
              onChange={(v) => setParams({ view: v, focus: null })}
              testId="view-toggle"
            />
            <SegmentedControl
              label={t("byLabel")}
              value={by}
              options={[
                { value: "room", label: t("byRoom") },
                { value: "teacher", label: t("byTeacher") },
              ]}
              onChange={(v) => setParams({ by: v, focus: null })}
            />
            {branches.length > 1 ? (
              <Select value={branchId} onValueChange={(v) => setParams({ branch: v, focus: null })}>
                <SelectTrigger aria-label={t("branch")} className="h-11 w-auto min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {view === "week" ? (
              <Select
                value={focus || ALL}
                onValueChange={(v) => setParams({ focus: v === ALL ? null : v })}
              >
                <SelectTrigger
                  aria-label={by === "room" ? t("focusRoom") : t("focusTeacher")}
                  className="h-11 w-auto min-w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    {by === "room" ? t("allRooms") : t("allTeachers")}
                  </SelectItem>
                  {focusOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {canEdit ? (
              <Button
                variant={conflicts.length ? "outline-primary" : "outline"}
                onClick={() => setInboxOpen(true)}
                data-testid="conflicts-button"
              >
                <AlertTriangle />
                {t("conflicts", { count: conflicts.length })}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="hidden md:block">
          <Timetable
            columns={columns}
            lessons={timetableLessons}
            startHour={startHour}
            endHour={endHour}
            onMove={canEdit ? onMove : undefined}
            renderActions={(tl2) => {
              const lesson = byId.get(tl2.id);
              return lesson ? (
                <LessonPopover
                  lesson={lesson}
                  teacher={nameOf(lesson.teacherId)}
                  room={lesson.roomId ? (roomName.get(lesson.roomId) ?? "—") : t("noRoom")}
                  canEdit={canEdit}
                />
              ) : null;
            }}
            testId="timetable"
          />
        </div>
        <div className="md:hidden">
          {dayLessons.length ? (
            <LessonList
              testId="day-lesson"
              items={dayLessons.map((l) => ({
                id: l.id,
                time: `${hhmm(l.startMinutes)}–${hhmm(l.endMinutes)}`,
                title: l.groupName,
                subtitle: `${nameOf(l.teacherId)} · ${l.roomId ? (roomName.get(l.roomId) ?? "—") : t("noRoom")}`,
                palette: palette.get(l.teacherId) ?? "violet",
                cancelled: l.status === "cancelled",
                href: `/groups/${l.groupId}`,
              }))}
            />
          ) : (
            <EmptyState icon={DoorOpen} title={t("emptyDay")} />
          )}
        </div>
      </Section>

      {canEdit ? (
        <ConflictsInbox
          open={inboxOpen}
          onOpenChange={setInboxOpen}
          conflicts={conflicts}
          branchId={branchId}
          rooms={rooms}
        />
      ) : null}
    </LessonActionsProvider>
  );
}

function LessonPopover({
  lesson,
  teacher,
  room,
  canEdit,
}: {
  lesson: ScheduleLesson;
  teacher: string;
  room: string;
  canEdit: boolean;
}) {
  const t = useTranslations("lessons");
  const time = `${hhmm(lesson.startMinutes)}–${hhmm(lesson.endMinutes)}`;
  return (
    <div className="space-y-3" data-testid="lesson-popover">
      <div>
        <p className="font-semibold text-foreground">{lesson.groupName}</p>
        <p className="text-sm text-muted-foreground">{time}</p>
      </div>
      <div className="space-y-1 text-sm text-secondary-foreground">
        <p className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          {teacher}
        </p>
        <p className="flex items-center gap-2">
          <DoorOpen className="size-4 text-primary" />
          {room}
        </p>
        {lesson.status !== "scheduled" ? (
          <StatusChip tone={lesson.status === "held" ? "success" : "muted"}>
            {t(`status.${lesson.status}`)}
          </StatusChip>
        ) : null}
      </div>
      <Link
        href={`/groups/${lesson.groupId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-start")}
      >
        <ArrowRight />
        {t("openGroup")}
      </Link>
      {canEdit ? <LessonMenu lesson={lesson} /> : null}
    </div>
  );
}

function ConflictsInbox({
  open,
  onOpenChange,
  conflicts,
  branchId,
  rooms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictItem[];
  branchId: string;
  rooms: Room[];
}) {
  const t = useTranslations("schedule");
  const format = useFormatter();
  const [placing, setPlacing] = useState<ConflictItem | null>(null);
  const [pending, startTransition] = useTransition();

  const skip = (c: ConflictItem) =>
    startTransition(async () => {
      const form = new FormData();
      form.set("id", c.id);
      const result: ActionState = await skipConflictAction(null, form);
      if (result?.ok) toast.success(t("skipped"));
    });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-6">
          <SheetTitle className="text-xl font-bold">{t("inboxTitle")}</SheetTitle>
          <SheetDescription className="mt-1 text-[15px] text-muted-foreground">
            {t("inboxHint")}
          </SheetDescription>
          <div className="mt-5">
            {conflicts.length === 0 ? (
              <EmptyState icon={AlertTriangle} title={t("inboxEmpty")} />
            ) : (
              <MobileList>
                {conflicts.map((c) => {
                  const when = `${format.dateTime(new Date(`${c.date}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${c.time}`;
                  return (
                    <MobileCard key={c.id} variant="inset" data-testid="conflict-item">
                      <p className="font-semibold text-foreground">{c.groupName}</p>
                      <p className="text-sm text-muted-foreground">{when}</p>
                      <p className="mt-2 text-sm text-secondary-foreground">
                        {t(c.kind === "room" ? "clashRoom" : "clashTeacher", {
                          group: c.otherGroup,
                        })}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => skip(c)}
                        >
                          {t("skip")}
                        </Button>
                        <Button size="sm" variant="outline-primary" onClick={() => setPlacing(c)}>
                          {t("place")}
                        </Button>
                      </div>
                    </MobileCard>
                  );
                })}
              </MobileList>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <FormDialog
        open={placing !== null}
        onOpenChange={(o) => {
          if (!o) setPlacing(null);
        }}
        title={t("placeTitle")}
        description={placing ? t("placeHint", { group: placing.groupName }) : undefined}
        action={async (prev: ActionState, form: FormData) => {
          if (form.get("roomId") === ALL) form.set("roomId", "");
          return placeConflictAction(prev, form);
        }}
        submitLabel={t("placeSubmit")}
        successToast={t("placed")}
      >
        {(state) =>
          placing ? (
            <>
              <input type="hidden" name="id" value={placing.id} />
              <input type="hidden" name="branchId" value={branchId} />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  name="date"
                  type="date"
                  label={t("date")}
                  defaultValue={placing.date}
                  state={state}
                  required
                />
                <Field
                  name="time"
                  type="time"
                  step={300}
                  label={t("time")}
                  defaultValue={placing.time}
                  state={state}
                  required
                />
              </div>
              <SelectField
                name="roomId"
                label={t("room")}
                state={state}
                defaultValue={ALL}
                options={[
                  { value: ALL, label: t("ruleRoom") },
                  ...rooms.map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
            </>
          ) : null
        }
      </FormDialog>
    </>
  );
}
