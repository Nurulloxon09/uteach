import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-end px-4 py-3">
        <LocaleSwitcher className="w-auto" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <Card className="w-full max-w-sm">
          {!invite || invite.is_expired ? (
            <CardHeader>
              <CardTitle>{t("invalidTitle")}</CardTitle>
              <CardDescription>{t("invalidDescription")}</CardDescription>
            </CardHeader>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{t("title")}</CardTitle>
                <CardDescription>
                  {t("description", {
                    center: invite.center_name,
                    role: tr(invite.role),
                    name: invite.display_name,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  {t("phoneHint", { phone: invite.phone_hint })}
                </p>
                {user ? (
                  <AcceptInviteForm token={token} />
                ) : (
                  <div className="grid gap-2">
                    <Link
                      href={{ pathname: "/signup", query: { next } }}
                      className={buttonVariants()}
                    >
                      {t("signupToAccept")}
                    </Link>
                    <Link
                      href={{ pathname: "/login", query: { next } }}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      {t("loginToAccept")}
                    </Link>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
