import {
  addDays,
  attendanceRateBp,
  countMarks,
  isAttendanceStatus,
  type AttendanceStatus,
} from "@uteach/core";
import { ClipboardCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  EmptyState,
  MobileCard,
  MobileList,
  Section,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { ATTENDANCE_TONE } from "@/lib/attendance";
import { dayAsDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

type Mark = { lessonId: string; groupId: string; date: string; status: AttendanceStatus };

function toneOf(bp: number | null): ChipTone {
  if (bp === null) return "muted";
  return bp >= 8000 ? "success" : bp >= 6000 ? "warning" : "destructive";
}

/**
 * Student profile → Attendance (12, 14): per group the rate this month and over the last 30 days, then the
 * latest marks. Staff only (the page itself is staff only).
 */
export async function AttendanceSummary({
  studentId,
  groupNames,
  today,
}: {
  studentId: string;
  groupNames: Map<string, string>;
  today: string;
}) {
  const t = await getTranslations("attendance");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance")
    .select("lesson_id, group_id, status, lessons ( local_date )")
    .eq("student_id", studentId)
    .order("marked_at", { ascending: false })
    .limit(300);

  const marks: Mark[] = (data ?? []).flatMap((a) =>
    a.lessons && isAttendanceStatus(a.status)
      ? [
          {
            lessonId: a.lesson_id,
            groupId: a.group_id,
            date: a.lessons.local_date,
            status: a.status,
          },
        ]
      : [],
  );
  if (!marks.length) {
    return (
      <Section>
        <EmptyState
          icon={ClipboardCheck}
          title={t("summary.emptyTitle")}
          hint={t("summary.emptyHint")}
        />
      </Section>
    );
  }

  const month = today.slice(0, 7);
  const since = addDays(today, -29);
  const percent = (bp: number | null) =>
    bp === null ? "—" : format.number(bp / 10000, { style: "percent", maximumFractionDigits: 0 });
  const groups = [...new Set(marks.map((m) => m.groupId))].map((groupId) => {
    const of = marks.filter((m) => m.groupId === groupId);
    const thisMonth = countMarks(of.filter((m) => m.date.startsWith(month)).map((m) => m.status));
    const last30 = countMarks(of.filter((m) => m.date >= since).map((m) => m.status));
    return {
      groupId,
      name: groupNames.get(groupId) ?? "—",
      thisMonth,
      thisMonthBp: attendanceRateBp(thisMonth),
      last30Bp: attendanceRateBp(last30),
    };
  });
  const lineOf = (m: Mark) =>
    `${format.dateTime(dayAsDate(m.date), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${groupNames.get(m.groupId) ?? "—"}`;
  const recent = [...marks].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);

  return (
    <div className="space-y-5">
      <Section title={t("summary.title")} titleSize="card">
        <MobileList>
          {groups.map((g) => (
            <MobileCard key={g.groupId} variant="inset" data-testid="student-attendance-group">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/groups/${g.groupId}?tab=attendance`}
                  className="text-[15px] font-semibold text-foreground hover:text-primary"
                >
                  {g.name}
                </Link>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {t("summary.thisMonth")}
                    <StatusChip tone={toneOf(g.thisMonthBp)}>{percent(g.thisMonthBp)}</StatusChip>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {t("summary.last30")}
                    <StatusChip tone={toneOf(g.last30Bp)}>{percent(g.last30Bp)}</StatusChip>
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("matrix.counts", g.thisMonth)}
              </p>
            </MobileCard>
          ))}
        </MobileList>
      </Section>
      <Section title={t("summary.recent")} titleSize="card">
        <ul className="divide-y divide-border/70">
          {recent.map((m) => (
            <li
              key={m.lessonId}
              className="flex items-center justify-between gap-3 py-2.5 text-[15px]"
            >
              <span className="min-w-0 truncate text-secondary-foreground">{lineOf(m)}</span>
              <StatusChip tone={ATTENDANCE_TONE[m.status]}>{t(`status.${m.status}`)}</StatusChip>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
