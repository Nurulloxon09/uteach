import { todayIn } from "@uteach/core";
import { CalendarDays } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader, Section } from "@/components/patterns";
import { getCenterContext } from "@/lib/center";

export async function generateMetadata() {
  const t = await getTranslations("today");
  return { title: t("title") };
}

/**
 * Teacher's start page (mobile-first). Lessons arrive in M1 and attendance in M2;
 * in M0 it is an empty state, dated in the center's timezone.
 */
export default async function TodayPage() {
  const ctx = await getCenterContext();
  const t = await getTranslations("today");
  const format = await getFormatter();
  const today = todayIn(ctx.center.timezone);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={<span data-testid="today-title">{t("title")}</span>}
        meta={
          <span className="text-[15px] text-muted-foreground">
            {format.dateTime(new Date(`${today}T12:00:00Z`), {
              dateStyle: "full",
              timeZone: "UTC",
            })}
          </span>
        }
      />
      <Section>
        <EmptyState icon={CalendarDays} title={t("emptyTitle")} hint={t("emptyDescription")} />
      </Section>
    </div>
  );
}
