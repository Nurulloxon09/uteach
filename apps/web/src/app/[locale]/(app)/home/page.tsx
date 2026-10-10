import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("title") };
}

/** Owner/admin landing page. Real dashboards come in M7 (20-analytics). */
export default async function HomePage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("home");
  const format = await getFormatter();
  const supabase = await createClient();

  const [branches, rooms, staff] = await Promise.all([
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
    supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .eq("status", "active"),
  ]);

  const stats = [
    { label: t("branches"), value: branches.count ?? 0, href: "/settings/branches" as const },
    { label: t("rooms"), value: rooms.count ?? 0, href: "/settings/branches" as const },
    {
      label: t("staff"),
      value: staff.count ?? 0,
      href: ctx.can.manageStaff ? ("/staff" as const) : null,
    },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          {t("greeting", { name: ctx.user.fullName })}
        </h1>
        {ctx.center.status === "trial" && ctx.center.trialEndsAt ? (
          <p className="text-sm text-muted-foreground">
            {t("trialEnds", {
              date: format.dateTime(new Date(ctx.center.trialEndsAt), {
                dateStyle: "long",
                timeZone: ctx.center.timezone,
              }),
            })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{format.number(s.value)}</CardTitle>
            </CardHeader>
            {s.href ? (
              <CardContent>
                <Link href={s.href} className="text-sm underline-offset-4 hover:underline">
                  {t("manage")}
                </Link>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("nextSteps")}</CardTitle>
          <CardDescription>{t("nextStepsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ctx.can.manageBranches ? (
            <Link href="/settings/branches" className={buttonVariants({ variant: "outline" })}>
              {t("addBranch")}
            </Link>
          ) : null}
          {ctx.can.manageStaff ? (
            <Link href="/staff" className={buttonVariants({ variant: "outline" })}>
              {t("inviteStaff")}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
