import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("meta");
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="font-heading text-lg font-semibold">{t("title")}</span>
        <LocaleSwitcher className="w-auto" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
