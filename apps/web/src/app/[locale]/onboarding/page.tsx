import { getTranslations } from "next-intl/server";
import { AuthCard, AuthLayout } from "@/components/patterns";
import { requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { CreateCenterForm } from "./create-center-form";

export async function generateMetadata() {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

/** First run for a new owner. The full onboarding wizard is M1; M0 creates the center and first branch. */
export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  const user = await requireUser();
  const t = await getTranslations("onboarding");

  return (
    <AuthLayout wide>
      <AuthCard title={t("title")} description={t("description", { name: user.fullName })}>
        <CreateCenterForm
          defaultLocale={locale}
          defaultTimezone={publicEnv.NEXT_PUBLIC_DEFAULT_TIMEZONE}
        />
      </AuthCard>
    </AuthLayout>
  );
}
