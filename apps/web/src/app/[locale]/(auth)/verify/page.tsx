import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {pending ? t("description", { phone: pending.phone }) : t("expired")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending ? (
          <VerifyForm />
        ) : (
          <Link href="/login" className="text-sm underline-offset-4 hover:underline">
            {t("backToLogin")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
