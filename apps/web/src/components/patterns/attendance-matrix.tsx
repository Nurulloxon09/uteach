"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MobileCard, MobileList } from "./mobile-list";
import type { ChipTone } from "./status-chip";
import { StatusChip } from "./status-chip";

export type MatrixMark = "present" | "late" | "absent" | "excused";

export type MatrixColumn = {
  id: string;
  /** Day of the month, e.g. "3". */
  day: string;
  /** Short weekday, e.g. "Mon". */
  weekday: string;
  /** Full label for screen readers and tooltips, e.g. "Mon, 3 Oct · 18:00". */
  label: string;
  cancelled: boolean;
  /** The current user may mark this lesson now. */
  editable: boolean;
};

export type MatrixRow = {
  id: string;
  name: string;
  /** e.g. "83%" or "—" */
  rate: string;
  rateTone: ChipTone;
  /** One line of counts for the phone summary. */
  counts: string;
  cells: Record<string, { state: "expected" | "frozen" | "out"; status: MatrixMark | null }>;
};

const MARK_TONE: Record<MatrixMark, string> = {
  present: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  absent: "bg-destructive/10 text-destructive",
  excused: "bg-primary-soft text-primary",
};

const MARKS: MatrixMark[] = ["present", "late", "absent", "excused"];

/**
 * Students × lessons of one month (05-ui, M2): sticky name column, letter cells colored by meaning, cancelled
 * lessons muted, days outside the enrollment (or frozen) hatched, the rate on the right. Clicking an editable
 * cell opens a P/L/A/E picker (`onMark`). Below `md` it becomes a per-student summary.
 */
export function AttendanceMatrix({
  columns,
  rows,
  letters,
  labels,
  onMark,
  testId,
}: {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  /** Cell letters: present / late / absent / excused / frozen. */
  letters: Record<MatrixMark | "frozen", string>;
  labels: {
    student: string;
    rate: string;
    marks: Record<MatrixMark, string>;
    /** aria-label of a cell. */
    cell: (row: MatrixRow, column: MatrixColumn, state: string) => string;
    notMarked: string;
    outside: string;
    frozen: string;
    cancelled: string;
    edit: (row: MatrixRow, column: MatrixColumn) => string;
  };
  /** Saves one mark; resolves when done. Without it the matrix is read-only. */
  onMark?: (studentId: string, lessonId: string, mark: MatrixMark) => Promise<void>;
  testId?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const stateLabel = (cell: MatrixRow["cells"][string] | undefined, column: MatrixColumn) => {
    if (column.cancelled) return labels.cancelled;
    if (cell?.status) return labels.marks[cell.status];
    if (cell?.state === "frozen") return labels.frozen;
    if (!cell || cell.state === "out") return labels.outside;
    return labels.notMarked;
  };

  const choose = async (key: string, studentId: string, lessonId: string, mark: MatrixMark) => {
    setOpen(null);
    if (!onMark) return;
    setSaving(key);
    try {
      await onMark(studentId, lessonId, mark);
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div
        className="hidden overflow-x-auto rounded-xl border border-border/70 md:block"
        data-testid={testId}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-primary-soft/60">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-48 bg-primary-soft px-4 py-3 text-left font-medium text-secondary-foreground"
              >
                {labels.student}
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  title={c.label}
                  className={cn(
                    "min-w-11 px-1 py-2 text-center font-medium text-secondary-foreground",
                    c.cancelled && "text-muted-foreground line-through",
                  )}
                >
                  <span className="sr-only">{c.label}</span>
                  <span aria-hidden className="block text-xs text-muted-foreground">
                    {c.weekday}
                  </span>
                  <span aria-hidden className="block">
                    {c.day}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="px-4 py-3 text-right font-medium text-secondary-foreground"
              >
                {labels.rate}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={testId ? `${testId}-row` : undefined} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t border-border/70 bg-card px-4 py-2 text-left font-medium text-foreground group-hover:bg-muted"
                >
                  <span className="block max-w-56 truncate">{r.name}</span>
                </th>
                {columns.map((c) => {
                  const cell = r.cells[c.id];
                  const key = `${r.id}:${c.id}`;
                  const hatched = !c.cancelled && (!cell || cell.state !== "expected");
                  const canEdit =
                    !!onMark &&
                    c.editable &&
                    !c.cancelled &&
                    (cell?.state === "expected" || !!cell?.status);
                  const letter = cell?.status
                    ? letters[cell.status]
                    : cell?.state === "frozen" && !c.cancelled
                      ? letters.frozen
                      : "";
                  const face = (
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-lg text-sm font-bold",
                        cell?.status
                          ? MARK_TONE[cell.status]
                          : c.cancelled
                            ? "bg-muted"
                            : hatched
                              ? "bg-hatch text-muted-foreground"
                              : "border border-dashed border-border",
                      )}
                    >
                      {saving === key ? <LoaderCircle className="size-4 animate-spin" /> : letter}
                    </span>
                  );
                  return (
                    <td
                      key={c.id}
                      data-testid={testId ? `${testId}-cell` : undefined}
                      data-status={cell?.status ?? cell?.state ?? "out"}
                      className={cn(
                        "border-t border-border/70 px-1 py-1.5 text-center",
                        c.cancelled && "bg-muted/40",
                      )}
                    >
                      {canEdit ? (
                        <Popover open={open === key} onOpenChange={(o) => setOpen(o ? key : null)}>
                          <PopoverTrigger
                            aria-label={labels.edit(r, c)}
                            className="mx-auto block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            {face}
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="center">
                            <div className="grid grid-cols-2 gap-1.5">
                              {MARKS.map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => choose(key, r.id, c.id, m)}
                                  className={cn(
                                    "h-10 rounded-lg px-2 text-sm font-semibold outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/30",
                                    MARK_TONE[m],
                                    cell?.status === m && "ring-2 ring-current",
                                  )}
                                >
                                  {labels.marks[m]}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span
                          className="mx-auto block w-fit"
                          aria-label={labels.cell(r, c, stateLabel(cell, c))}
                        >
                          {face}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="border-t border-border/70 px-4 py-2 text-right">
                  <StatusChip tone={r.rateTone} className="tabular-nums">
                    {r.rate}
                  </StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MobileList className="md:hidden">
        {rows.map((r) => (
          <MobileCard
            key={r.id}
            variant="inset"
            data-testid={testId ? `${testId}-card` : undefined}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">{r.name}</p>
              <StatusChip tone={r.rateTone} className="tabular-nums">
                {r.rate}
              </StatusChip>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{r.counts}</p>
          </MobileCard>
        ))}
      </MobileList>
    </>
  );
}
