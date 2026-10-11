"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PALETTE_BLOCK, type PaletteKey } from "@/lib/palette";
import { cn } from "@/lib/utils";

export type TimetableColumn = { key: string; label: string; sublabel?: string };

export type TimetableLesson = {
  id: string;
  /** Column key (a day, a room or a teacher). */
  column: string;
  /** Minutes from local midnight. */
  startMinutes: number;
  endMinutes: number;
  title: string;
  subtitle?: string;
  palette: PaletteKey;
  status: "scheduled" | "held" | "cancelled";
  /** Short marker such as "Makeup" or "Substitute". */
  badge?: string;
  draggable?: boolean;
};

const HOUR_PX = 80; // the reference's h-20 hour rows
const PX_PER_MIN = HOUR_PX / 60;

const pad = (n: number) => String(n).padStart(2, "0");
export const minutesLabel = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Side-by-side lanes for lessons that overlap within one column. */
function layoutLanes(lessons: TimetableLesson[]) {
  const sorted = [...lessons].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  const placed = new Map<string, { lane: number; lanes: number }>();
  let cluster: { lesson: TimetableLesson; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) placed.set(c.lesson.id, { lane: c.lane, lanes });
    cluster = [];
  };
  for (const lesson of sorted) {
    if (lesson.startMinutes >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const busy = new Set(
      cluster.filter((c) => c.lesson.endMinutes > lesson.startMinutes).map((c) => c.lane),
    );
    let lane = 0;
    while (busy.has(lane)) lane++;
    cluster.push({ lesson, lane });
    clusterEnd = Math.max(clusterEnd, lesson.endMinutes);
  }
  flush();
  return placed;
}

/**
 * Week or day grid (reference `MasterCalendar`, restyled with tokens): a time column, one column per day,
 * room or teacher, `h-20` hour rows and rounded lesson blocks tinted by the teacher's palette color.
 * Scheduled lessons can be dragged to another time or column (`onMove`, snapped to `slotMinutes`); the
 * server has the final word. `renderActions` fills a popover opened by clicking a lesson.
 * Desktop only: below `md` screens show a day list instead (`LessonList`).
 */
