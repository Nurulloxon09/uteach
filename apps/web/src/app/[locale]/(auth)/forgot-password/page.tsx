import { KeyRound, Send } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthCard, telegramUrl } from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { publicEnv } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

/**
 * No SMS since M7f (10 "Auth"): staff get a new password from their center's owner (Staff → Set new password);
 * owners ask uteach, who sets it in /admin.
 */
export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  const contact = publicEnv.NEXT_PUBLIC_CONTACT_TELEGRAM;
  return (
    <AuthCard title={t("title")} description={<>{t("description")}</>}>
      <div className="grid gap-4" data-testid="forgot-help">
        <div className="flex gap-3 rounded-xl bg-muted p-4">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-foreground">{t("staffTitle")}</p>
            <p className="text-sm text-secondary-foreground">{t("staffBody")}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl bg-muted p-4">
          <Send className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-foreground">{t("ownerTitle")}</p>
            <p className="text-sm text-secondary-foreground">{t("ownerBody")}</p>
          </div>
        </div>
        {contact ? (
          <a
            href={telegramUrl(contact)}
            rel="noopener"
            className={buttonVariants({ className: "w-full" })}
          >
            {t("writeUs")}
          </a>
        ) : null}
        <Link href="/login" className={buttonVariants({ variant: "outline", className: "w-full" })}>
          {t("backToLogin")}
        </Link>
      </div>
    </AuthCard>
  );
}
