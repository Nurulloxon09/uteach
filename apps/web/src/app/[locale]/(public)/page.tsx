import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Send,
  Target,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  FeatureCard,
  MoneyAmount,
  PlanCard,
  PublicSection,
  StepCard,
  StatusChip,
  telegramUrl,
  type StatTone,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCenterContext, homePathFor } from "@/lib/center";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { pageLocale, publicAlternates } from "./legal";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "public" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: publicAlternates(locale, ""),
  };
}

const FEATURES = [
  { key: "students", icon: UsersRound, tone: "purple" },
  { key: "schedule", icon: CalendarDays, tone: "blue" },
  { key: "attendance", icon: ClipboardCheck, tone: "green" },
  { key: "payments", icon: Wallet, tone: "orange" },
  { key: "telegram", icon: Send, tone: "blue" },
  { key: "leads", icon: Target, tone: "purple" },
  { key: "scores", icon: GraduationCap, tone: "orange" },
  { key: "dashboards", icon: BarChart3, tone: "green" },
] as const satisfies readonly { key: string; icon: unknown; tone: StatTone }[];

const STEPS = ["step1", "step2", "step3"] as const;

/**
 * "/": the landing page for visitors (M7e). Signed-in people are sent where they belong (login → onboarding,
 * Home or Today), as before.
 */
export default async function IndexPage() {
  if (await getCurrentUser()) {
    const ctx = await getCenterContext();
    return redirect({ href: homePathFor(ctx.membership.role), locale: await getLocale() });
  }

  const t = await getTranslations("public");
  const supabase = await createClient();
  const { data: plans } = await supabase.rpc("public_plans");
  const contact = publicEnv.NEXT_PUBLIC_CONTACT_TELEGRAM;
  // The middle plan is the one most centers need; highlight it when there are three or more.
  const highlighted = plans && plans.length >= 3 ? plans[1]?.code : undefined;

  return (
    <>
      <section className="px-4 pt-14 pb-10 sm:px-8 sm:pt-20 sm:pb-14">
        <div className="mx-auto max-w-3xl text-center">
          <StatusChip tone="primary" className="whitespace-normal">
            {t("hero.eyebrow")}
          </StatusChip>
          <h1 className="mt-5 text-[34px] leading-tight font-extrabold tracking-tight text-foreground sm:text-[48px]">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] text-muted-foreground sm:text-[19px]">
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/signup" data-testid="hero-signup">
                {t("hero.cta")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={{ pathname: "/", hash: "plans" }}>{t("hero.secondary")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-[15px] text-muted-foreground">{t("hero.note")}</p>
        </div>
      </section>

      <PublicSection id="features" title={t("features.title")} subtitle={t("features.subtitle")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <FeatureCard
              key={f.key}
              icon={f.icon}
              tone={f.tone}
              title={t(`features.${f.key}.title`)}
              body={t(`features.${f.key}.body`)}
            />
          ))}
        </div>
      </PublicSection>

      <PublicSection title={t("start.title")}>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <StepCard key={s} n={i + 1} title={t(`start.${s}.title`)} body={t(`start.${s}.body`)} />
          ))}
        </div>
      </PublicSection>

      <PublicSection id="plans" title={t("plans.title")} subtitle={t("plans.subtitle")}>
        {plans && plans.length > 0 ? (
          <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
            {plans.map((p) => (
              <PlanCard
                key={p.code}
                name={p.name}
                highlighted={p.code === highlighted}
                price={<MoneyAmount minor={p.price_amount} currency={p.currency} />}
                period={t("plans.perMonth")}
                items={[
                  p.student_limit === null
                    ? t("plans.unlimitedStudents")
                    : t("plans.students", { count: p.student_limit }),
                  p.branch_limit === null
                    ? t("plans.unlimitedBranches")
                    : t("plans.branches", { count: p.branch_limit }),
                  t("plans.allFeatures"),
                ]}
                action={
                  <Button
                    asChild
                    className="w-full"
                    variant={p.code === highlighted ? "default" : "outline-primary"}
                  >
                    <Link href="/signup">{t("plans.cta")}</Link>
                  </Button>
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-[15px] text-muted-foreground">{t("plans.empty")}</p>
        )}
      </PublicSection>

      {contact ? (
        <PublicSection id="contact" title={t("contact.title")} subtitle={t("contact.body")}>
          <div className="flex justify-center">
            <Button asChild size="lg">
              <a href={telegramUrl(contact)} rel="noopener" data-testid="contact-telegram">
                <Send aria-hidden />
                {t("contact.button")}
              </a>
            </Button>
          </div>
        </PublicSection>
      ) : null}
    </>
  );
}
