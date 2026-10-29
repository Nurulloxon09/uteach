import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

/** "Change password" for the signed-in person (account menu; M7f). */
export default async function ResetPasswordPage() {
  await requireUser();
  const t = await getTranslations("auth.reset");
  return (
    <AuthCard title={t("title")} description={<>{t("description")}</>}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
