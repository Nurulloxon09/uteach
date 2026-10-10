import { todayIn } from "@uteach/core";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto grid max-w-md gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold" data-testid="today-title">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format.dateTime(new Date(`${today}T12:00:00Z`), { dateStyle: "full", timeZone: "UTC" })}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("emptyTitle")}</CardTitle>
          <CardDescription>{t("emptyDescription")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
