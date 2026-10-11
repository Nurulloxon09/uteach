import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MobileCard, MobileList } from "./mobile-list";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type Selection = {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  /** aria-labels (translated) */
  labelAll: string;
  labelRow: (key: string) => string;
};

/**
 * The reference table (`teachers.index`): soft header row, avatar + name first column, actions last.
 * Below `sm` the same rows render as stacked cards (`mobileCard`); phones never get a sideways-scrolling table.
 * No hooks, so it works in server and client components; selection is controlled by the caller.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  mobileCard,
  empty,
  selection,
  testId,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobileCard: (row: T) => ReactNode;
  empty?: ReactNode;
  selection?: Selection;
  /** data-testid on desktop rows; mobile cards get `${testId}-card`. */
  testId?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const allChecked = !!selection && rows.length > 0 && rows.every((r) => selection.selected.has(rowKey(r)));

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selection ? (
                <TableHead className="w-14">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={selection.onToggleAll}
                    aria-label={selection.labelAll}
                  />
                </TableHead>
              ) : null}
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const key = rowKey(row);
              const isSelected = selection?.selected.has(key) ?? false;
              return (
                <TableRow key={key} data-state={isSelected ? "selected" : undefined} data-testid={testId}>
                  {selection ? (
                    <TableCell className="py-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => selection.onToggle(key)}
                        aria-label={selection.labelRow(key)}
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <MobileList className="sm:hidden">
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <MobileCard
              key={key}
              variant="inset"
              data-testid={testId ? `${testId}-card` : undefined}
              className={cn(selection?.selected.has(key) && "border-primary/40 shadow-card")}
            >
              {mobileCard(row)}
            </MobileCard>
          );
        })}
      </MobileList>
    </>
  );
}

/** First-column cell: avatar + name (+ optional second line). */
export function NameCell({ avatar, name, sub }: { avatar?: ReactNode; name: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {avatar}
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{name}</p>
        {sub ? <p className="truncate text-sm text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}
