import { isAttendanceStatus } from "@uteach/core";
import { CircleAlert, Clock, DoorOpen, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader, Section, StatusChip } from "@/components/patterns";
import { Alert } from "@/components/ui/alert";
import { nowMs } from "@/lib/attendance";
import { getCenterContext } from "@/lib/center";
import { dayAsDate, hhmm, localParts } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";
import { AttendanceSheet, type SheetRow } from "./sheet";

export async function generateMetadata() {
  const t = await getTranslations("attendance");
  return { title: t("title") };
}

/**
 * Attendance sheet of one lesson (14), mobile-first. Opened from Today (teachers) or the Attendance list
 * (admins). The database decides who may mark (`attendance_lesson.mode`); the page only explains it.
 */
export default async function AttendanceSheetPage({
  params,
}: PageProps<"/[locale]/attendance/[lessonId]">) {
  const { lessonId } = await params;
  if (!uuidField.safeParse(lessonId).success) notFound();
  const ctx = await getCenterContext();
  const t = await getTranslations("attendance");
  const tl = await getTranslations("lessons");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: lesson }, { data: sheet }] = await Promise.all([
    supabase.rpc("attendance_lesson", { p_lesson_id: lessonId }).maybeSingle(),
    supabase.rpc("attendance_sheet", { p_lesson_id: lessonId }),
  ]);
  if (!lesson) notFound();

  const start = localParts(lesson.starts_at, lesson.timezone);
  const end = localParts(lesson.ends_at, lesson.timezone);
  const day = format.dateTime(dayAsDate(lesson.local_date), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const when = `${day} · ${hhmm(start.minutes)}–${hhmm(end.minutes)}`;
  const opensAt = hhmm(localParts(lesson.opens_at, lesson.timezone).minutes);
  const editable = lesson.mode === "teacher" || lesson.mode === "admin";
  const afterWindow = lesson.mode === "admin" && nowMs() >= Date.parse(lesson.closes_at);

  // Trial guests (lead_trial_id) get their own rows in M5c; until then the sheet shows students only.
  const rows: SheetRow[] = (sheet ?? [])
    .filter((r) => r.lead_trial_id === null)
    .map((r) => ({
      studentId: r.student_id,
      name: r.full_name,
      isExpected: r.is_expected,
      status: isAttendanceStatus(r.status) ? r.status : null,
      lateMinutes: r.late_minutes,
      note: r.note,
    }));
  // Remount the sheet whenever what's saved changes (after a save, or someone else's edit).
  const version = [
    lesson.topic ?? "",
    ...rows.map((r) => `${r.studentId}:${r.status ?? ""}:${r.lateMinutes ?? ""}:${r.note ?? ""}`),
  ].join("|");

  const banner =
    lesson.mode === "cancelled"
      ? t("mode.cancelled")
      : lesson.mode === "too_early"
        ? t("mode.tooEarly", { time: opensAt })
        : lesson.mode === "closed"
          ? t("mode.closed")
          : lesson.mode === "none"
            ? t("mode.none")
            : afterWindow
              ? t("mode.adminLate")
              : null;

  const isStaff = ctx.can.seeAdminPages;
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-4">
      <PageHeader
        title={<span data-testid="sheet-title">{lesson.group_name}</span>}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={
          isStaff
            ? [
                { label: tn("attendance"), href: `/attendance?date=${lesson.local_date}` },
                { label: lesson.group_name },
              ]
            : [{ label: tn("today"), href: "/today" }, { label: t("title") }]
        }
        meta={
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-secondary-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="size-4 text-primary" />
                {when}
              </span>
              {lesson.room_name ? (
                <span className="flex items-center gap-1.5">
                  <DoorOpen className="size-4 text-primary" />
                  {lesson.room_name}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5">
                <UserRound className="size-4 text-primary" />
                {lesson.teacher_name}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip
                tone={
                  lesson.status === "held"
                    ? "success"
                    : lesson.status === "cancelled"
                      ? "muted"
                      : "primary"
                }
              >
                {tl(`status.${lesson.status}`)}
              </StatusChip>
              {lesson.is_substitute ? (
                <StatusChip tone="warning">{t("substitute")}</StatusChip>
              ) : null}
            </div>
          </div>
        }
      />

      {banner ? (
        <Alert
          variant={lesson.mode === "closed" ? "destructive" : "default"}
          data-testid="sheet-banner"
        >
          <CircleAlert />
          {banner}
        </Alert>
      ) : null}

      {lesson.mode === "cancelled" ? null : rows.length === 0 ? (
        <Section>
          <EmptyState icon={UserRound} title={t("emptyTitle")} hint={t("emptyHint")} />
        </Section>
      ) : (
        <AttendanceSheet
          key={version}
          lessonId={lesson.lesson_id}
          rows={rows}
          topic={lesson.topic ?? ""}
          editable={editable}
          version={version}
        />
      )}
    </div>
  );
}
