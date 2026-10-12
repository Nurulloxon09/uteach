"use client";

import { ChevronLeft, ChevronRight, ClipboardCheck, Download } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AttendanceMatrix,
  EmptyState,
  Section,
  type ChipTone,
  type MatrixColumn,
  type MatrixMark,
  type MatrixRow,
} from "@/components/patterns";
import { useListParams } from "@/components/patterns/url-params";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { hhmm, dayAsDate } from "@/lib/dates";
import type { MatrixStudent } from "@/lib/attendance-matrix";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "../../attendance/actions";

export type TabLesson = {
  id: string;
  date: string;
  startMinutes: number;
  cancelled: boolean;
  editable: boolean;
};

function rateTone(bp: number | null): ChipTone {
  if (bp === null) return "muted";
  return bp >= 8000 ? "success" : bp >= 6000 ? "warning" : "destructive";
}

/**
 * Group page → Attendance (14): one month as a matrix, with month navigation and Excel export. A cell edit
 * saves through `save_attendance` with one row; the database applies the same window rules as the sheet.
 */
export function AttendanceTab({
  month,
  prevMonth,
  nextMonth,
  thisMonth,
  exportHref,
  lessons,
  students,
}: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  thisMonth: string;
  exportHref: string;
  lessons: TabLesson[];
  students: MatrixStudent[];
}) {
  const t = useTranslations("attendance");
  const te = useTranslations("errors");
  const format = useFormatter();
  const { hrefWith } = useListParams();

  const monthLabel = format.dateTime(dayAsDate(`${month}-01`), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const columns: MatrixColumn[] = lessons.map((l) => {
    const day = dayAsDate(l.date);
    return {
      id: l.id,
      day: String(Number(l.date.slice(8, 10))),
      weekday: format.dateTime(day, { weekday: "short", timeZone: "UTC" }),
      label: `${format.dateTime(day, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${hhmm(l.startMinutes)}`,
      cancelled: l.cancelled,
      editable: l.editable,
    };
  });
  const byId = new Map(students.map((s) => [s.id, s]));
  const rows: MatrixRow[] = students.map((s) => ({
    id: s.id,
    name: s.name,
    rate:
      s.rateBp === null
        ? "—"
        : format.number(s.rateBp / 10000, { style: "percent", maximumFractionDigits: 0 }),
    rateTone: rateTone(s.rateBp),
    counts: t("matrix.counts", s.counts),
    cells: Object.fromEntries(
      Object.entries(s.cells).map(([id, c]) => [id, { state: c.state, status: c.status }]),
    ),
  }));

  const onMark = async (studentId: string, lessonId: string, mark: MatrixMark) => {
    const cell = byId.get(studentId)?.cells[lessonId];
    const result = await saveAttendanceAction({
      lessonId,
      rows: [
        {
          studentId,
          status: mark,
          lateMinutes: mark === "late" ? (cell?.lateMinutes ?? null) : null,
          note: cell?.note ?? "",
        },
      ],
      topic: null,
    });
    if (result.ok) toast.success(t("matrix.saved"));
    else toast.error(te(result.error as never));
  };

  const nav = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={hrefWith({ tab: "attendance", month: prevMonth })}
          aria-label={t("matrix.previousMonth")}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronLeft />
        </Link>
        <Link
          href={hrefWith({ tab: "attendance", month: thisMonth })}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("matrix.thisMonth")}
        </Link>
        <Link
          href={hrefWith({ tab: "attendance", month: nextMonth })}
          aria-label={t("matrix.nextMonth")}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronRight />
        </Link>
      </div>
      {lessons.length ? (
        <a
          href={exportHref}
          download
          className={buttonVariants({ variant: "outline-primary" })}
          data-testid="attendance-export"
        >
          <Download />
          {t("matrix.export")}
        </a>
      ) : null}
    </div>
  );

  return (
    <Section
      title={t("matrix.title", { month: monthLabel })}
      titleSize="card"
      tools={nav}
      className="p-0 shadow-none sm:p-0"
    >
      {lessons.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t("matrix.emptyTitle")}
          hint={t("matrix.emptyHint")}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t("matrix.noStudentsTitle")}
          hint={t("matrix.noStudentsHint")}
        />
      ) : (
        <div className="space-y-3">
          <AttendanceMatrix
            testId="matrix"
            columns={columns}
            rows={rows}
            letters={{
              present: t("letter.present"),
              late: t("letter.late"),
              absent: t("letter.absent"),
              excused: t("letter.excused"),
              frozen: t("letter.frozen"),
            }}
            labels={{
              student: t("matrix.student"),
              rate: t("matrix.rate"),
              marks: {
                present: t("status.present"),
                late: t("status.late"),
                absent: t("status.absent"),
                excused: t("status.excused"),
              },
              cell: (r, c, state) => t("matrix.cell", { name: r.name, date: c.label, state }),
              notMarked: t("matrix.notMarked"),
              outside: t("matrix.outside"),
              frozen: t("matrix.frozen"),
              cancelled: t("matrix.cancelled"),
              edit: (r, c) => t("matrix.edit", { name: r.name, date: c.label }),
            }}
            onMark={lessons.some((l) => l.editable) ? onMark : undefined}
          />
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground md:flex">
            {(["present", "late", "absent", "excused"] as const).map((m) => (
              <span key={m} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-md text-xs font-bold",
                    m === "present" && "bg-success/15 text-success",
                    m === "late" && "bg-warning/15 text-warning",
                    m === "absent" && "bg-destructive/10 text-destructive",
                    m === "excused" && "bg-primary-soft text-primary",
                  )}
                >
                  {t(`letter.${m}`)}
                </span>
                {t(`status.${m}`)}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="size-6 rounded-md bg-hatch" />
              {t("matrix.legendOut")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-6 rounded-md bg-muted" />
              {t("matrix.legendCancelled")}
            </span>
            <span className="ml-auto">{t("matrix.rateHint")}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
