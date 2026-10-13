"use client";

import { MessageSquarePlus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "./initials-avatar";
import { MobileCard } from "./mobile-list";
import { StatusToggleGroup, type StatusOption } from "./status-toggle-group";

export type AttendanceRowValue = {
  /** null = not marked yet. */
  status: string | null;
  /** As typed (minutes late, only used when the status is late). */
  lateMinutes: string;
  note: string;
};

/**
 * One student on the attendance sheet (05-ui, M2): name, four one-tap marks in one row at 375 px, the minutes
 * field when late, and an optional note behind an icon button. Everything is controlled by the sheet.
 */
export function AttendanceRow({
  name,
  value,
  onChange,
  options,
  legend,
  labels,
  badge,
  disabled,
  extra,
  testId,
}: {
  name: string;
  value: AttendanceRowValue;
  onChange: (value: AttendanceRowValue) => void;
  /** present / late / absent / excused, with short labels and full `srLabel`s. */
  options: StatusOption[];
  /** Screen-reader legend of the marks, e.g. "Attendance of Ali Valiyev". */
  legend: string;
  labels: {
    lateMinutes: string;
    minutesShort: string;
    note: string;
    addNote: string;
    notePlaceholder: string;
  };
  badge?: ReactNode;
  disabled?: boolean;
  /** Shown under the marks (e.g. a trial guest's feedback field). */
  extra?: ReactNode;
  testId?: string;
}) {
  const id = useId();
  const [noteOpen, setNoteOpen] = useState(value.note !== "");
  const showNote = noteOpen || value.note !== "";

  return (
    <MobileCard data-testid={testId} data-status={value.status ?? "none"}>
      <div className="flex items-center gap-3">
        <InitialsAvatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{name}</p>
          {badge ? <div className="mt-1">{badge}</div> : null}
        </div>
        {!disabled ? (
          <button
            type="button"
            aria-label={labels.addNote}
            aria-pressed={showNote}
            onClick={() => setNoteOpen((o) => !o)}
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
              showNote && "bg-primary-soft text-primary",
            )}
          >
            <MessageSquarePlus className="size-[18px]" strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <StatusToggleGroup
          name={`${id}-status`}
          legend={legend}
          layout="row"
          options={options}
          value={value.status}
          onChange={(status) => onChange({ ...value, status })}
          disabled={disabled}
        />
      </div>

      {value.status === "late" ? (
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor={`${id}-late`} className="text-sm text-secondary-foreground">
            {labels.lateMinutes}
          </label>
          <Input
            id={`${id}-late`}
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={value.lateMinutes}
            onChange={(e) => onChange({ ...value, lateMinutes: e.target.value })}
            disabled={disabled}
            className="h-11 w-20 px-3"
          />
          <span className="text-sm text-muted-foreground">{labels.minutesShort}</span>
        </div>
      ) : null}

      {showNote ? (
        <Input
          aria-label={labels.note}
          placeholder={labels.notePlaceholder}
          maxLength={500}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          disabled={disabled}
          className="mt-3 h-11"
        />
      ) : null}
      {extra ? <div className="mt-3">{extra}</div> : null}
    </MobileCard>
  );
}
