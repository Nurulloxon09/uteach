import {
  BellRing,
  CalendarCheck2,
  CalendarX2,
  ClipboardCheck,
  HandCoins,
  Send,
  UserRoundPlus,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ActivityList,
  EmptyState,
  MoneyAmount,
  Section,
  StatTiles,
  StatusChip,
  type ActivityItem,
} from "@/components/patterns";
import type { CenterContext } from "@/lib/center";
import type { AdminDashboard as Data } from "@/lib/dashboards";

/**
 * The admin's Home (20 · M7c), for their branches: today's lessons marked or not, debtors to call (with
 * `billing`), trials today, and counts that need a look (follow-ups, no Telegram, schedule conflicts).
 */
export async function AdminDashboard({ ctx, data }: { ctx: CenterContext; data: Data }) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const time = (at: string, tz: string) =>
    format.dateTime(new Date(at), { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const marked = data.lessons.filter((l) => l.marked >= l.expected).length;

  const lessons: ActivityItem[] = data.lessons.map((l) => {
    const done = l.marked >= l.expected;
    return {
      key: l.id,
      icon: ClipboardCheck,
      tone: done ? "green" : "orange",
      title: l.group,
      description: `${time(l.starts_at, l.timezone)}–${time(l.ends_at, l.timezone)}${l.teacher ? ` · ${l.teacher}` : ""}`,
      meta: (
        <StatusChip tone={done ? "success" : "muted"}>
          {done ? t("marked") : t("markedCount", { marked: l.marked, expected: l.expected })}
        </StatusChip>
      ),
      href: `/attendance/${l.id}`,
    };
  });
  const debtors: ActivityItem[] = (data.debtors ?? []).map((d) => ({
    key: d.student_id,
    icon: HandCoins,
    tone: d.days_overdue > 30 ? "orange" : "blue",
    title: d.name,
    description: d.days_overdue > 0 ? t("daysOverdue", { days: d.days_overdue }) : t("notOverdue"),
    meta: <MoneyAmount minor={d.debt} currency={ctx.center.currency} />,
    href: `/students/${d.student_id}`,
  }));
  const trials: ActivityItem[] = data.trials.map((x) => ({
    key: x.lead_id,
    icon: UserRoundPlus,
    tone: "purple",
    title: x.name,
    description: `${x.group} · ${time(x.starts_at, x.timezone)}`,
    href: `/leads/${x.lead_id}`,
  }));

  return (
    <>
      <div data-testid="admin-counts">
        <StatTiles
          items={[
            {
              key: "lessons",
              label: t("lessonsToday"),
              value: t("markedOf", {
                marked: format.number(marked),
                total: format.number(data.lessons.length),
              }),
              icon: CalendarCheck2,
              tone: "purple",
              href: "/attendance",
            },
            {
              key: "followUps",
              label: t("followUpsDue", { overdue: data.follow_ups_overdue }),
              value: format.number(data.follow_ups.length),
              icon: BellRing,
              tone: data.follow_ups_overdue > 0 ? "orange" : "blue",
              href: "/home#follow-ups",
            },
            {
              key: "telegram",
              label: t("noTelegram"),
              value: format.number(data.no_telegram),
              icon: Send,
              tone: "blue",
              href: "/students",
            },
            {
              key: "conflicts",
              label: t("conflicts"),
              value: format.number(data.conflicts),
              icon: CalendarX2,
              tone: data.conflicts > 0 ? "orange" : "green",
              href: "/schedule",
            },
          ]}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("lessonsTitle")} titleSize="card" description={t("lessonsHint")}>
          {lessons.length > 0 ? (
            <div data-testid="admin-lessons">
              <ActivityList items={lessons} />
            </div>
          ) : (
            <EmptyState icon={CalendarCheck2} title={t("noLessons")} />
          )}
        </Section>
        {data.debtors ? (
          <Section title={t("debtorsTitle")} titleSize="card" description={t("debtorsHint")}>
            {debtors.length > 0 ? (
              <div data-testid="admin-debtors">
                <ActivityList items={debtors} />
              </div>
            ) : (
              <EmptyState icon={HandCoins} title={t("noDebtors")} />
            )}
          </Section>
        ) : null}
        <Section title={t("trialsTitle")} titleSize="card">
          {trials.length > 0 ? (
            <ActivityList items={trials} />
          ) : (
            <EmptyState icon={UserRoundPlus} title={t("noTrials")} />
          )}
        </Section>
      </div>
    </>
  );
}
