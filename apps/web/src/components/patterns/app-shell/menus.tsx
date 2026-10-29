"use client";

import { Building2, ChevronDown, KeyRound, Languages, LogOut, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "../initials-avatar";
import { StatusChip } from "../status-chip";
import type { ShellCenter, ShellChip, ShellUser } from "./nav";

const roundButton =
  "grid size-10 shrink-0 place-items-center rounded-full bg-muted/80 text-secondary-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30";

/** Round language button (top bar and auth pages). The same page reopens in the chosen language. */
export function LanguageMenu() {
  const t = useTranslations("locale");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={roundButton} aria-label={t("label")} disabled={pending}>
        <Languages className="size-[18px]" strokeWidth={1.8} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) =>
            startTransition(() =>
              router.replace(`${pathname}${window.location.search}`, {
                locale: next as (typeof routing.locales)[number],
              }),
            )
          }
        >
          {routing.locales.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {t(l)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Center switcher pill with the trial/past-due chip; also links to creating another center. */
export function CenterMenu({
  centers,
  currentCenterId,
  chip,
  switchCenter,
}: {
  centers: ShellCenter[];
  currentCenterId: string;
  chip?: ShellChip;
  switchCenter?: (form: FormData) => Promise<void>;
}) {
  const t = useTranslations("nav");
  const [pending, startTransition] = useTransition();
  const current = centers.find((c) => c.id === currentCenterId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("switchCenter")}
        disabled={pending}
        className="flex h-10 max-w-[280px] min-w-0 items-center gap-2 rounded-full bg-muted/80 px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Building2 className="size-[18px] shrink-0 text-primary" strokeWidth={1.8} />
        <span className="hidden truncate sm:inline">{current?.name}</span>
        {chip ? (
          <StatusChip tone={chip.tone} className="hidden px-2 py-0.5 text-xs md:inline-flex">
            {chip.label}
          </StatusChip>
        ) : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60">
        <DropdownMenuLabel>{t("centers")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentCenterId}
          onValueChange={(id) => {
            if (!switchCenter || id === currentCenterId) return;
            const form = new FormData();
            form.set("centerId", id);
            startTransition(() => switchCenter(form));
          }}
        >
          {centers.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id}>
              <span className="truncate">{c.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus />
            {t("newCenter")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** User chip (initials avatar + name + role + chevron) opening the account menu. */
export function UserMenu({ user, logout }: { user: ShellUser; logout?: () => Promise<void> }) {
  const t = useTranslations("nav");
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account")}
        className={cn(
          "flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30",
          pending && "opacity-60",
        )}
      >
        <InitialsAvatar name={user.name} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[160px] truncate text-sm font-semibold text-foreground">
            {user.name}
          </span>
          <span className="block text-xs text-muted-foreground">{user.roleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="text-sm">
          <span className="block font-semibold text-foreground">{user.name}</span>
          <span className="block text-muted-foreground">{user.roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/reset-password">
            <KeyRound />
            {t("changePassword")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            if (logout) startTransition(() => logout());
          }}
        >
          <LogOut />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