export function Timetable({
  columns,
  lessons,
  startHour = 8,
  endHour = 21,
  slotMinutes = 15,
  onMove,
  renderActions,
  testId,
}: {
  columns: TimetableColumn[];
  lessons: TimetableLesson[];
  startHour?: number;
  endHour?: number;
  slotMinutes?: number;
  onMove?: (lessonId: string, column: string, startMinutes: number) => void;
  renderActions?: (lesson: TimetableLesson) => ReactNode;
  testId?: string;
}) {
  const t = useTranslations("timetable");
  // A stable id keeps dnd-kit's accessibility ids the same on the server and in the browser (hydration).
  const dndId = useId();
  const byId = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const columnLabel = useMemo(() => new Map(columns.map((c) => [c.key, c.label])), [columns]);
  const lanes = useMemo(() => {
    const result = new Map<string, { lane: number; lanes: number }>();
    for (const column of columns) {
      const inColumn = lessons.filter((l) => l.column === column.key);
      for (const [id, place] of layoutLanes(inColumn)) result.set(id, place);
    }
    return result;
  }, [columns, lessons]);

  const first = startHour * 60;
  const last = endHour * 60;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const slotPx = slotMinutes * PX_PER_MIN;

  // Arrow keys move a picked-up lesson by one slot (up/down) or a column width (left/right).
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const step = {
      ArrowUp: [0, -slotPx],
      ArrowDown: [0, slotPx],
      ArrowLeft: [-160, 0],
      ArrowRight: [160, 0],
    }[event.code];
    if (!step) return undefined;
    event.preventDefault();
    return { x: currentCoordinates.x + step[0]!, y: currentCoordinates.y + step[1]! };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("dragStart", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("dragOver", {
            title: titleOf(active.id),
            column: columnLabel.get(String(over.id)) ?? "",
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dragEnd", {
            title: titleOf(active.id),
            column: columnLabel.get(String(over.id)) ?? "",
          })
        : t("dragCancel", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t("dragCancel", { title: titleOf(active.id) }),
  };

  function handleDragEnd(event: DragEndEvent) {
    const lesson = byId.get(String(event.active.id));
    if (!lesson || !onMove) return;
    const shift = Math.round(event.delta.y / PX_PER_MIN / slotMinutes) * slotMinutes;
    const duration = lesson.endMinutes - lesson.startMinutes;
    const start = Math.min(Math.max(lesson.startMinutes + shift, first), last - duration);
    const column = event.over ? String(event.over.id) : lesson.column;
    if (start === lesson.startMinutes && column === lesson.column) return;
    onMove(lesson.id, column, start);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("dragInstructions") },
      }}
    >
      <div className="overflow-x-auto" data-testid={testId}>
        <div
          className="grid min-w-full overflow-hidden rounded-xl border border-border/70"
          style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(9rem, 1fr))` }}
        >
          {/* Header row */}
          <div className="border-r border-b border-border/70 bg-primary-soft/60 p-3 text-center">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("time")}
            </span>
          </div>
          {columns.map((c) => (
            <div
              key={c.key}
              className="border-b border-border/70 bg-primary-soft/60 p-3 text-center not-last:border-r"
            >
              <p className="truncate text-sm font-semibold text-foreground">{c.label}</p>
              {c.sublabel ? (
                <p className="truncate text-xs text-muted-foreground">{c.sublabel}</p>
              ) : null}
            </div>
          ))}

          {/* Time column */}
          <div className="relative border-r border-border/70 bg-card">
            {hours.map((h) => (
              <div key={h} className="relative h-20 border-b border-border/40 last:border-b-0">
                <span className="absolute top-1 left-0 w-full text-center text-xs font-medium text-muted-foreground">
                  {minutesLabel(h * 60)}
                </span>
              </div>
            ))}
          </div>

          {/* Columns */}
          {columns.map((c) => (
            <TimetableColumnBody
              key={c.key}
              column={c}
              hours={hours}
              first={first}
              lessons={lessons.filter((l) => l.column === c.key)}
              lanes={lanes}
              canDrag={Boolean(onMove)}
              renderActions={renderActions}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

function TimetableColumnBody({
  column,
  hours,
  first,
  lessons,
  lanes,
  canDrag,
  renderActions,
}: {
  column: TimetableColumn;
  hours: number[];
  first: number;
  lessons: TimetableLesson[];
  lanes: Map<string, { lane: number; lanes: number }>;
  canDrag: boolean;
  renderActions?: (lesson: TimetableLesson) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative bg-card not-last:border-r not-last:border-border/70",
        isOver && "bg-primary-soft/40",
      )}
    >
      {hours.map((h) => (
        <div key={h} className="h-20 border-b border-border/40 last:border-b-0" />
      ))}
      {lessons.map((lesson) => {
        const place = lanes.get(lesson.id) ?? { lane: 0, lanes: 1 };
        return (
          <LessonBlock
            key={lesson.id}
            lesson={lesson}
            top={(lesson.startMinutes - first) * PX_PER_MIN}
            height={(lesson.endMinutes - lesson.startMinutes) * PX_PER_MIN}
            lane={place.lane}
            lanes={place.lanes}
            canDrag={canDrag && Boolean(lesson.draggable) && lesson.status === "scheduled"}
            actions={renderActions?.(lesson)}
          />
        );
      })}
    </div>
  );
}

function LessonBlock({
  lesson,
  top,
  height,
  lane,
  lanes,
  canDrag,
  actions,
}: {
  lesson: TimetableLesson;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  canDrag: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lesson.id,
    disabled: !canDrag,
  });
  const cancelled = lesson.status === "cancelled";
  const width = 100 / lanes;
  const range = `${minutesLabel(lesson.startMinutes)}–${minutesLabel(lesson.endMinutes)}`;
  const when = lesson.badge ? `${range} · ${lesson.badge}` : range;

  const block = (
    <button
      type="button"
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      {...attributes}
      data-testid="timetable-lesson"
      data-lesson-id={lesson.id}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-lg border-l-4 px-2 py-1.5 text-left shadow-card outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40",
        PALETTE_BLOCK[lesson.palette],
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        cancelled && "opacity-55",
        isDragging && "z-20 shadow-shell",
      )}
      style={{
        top: top + 2,
        height: Math.max(height - 4, 22),
        left: `calc(${lane * width}% + 4px)`,
        width: `calc(${width}% - 8px)`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <span className={cn("truncate text-xs font-bold", cancelled && "line-through")}>
        {lesson.title}
      </span>
      {lesson.subtitle ? (
        <span className="truncate text-[11px] font-medium opacity-80">{lesson.subtitle}</span>
      ) : null}
      <span className="truncate text-[11px] font-medium opacity-80">{when}</span>
    </button>
  );

  if (!actions) return block;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{block}</PopoverTrigger>
      <PopoverContent className="w-72" onClick={() => setOpen(false)}>
        {actions}
      </PopoverContent>
    </Popover>
  );
}
