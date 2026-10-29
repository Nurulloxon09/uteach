import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthCard, AuthLayout, InitialsAvatar, StatusChip } from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./accept-invite-form";

export async function generateMetadata() {
  const t = await getTranslations("invite");
  return { title: t("title") };
}

export default async function InvitePage({ params }: PageProps<"/[locale]/invite/[token]">) {
  const { locale, token } = await params;
  const t = await getTranslations("invite");
  const tr = await getTranslations("roles");
  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    supabase.rpc("get_invite", { p_token: token }),
    getCurrentUser(),
  ]);
  const invite = data?.[0];
  const next = `/${locale}/invite/${token}`;

  if (!invite || invite.is_expired) {
    return (
      <AuthLayout>
        <AuthCard title={t("invalidTitle")} description={t("invalidDescription")} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t("title")}
        description={t("description", {
          center: invite.center_name,
          role: tr(invite.role),
          name: invite.display_name,
        })}
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-xl bg-muted p-4">
            <InitialsAvatar name={invite.display_name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">
                {invite.display_name}
              </p>
              <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <Building2 className="size-4 text-primary" strokeWidth={1.8} aria-hidden />
                {invite.center_name}
              </p>
            </div>
            <StatusChip tone="primary">{tr(invite.role)}</StatusChip>
          </div>
          <p className="text-[15px] text-secondary-foreground">{t("loginHint")}</p>
          {user ? (
            <AcceptInviteForm token={token} />
          ) : (
            <div className="grid gap-3">
              <Link
                href={{ pathname: "/signup", query: { next } }}
                className={buttonVariants({ className: "w-full" })}
              >
                {t("signupToAccept")}
              </Link>
              <Link
                href={{ pathname: "/login", query: { next } }}
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                {t("loginToAccept")}
              </Link>
            </div>
          )}
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
