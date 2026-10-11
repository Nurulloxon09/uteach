import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthLayout, EmptyState } from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Any notFound() under [locale]: a soft empty state with a way home. */
export default async function NotFound() {
  const t = await getTranslations("states");
  return (
    <AuthLayout>
      <div className="rounded-2xl bg-card shadow-card">
        <EmptyState
          icon={Compass}
          title={t("notFoundTitle")}
          hint={t("notFoundHint")}
          action={
            <Link href="/" className={buttonVariants()}>
              {t("goHome")}
            </Link>
          }
        />
      </div>
    </AuthLayout>
  );
}
