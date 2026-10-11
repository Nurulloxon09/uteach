import { addDays, isoWeekday, todayIn } from "@uteach/core";
import { CalendarDays } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  EmptyState,
  LessonList,
  PageHeader,
  Section,
  StatusChip,
  type LessonListItem,
} from "@/components/patterns";
import { loadRooms } from "@/lib/academics";
import { getCenterContext } from "@/lib/center";
import { dayAsDate, hhmm, localParts } from "@/lib/dates";
import { paletteFor } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("today");
  return { title: t("title") };
}

/**
 * Teacher's start page (mobile-first, 13): today's lessons, then the rest of the week, including lessons
 * they cover as a substitute. Tapping a lesson opens its group (the attendance sheet arrives in M2).
 */
export default async function TodayPage() {
  const ctx = await getCenterContext();
  const t = await getTranslations("today");
  const tl = await getTranslations("lessons");
  const format = await getFormatter();
  const today = todayIn(ctx.center.timezone);
  const weekEnd = addDays(today, 7 - isoWeekday(today));
  const supabase = await createClient();

  const [{ data: lessons }, { data: branches }, rooms, { data: me }] = await Promise.all([
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
  ]);

  const tzOf = new Map((branches ?? []).map((b) => [b.id, b.timezone]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const palette = paletteFor(me?.color, ctx.membership.id);

  const items = (lessons ?? []).map((l) => {
    const tz = tzOf.get(l.branch_id) ?? ctx.center.timezone;
    const start = localParts(l.starts_at, tz);
    const end = localParts(l.ends_at, tz);
    const chip =
      l.status === "cancelled" ? (
        <StatusChip tone="muted">{tl("status.cancelled")}</StatusChip>
      ) : l.original_teacher_membership_id ? (
        <StatusChip tone="warning">{tl("substituteChip")}</StatusChip>
      ) : l.is_makeup ? (
        <StatusChip tone="primary">{tl("makeupChip")}</StatusChip>
      ) : undefined;
    const item: LessonListItem & { date: string } = {
      id: l.id,
      date: start.date,
      time: `${hhmm(start.minutes)}–${hhmm(end.minutes)}`,
      title: l.groups?.name ?? "—",
      subtitle: l.room_id ? (roomName.get(l.room_id) ?? undefined) : undefined,
      palette,
      status: chip,
      cancelled: l.status === "cancelled",
      href: `/groups/${l.group_id}`,
    };
    return item;
  });

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
    </div>
  );
}
