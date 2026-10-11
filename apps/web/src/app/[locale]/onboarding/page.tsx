import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { CreateCenterForm } from "./create-center-form";
import { WizardFrame } from "./wizard-frame";

export async function generateMetadata() {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

/** Wizard steps 1–2 for a new owner (also "Create another center"): center + first branch. */
export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  const user = await requireUser();
  const t = await getTranslations("onboarding");

  return (
    <WizardFrame
      current="setup"
      progress={{}}
      title={t("title")}
      description={t("description", { name: user.fullName })}
    >
      <CreateCenterForm
        defaultLocale={locale}
        defaultTimezone={publicEnv.NEXT_PUBLIC_DEFAULT_TIMEZONE}
        currency="UZS"
      />
    </WizardFrame>
  );
}
