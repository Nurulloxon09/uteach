import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LanguageMenu } from "./app-shell/menus";
import { Wordmark } from "./wordmark";

/**
 * Pages outside the app (auth, onboarding, invite): wordmark + language menu on top, a centered
 * `rounded-2xl` card on `bg-background` (05-ui §6b).
 */
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
        <Wordmark />
        <LanguageMenu />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-2 pb-12 sm:items-center sm:pt-0">
        <div className={cn("w-full", wide ? "max-w-[560px]" : "max-w-[440px]")}>{children}</div>
      </main>
    </div>
  );
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-card sm:p-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
      {description ? <p className="mt-2 text-[15px] text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
      {footer ? (
        <div className="mt-6 border-t border-border/70 pt-5 text-center text-[15px]">{footer}</div>
      ) : null}
    </div>
  );
}
