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
import { useId, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusChip, type ChipTone } from "./status-chip";

export type KanbanColumn = {
  key: string;
  title: string;
  count: number;
  tone?: ChipTone;
  /** A narrow column that shows only its count and `footer` (e.g. Won / Lost), still a drop target. */
  compact?: boolean;
  footer?: ReactNode;
};

export type KanbanItem = { id: string; column: string; title: string; draggable?: boolean };

/** Column width + gap, for keyboard moves between columns. */
const COLUMN_STEP = 296;

/**
 * Columns of cards that can be dragged from one column to another (05-ui, M5 plan). Pointer drags start
 * after 6 px so clicks on links inside a card still work; the keyboard picks a card up with space and moves
 * it a column at a time with the arrow keys. The board only reports the drop (`onMove`); the page decides
 * what it means and refreshes `items`. Scrolls sideways when the columns don't fit.
 */
export function KanbanBoard<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  empty,
  testId,
}: {
  columns: KanbanColumn[];
  items: T[];
  renderCard: (item: T) => ReactNode;
  onMove: (item: T, toColumn: string) => void;
  /** Shown in a column without cards. */
  empty?: ReactNode;
  testId?: string;
}) {
  const t = useTranslations("kanban");
  // A stable id keeps dnd-kit's accessibility ids the same on the server and in the browser (hydration).
  const dndId = useId();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const columnTitle = useMemo(() => new Map(columns.map((c) => [c.key, c.title])), [columns]);

  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const step = { ArrowLeft: -COLUMN_STEP, ArrowRight: COLUMN_STEP }[event.code];
    if (step === undefined) return undefined;
    event.preventDefault();
    return { x: currentCoordinates.x + step, y: currentCoordinates.y };
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
            column: columnTitle.get(String(over.id)) ?? "",
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dragEnd", {
            title: titleOf(active.id),
            column: columnTitle.get(String(over.id)) ?? "",
          })
        : t("dragCancel", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t("dragCancel", { title: titleOf(active.id) }),
  };

  function handleDragEnd(event: DragEndEvent) {
    const item = byId.get(String(event.active.id));
    if (!item || !event.over) return;
    const to = String(event.over.id);
    if (to !== item.column) onMove(item, to);
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
      <div className="-mx-1 overflow-x-auto px-1 pb-2" data-testid={testId}>
        <div className="flex min-w-max items-start gap-4">
          {columns.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              items={column.compact ? [] : items.filter((i) => i.column === column.key)}
              renderCard={renderCard}
              empty={empty}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

function BoardColumn<T extends KanbanItem>({
  column,
  items,
  renderCard,
  empty,
}: {
  column: KanbanColumn;
  items: T[];
  renderCard: (item: T) => ReactNode;
  empty?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      data-testid="kanban-column"
      data-column={column.key}
      className={cn(
        "flex shrink-0 flex-col gap-3 rounded-2xl bg-muted/60 p-3 transition-colors",
        column.compact ? "w-44" : "w-[280px]",
        isOver && "bg-primary-soft/70 ring-2 ring-primary/30",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <h3 className="truncate text-[15px] font-semibold text-foreground">{column.title}</h3>
        <StatusChip tone={column.tone ?? "muted"}>{column.count}</StatusChip>
      </header>
      {column.compact ? null : items.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <BoardCard key={item.id} item={item}>
              {renderCard(item)}
            </BoardCard>
          ))}
        </ul>
      ) : empty ? (
        <div className="px-1 py-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : null}
      {column.footer ? <div className="px-1">{column.footer}</div> : null}
    </section>
  );
}

function BoardCard({ item, children }: { item: KanbanItem; children: ReactNode }) {
  const canDrag = item.draggable !== false;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !canDrag,
  });
  return (
    <li
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      {...attributes}
      data-testid="kanban-card"
      data-item-id={item.id}
      className={cn(
        "rounded-xl bg-card p-3.5 shadow-card outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40",
        canDrag && "cursor-grab active:cursor-grabbing",
        isDragging && "relative z-20 shadow-shell",
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      {children}
    </li>
  );
}
