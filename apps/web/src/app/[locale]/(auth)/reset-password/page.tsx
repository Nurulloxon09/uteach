import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

/** Reached after verifying the SMS code from "forgot password", which signs the user in. */
export default async function ResetPasswordPage() {
  await requireUser();
  const t = await getTranslations("auth.reset");
  return (
    <AuthCard title={t("title")} description={<>{t("description")}</>}><ResetPasswordForm /></AuthCard>
  );
}
