import type { LucideIcon } from "lucide-react";
import { Check, FileWarning, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LanguageMenu } from "./app-shell/menus";
import type { StatTone } from "./stat-tiles";
import { Wordmark } from "./wordmark";

/** A link to a Telegram username (without @). */
export function telegramUrl(username: string): string {
  return `https://t.me/${username}`;
}

/**
 * Pages for visitors (landing, terms, privacy; M7e): wordmark, section links, log in / start free and the
 * language menu on top; Terms, Privacy and the Telegram contact in the footer. Same tokens as the app.
 */
export function PublicLayout({
  children,
  contactTelegram,
}: {
  children: ReactNode;
  /** uteach's Telegram username; the contact links are hidden when it's missing. */
  contactTelegram?: string;
}) {
  const t = useTranslations("public");
  const year = new Date().getFullYear();
  const navLink =
    "rounded-lg px-3 py-2 text-[15px] font-medium text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30";
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-1 md:flex" aria-label={t("nav.features")}>
            <Link href={{ pathname: "/", hash: "features" }} className={navLink}>
              {t("nav.features")}
            </Link>
            <Link href={{ pathname: "/", hash: "plans" }} className={navLink}>
              {t("nav.plans")}
            </Link>
            {contactTelegram ? (
              <a href={telegramUrl(contactTelegram)} className={navLink} rel="noopener">
                {t("nav.contact")}
              </a>
            ) : null}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">{t("nav.login")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup" data-testid="header-signup">
                {t("nav.signup")}
              </Link>
            </Button>
            <LanguageMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[15px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>{t("footer.rights", { year })}</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/login" className="hover:text-foreground sm:hidden">
              {t("nav.login")}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {t("footer.terms")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {t("footer.privacy")}
            </Link>
            {contactTelegram ? (
              <a
                href={telegramUrl(contactTelegram)}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
                rel="noopener"
              >
                <Send className="size-4" aria-hidden />
                {t("nav.contact")}
              </a>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A band of the landing page: centered title and subtitle, then the content. */
export function PublicSection({
  id,
  title,
  subtitle,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-12 sm:px-8 sm:py-16", className)}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[26px] font-extrabold tracking-tight text-foreground sm:text-[32px]">
            {title}
          </h2>
          {subtitle ? <p className="mt-3 text-[17px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

const FEATURE_TONES: Record<StatTone, string> = {
  purple: "bg-stat-purple",
  blue: "bg-stat-blue",
  orange: "bg-stat-orange",
  green: "bg-stat-green",
};

/** One feature on the landing page: tinted icon box, title, a sentence. */
export function FeatureCard({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: LucideIcon;
  title: ReactNode;
  body: ReactNode;
  tone: StatTone;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" data-testid="feature-card">
      <span
        className={cn(
          "grid size-11 place-items-center rounded-xl text-primary",
          FEATURE_TONES[tone],
        )}
      >
        <Icon className="size-5" strokeWidth={1.9} aria-hidden />
      </span>
      <h3 className="mt-4 text-[17px] font-bold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[15px] text-muted-foreground">{body}</p>
    </div>
  );
}

/** A numbered step ("1 · Create your center"). */
export function StepCard({ n, title, body }: { n: number; title: ReactNode; body: ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <span className="grid size-9 place-items-center rounded-full bg-primary text-[15px] font-bold text-primary-foreground">
        {n}
      </span>
      <h3 className="mt-4 text-[17px] font-bold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[15px] text-muted-foreground">{body}</p>
    </div>
  );
}

/** A plan for visitors: name, monthly price, what's included, the sign-up button. */
export function PlanCard({
  name,
  price,
  period,
  items,
  action,
  highlighted = false,
}: {
  name: ReactNode;
  price: ReactNode;
  period: ReactNode;
  items: ReactNode[];
  action: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl bg-card p-6 shadow-card",
        highlighted && "ring-2 ring-primary",
      )}
      data-testid="plan-card"
    >
      <h3 className="text-[19px] font-bold text-foreground">{name}</h3>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[28px] font-extrabold tracking-tight text-foreground">
        {price}
        <span className="text-[15px] font-medium text-muted-foreground">{period}</span>
      </p>
      <ul className="mt-5 flex-1 space-y-2.5 text-[15px] text-secondary-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5 size-[18px] shrink-0 text-success" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{action}</div>
    </div>
  );
}

/** Terms / privacy: title, the "draft" notice, the date, numbered sections. */
export function LegalDocument({
  title,
  notice,
  updated,
  sections,
}: {
  title: ReactNode;
  /** The draft notice; omitted once a lawyer has read the text. */
  notice?: { title: ReactNode; body: ReactNode };
  updated: ReactNode;
  sections: { id: string; title: ReactNode; body: ReactNode }[];
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="text-[28px] font-extrabold tracking-tight text-foreground sm:text-[34px]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{updated}</p>
      {notice ? (
        <div
          role="note"
          className="mt-6 flex items-start gap-3 rounded-2xl bg-warning/10 p-4 text-[15px] text-foreground"
          data-testid="legal-draft"
        >
          <FileWarning className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold">{notice.title}</p>
            <p className="mt-0.5 text-secondary-foreground">{notice.body}</p>
          </div>
        </div>
      ) : null}
      <ol className="mt-8 space-y-7">
        {sections.map((s, i) => (
          <li key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="flex gap-2 text-[19px] font-bold text-foreground">
              <span className="text-primary tabular-nums">{i + 1}</span>
              <span>{s.title}</span>
            </h2>
            <p className="mt-2 text-[16px] leading-relaxed text-secondary-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
