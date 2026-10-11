import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Plus Jakarta Sans has no basic Cyrillic, so Russian glyphs fall back to Manrope (05-ui §3).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "meta",
  });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${jakarta.variable} ${manrope.variable} h-full`}>
      <body className="min-h-full">
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
