import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { readPending } from "../actions";
import { VerifyForm } from "./verify-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.verify");
  return { title: t("title") };
}

export default async function VerifyPage() {
  const t = await getTranslations("auth.verify");
  const pending = await readPending();

  return (
    <AuthCard title={t("title")} description={<>{pending ? t("description", { phone: pending.phone }) : t("expired")}</>}>{pending ? (
          <VerifyForm />
        ) : (
          <Link href="/login" className="text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            {t("backToLogin")}
          </Link>
        )}</AuthCard>
  );
}
