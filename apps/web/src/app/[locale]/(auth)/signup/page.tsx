import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
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
    <AuthCard title={t("title")} description={<>{t("description")}</>}>
      <SignupForm next={next} />
    </AuthCard>
  );
}
