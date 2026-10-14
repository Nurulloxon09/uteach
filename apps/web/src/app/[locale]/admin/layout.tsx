import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AppShell, EmptyState, type NavEntry } from "@/components/patterns";
import { requireSuperAdmin } from "@/lib/super-admin";
import { logoutAction } from "../(auth)/actions";

/**
 * /admin (M7b): uteach's own pages for super-admins, outside any center. Its own nav, no center switcher.
 * Everyone else gets a 404 (`requireSuperAdmin`).
 */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const admin = await requireSuperAdmin();
  const t = await getTranslations("admin");

  const nav: NavEntry[] = [
    { key: "centers", label: t("nav.centers"), href: "/admin/centers", icon: "branches" },
    { key: "plans", label: t("nav.plans"), href: "/admin/plans", icon: "plans" },
    { key: "invoices", label: t("nav.invoices"), href: "/admin/invoices", icon: "invoices" },
    { key: "health", label: t("nav.health"), href: "/admin/health", icon: "health" },
  ];

  return (
    <AppShell
      nav={nav}
      user={{ name: admin.fullName, roleLabel: t("role") }}
      centers={[]}
      currentCenterId=""
      logout={logoutAction}
    >
      {admin.db ? (
        children
      ) : (
        <EmptyState icon={KeyRound} title={t("noKey.title")} hint={t("noKey.hint")} />
      )}
    </AppShell>
  );
}
