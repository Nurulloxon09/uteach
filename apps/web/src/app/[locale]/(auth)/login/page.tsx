import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
import { safeNextPath } from "@/lib/paths";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const t = await getTranslations("auth.login");
  const next = safeNextPath((await searchParams).next);
  return (
    <AuthCard title={t("title")} description={<>{t("description")}</>}>
      <LoginForm next={next} />
    </AuthCard>
  );
}
