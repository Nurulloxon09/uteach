"use client";

import {
  examTotal,
  parseScore,
  sectionScoreError,
  type ExamSection,
  type ExamTotalRule,
  type ScoreError,
} from "@uteach/core";
import type { KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MobileCard, MobileList } from "./mobile-list";

export type ScoreGridRow = { id: string; name: string };
/** Typed text per row and section key. */
export type ScoreGridValues = Record<string, Record<string, string>>;

/** The first problem in a typed value, or null. */
export function scoreCellError(section: ExamSection, text: string): ScoreError | null {
  const value = parseScore(text);
  if (value === null) return null;
  if (Number.isNaN(value)) return "not_a_number";
  return sectionScoreError(section, value);
}

/** The live total of a row (null until every section is valid). */
export function scoreRowTotal(
  sections: readonly ExamSection[],
  rule: ExamTotalRule,
  values: Record<string, string> | undefined,
): number | null {
  const scores: Record<string, number | null> = {};
  for (const s of sections) {
    const text = values?.[s.key] ?? "";
    if (scoreCellError(s, text)) return null;
    scores[s.key] = parseScore(text);
  }
  return examTotal({ sections, totalRule: rule }, scores);
}

/**
 * Keyboard-first score entry (16, M6): students × sections. Tab moves across a row, Enter moves down a column
 * (Shift+Enter up). Each cell checks range and step as you type (red border + message) and the row total is
 * computed live with the same rules as the database. Below `sm` each student is a card with the same inputs.
 */
export function ScoreGrid({
  sections,
  totalRule,
  rows,
  values,
  onChange,
  sectionLabel,
  formatTotal,
  labels,
  disabled,
  testId = "score-grid",
}: {
  sections: readonly ExamSection[];
  totalRule: ExamTotalRule;
  rows: ScoreGridRow[];
  values: ScoreGridValues;
  onChange: (rowId: string, key: string, text: string) => void;
  sectionLabel: (section: ExamSection) => string;
  formatTotal: (value: number) => string;
  labels: {
    student: string;
    total: string;
    /** The message under/next to an invalid cell. */
    error: (section: ExamSection, error: ScoreError) => string;
    /** aria-label of one input, e.g. "Ali Valiyev, Listening". */
    cell: (row: ScoreGridRow, section: ExamSection) => string;
  };
  disabled?: boolean;
  testId?: string;
}) {
  // Enter / Shift+Enter: the same column in the next / previous row of the visible layout.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, layout: string, r: number, c: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = e.currentTarget
      .closest("[data-score-grid]")
      ?.querySelector<HTMLInputElement>(
        `[data-layout="${layout}"][data-r="${r + (e.shiftKey ? -1 : 1)}"][data-c="${c}"]`,
      );
    if (next) {
      next.focus();
      next.select();
    }
  };

  const cell = (row: ScoreGridRow, section: ExamSection, r: number, c: number, layout: string) => {
    const text = values[row.id]?.[section.key] ?? "";
    const error = scoreCellError(section, text);
    const id = `${layout}-${row.id}-${section.key}`;
    return (
      <div className="space-y-1">
        <Input
          id={id}
          value={text}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          aria-label={labels.cell(row, section)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          data-layout={layout}
          data-r={r}
          data-c={c}
          data-testid={`${testId}-input`}
          onChange={(e) => onChange(row.id, section.key, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, layout, r, c)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            "h-10 w-full min-w-16 text-center tabular-nums",
            error && "border-destructive",
          )}
        />
        {error ? (
          <p id={`${id}-error`} className="text-xs text-destructive">
            {labels.error(section, error)}
          </p>
        ) : null}
      </div>
    );
  };

  const totalOf = (row: ScoreGridRow) => {
    const total = scoreRowTotal(sections, totalRule, values[row.id]);
    return (
      <span
        className={cn("font-semibold tabular-nums", total === null && "text-muted-foreground")}
        data-testid={`${testId}-total`}
      >
        {total === null ? "—" : formatTotal(total)}
      </span>
    );
  };

  return (
    <div data-score-grid data-testid={testId}>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.student}</TableHead>
              {sections.map((s) => (
                <TableHead key={s.key} className="w-28 text-center">
                  {sectionLabel(s)}
                </TableHead>
              ))}
              {sections.length > 1 ? (
                <TableHead className="w-24 text-center">{labels.total}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, r) => (
              <TableRow key={row.id} data-testid={`${testId}-row`}>
                <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                {sections.map((s, c) => (
                  <TableCell key={s.key} className="align-top">
                    {cell(row, s, r, c, "table")}
                  </TableCell>
                ))}
                {sections.length > 1 ? (
                  <TableCell className="text-center align-top leading-10">{totalOf(row)}</TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <MobileList className="sm:hidden">
        {rows.map((row, r) => (
          <MobileCard key={row.id} variant="inset" data-testid={`${testId}-card`}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-foreground">{row.name}</p>
              {sections.length > 1 ? (
                <p className="text-sm text-secondary-foreground">
                  {labels.total}: {totalOf(row)}
                </p>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {sections.map((s, c) => (
                <label key={s.key} className="space-y-1 text-sm text-secondary-foreground">
                  <span>{sectionLabel(s)}</span>
                  {cell(row, s, r, c, "cards")}
                </label>
              ))}
            </div>
          </MobileCard>
        ))}
      </MobileList>
    </div>
  );
}
