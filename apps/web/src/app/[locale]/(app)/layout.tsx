import { getTranslations } from "next-intl/server";
import { AppNav, type NavItem } from "@/components/app-nav";
import { CenterSwitcher } from "@/components/center-switcher";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserMenu } from "@/components/user-menu";
import { Badge } from "@/components/ui/badge";
import { getCenterContext } from "@/lib/center";
import { logoutAction } from "../(auth)/actions";
import { switchCenterAction } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const ctx = await getCenterContext();
  const t = await getTranslations("nav");
  const tr = await getTranslations("roles");
  const ts = await getTranslations("centerStatus");

  const items: NavItem[] = ctx.can.seeAdminPages
    ? [
        { href: "/home", label: t("home") },
        { href: "/today", label: t("today") },
        ...(ctx.can.manageStaff ? [{ href: "/staff", label: t("staff") } as const] : []),
        { href: "/settings/branches", label: t("branches") },
        { href: "/settings/center", label: t("center") },
      ]
    : [{ href: "/today", label: t("today") }];

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <CenterSwitcher
            current={ctx.center.id}
            centers={ctx.memberships.map((m) => ({ id: m.centerId, name: m.centerName }))}
            action={switchCenterAction}
          />
          {ctx.center.status !== "active" ? (
            <Badge variant="secondary">{ts(ctx.center.status)}</Badge>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher className="w-auto" />
            <UserMenu
              name={ctx.user.fullName}
              role={tr(ctx.membership.role)}
              logout={logoutAction}
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4">
          <AppNav items={items} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
