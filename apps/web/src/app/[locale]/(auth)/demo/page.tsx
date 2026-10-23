import { getLocale, getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
import { redirect } from "@/i18n/navigation";
import { demoTeacherLogin } from "@/lib/env";
import { DemoForm } from "./demo-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.demo");
  return { title: t("title") };
}

/**
 * The public teacher demo (10, "Teacher demo"): one button signs the visitor in as the demo teacher of a sample
 * center. Only while DEMO_TEACHER_PHONE and DEMO_TEACHER_PASSWORD are set (`pnpm demo:seed` prints them); without
 * them it sends visitors to the login page, so links to it never break.
 */
export default async function DemoPage() {
  if (!demoTeacherLogin()) return redirect({ href: "/login", locale: await getLocale() });
  const t = await getTranslations("auth.demo");
  return (
    <AuthCard title={t("title")} description={<>{t("description")}</>}>
      <DemoForm />
    </AuthCard>
  );
}
