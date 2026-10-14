import { addDays, isoWeekday, todayIn } from "@uteach/core";
import { CalendarDays, ClipboardCheck, NotebookPen, UsersRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ActivityList,
  EmptyState,
  LessonList,
  PageHeader,
  Section,
  StatusChip,
  type ActivityItem,
  type LessonListItem,
} from "@/components/patterns";
import { loadRooms } from "@/lib/academics";
import { markState, nowMs, type LessonStats } from "@/lib/attendance";
import { getCenterContext } from "@/lib/center";
import { loadTeacherDashboard } from "@/lib/dashboards";
import { dayAsDate, hhmm, localParts } from "@/lib/dates";
import { paletteFor } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";
import { MarkChip } from "../attendance/mark-chip";

export async function generateMetadata() {
  const t = await getTranslations("today");
  return { title: t("title") };
}

/**
 * Teacher's start page (mobile-first, 13): today's lessons, then the rest of the week, including lessons
 * they cover as a substitute. Tapping a lesson opens its attendance sheet (14); chips say what to mark.
 * The teacher dashboard (20 · M7c) adds lessons still to mark, scores to enter and their groups.
 */
export default async function TodayPage() {
  const ctx = await getCenterContext();
  const t = await getTranslations("today");
  const tl = await getTranslations("lessons");
  const format = await getFormatter();
  const today = todayIn(ctx.center.timezone);
  const weekEnd = addDays(today, 7 - isoWeekday(today));
  const supabase = await createClient();

  const [{ data: lessons }, { data: branches }, rooms, { data: me }, dash] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, group_id, branch_id, local_date, starts_at, ends_at, room_id, status, original_teacher_membership_id, is_makeup, groups ( name )",
      )
      .eq("teacher_membership_id", ctx.membership.id)
      .gte("local_date", today)
      .lte("local_date", weekEnd)
      .order("starts_at"),
    supabase.from("branches").select("id, timezone").eq("center_id", ctx.center.id),
    loadRooms(ctx),
    supabase.from("memberships").select("color").eq("id", ctx.membership.id).maybeSingle(),
    loadTeacherDashboard(ctx),
  ]);

  const ids = (lessons ?? []).map((l) => l.id);
  const { data: stats } = ids.length
    ? await supabase.rpc("lesson_attendance_stats", { p_lesson_ids: ids })
    : { data: [] };
  const statsOf = new Map<string, LessonStats>(
    (stats ?? []).map((s) => [
      s.lesson_id,
      { expected: s.expected, marked: s.marked, absent: s.absent },
    ]),
  );
  const now = nowMs();

  const tzOf = new Map((branches ?? []).map((b) => [b.id, b.timezone]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const palette = paletteFor(me?.color, ctx.membership.id);

  const items = (lessons ?? []).map((l) => {
    const tz = tzOf.get(l.branch_id) ?? ctx.center.timezone;
    const start = localParts(l.starts_at, tz);
    const end = localParts(l.ends_at, tz);
    const kind =
      l.status === "cancelled" ? null : l.original_teacher_membership_id ? (
        <StatusChip tone="warning">{tl("substituteChip")}</StatusChip>
      ) : l.is_makeup ? (
        <StatusChip tone="primary">{tl("makeupChip")}</StatusChip>
      ) : null;
    const chip = (
      <span className="flex flex-wrap gap-1.5">
        {kind}
        <MarkChip
          state={markState(
            { status: l.status, startsAt: l.starts_at, endsAt: l.ends_at },
            statsOf.get(l.id),
            now,
          )}
        />
      </span>
    );
    const item: LessonListItem & { date: string } = {
      id: l.id,
      date: start.date,
      time: `${hhmm(start.minutes)}–${hhmm(end.minutes)}`,
      title: l.groups?.name ?? "—",
      subtitle: l.room_id ? (roomName.get(l.room_id) ?? undefined) : undefined,
      palette,
      status: chip,
      cancelled: l.status === "cancelled",
      href: `/attendance/${l.id}`,
    };
    return item;
  });

  const td = await getTranslations("dashboard");
  const when = (at: string, tz: string) =>
    format.dateTime(new Date(at), {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });
  const toMark: ActivityItem[] = dash.to_mark.map((l) => ({
    key: l.id,
    icon: ClipboardCheck,
    tone: "orange",
    title: l.group,
    description: td("closes", { when: when(l.closes_at, l.timezone) }),
    meta: (
      <StatusChip tone="warning">
        {td("markedCount", { marked: l.marked, expected: l.expected })}
      </StatusChip>
    ),
    href: `/attendance/${l.id}`,
  }));
  const day = (d: string) =>
    format.dateTime(dayAsDate(d), { day: "numeric", month: "short", timeZone: "UTC" });
  const scores: ActivityItem[] = dash.scores_to_enter.map((g) => ({
    key: g.id,
    icon: NotebookPen,
    tone: "purple",
    title: g.name,
    description: g.last_score ? td("lastScore", { date: day(g.last_score) }) : td("noScoreYet"),
    href: `/groups/${g.id}?tab=scores`,
  }));
  const groups: ActivityItem[] = dash.groups.map((g) => ({
    key: g.id,
    icon: UsersRound,
    tone: "blue",
    title: g.name,
    description: td("studentsCount", { count: g.students }),
    href: `/groups/${g.id}`,
  }));

  const todays = items.filter((i) => i.date === today);
  const later = items.filter((i) => i.date !== today);
  const laterDays = [...new Set(later.map((i) => i.date))];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={<span data-testid="today-title">{t("title")}</span>}
        meta={
          <span className="text-[15px] text-muted-foreground">
            {format.dateTime(dayAsDate(today), { dateStyle: "full", timeZone: "UTC" })}
          </span>
        }
      />
      {todays.length ? (
        <LessonList items={todays} testId="today-lesson" />
      ) : (
        <Section>
          <EmptyState icon={CalendarDays} title={t("emptyTitle")} hint={t("emptyDescription")} />
        </Section>
      )}
      {toMark.length ? (
        <Section title={td("toMarkTitle")} titleSize="card" description={td("toMarkHint")}>
          <div data-testid="to-mark">
            <ActivityList items={toMark} />
          </div>
        </Section>
      ) : null}
      {scores.length ? (
        <Section title={td("scoresTitle")} titleSize="card" description={td("scoresHint")}>
          <div data-testid="scores-to-enter">
            <ActivityList items={scores} />
          </div>
        </Section>
      ) : null}
      {laterDays.length ? (
        <section className="space-y-3">
          <h2 className="text-[19px] font-bold tracking-tight text-foreground">{t("thisWeek")}</h2>
          {laterDays.map((d) => (
            <div key={d} className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {format.dateTime(dayAsDate(d), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </p>
              <LessonList items={later.filter((i) => i.date === d)} testId="week-lesson" />
            </div>
          ))}
        </section>
      ) : null}
      {groups.length ? (
        <Section title={td("groupsTitle")} titleSize="card">
          <ActivityList items={groups} />
        </Section>
      ) : null}
    </div>
  );
}
