import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { TimezoneSelect } from "@/components/timezone-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-end px-4 py-3">
        <LocaleSwitcher className="w-auto" />
      </header>
      <main className="flex flex-1 justify-center px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description", { name: user.fullName })}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCenterForm
              defaultLocale={locale}
              timezoneSelect={
                <TimezoneSelect
                  id="field-timezone"
                  name="timezone"
                  defaultValue={publicEnv.NEXT_PUBLIC_DEFAULT_TIMEZONE}
                />
              }
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
