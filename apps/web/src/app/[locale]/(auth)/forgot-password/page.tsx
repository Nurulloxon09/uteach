import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
import { ForgotPasswordForm } from "./forgot-password-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <AuthCard title={t("title")} description={<>{t("description")}</>}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
