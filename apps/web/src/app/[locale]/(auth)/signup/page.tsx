import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/paths";
import { SignupForm } from "./signup-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

export default async function SignupPage({ searchParams }: PageProps<"/[locale]/signup">) {
  const t = await getTranslations("auth.signup");
  const next = safeNextPath((await searchParams).next);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm next={next} />
      </CardContent>
    </Card>
  );
}
