import { subscriptionBanner } from "@uteach/core";
import type { CenterStatus } from "@uteach/db";
import { CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AppShell, type NavEntry, type ShellChip } from "@/components/patterns";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { teachesLessons } from "@/lib/academics";
import { getCenterContext } from "@/lib/center";
import { logoutAction } from "../(auth)/actions";
import { switchCenterAction } from "./actions";

const STATUS_TONE: Record<CenterStatus, ShellChip["tone"] | null> = {
  active: null,
  trial: "primary",
  past_due: "warning",
  read_only: "destructive",
  cancelled: "muted",
};

/**
 * Signed-in pages: AppShell with the nav items this role and these permission flags allow (05-ui §4).
 * Owners and admins who teach also get Today (M2).
 */
export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const ctx = await getCenterContext();
  const t = await getTranslations("nav");
  const tr = await getTranslations("roles");
  const ts = await getTranslations("centerStatus");
  const teaches = ctx.can.seeAdminPages && (await teachesLessons(ctx));

  const nav: NavEntry[] = ctx.can.seeAdminPages
    ? [
        { key: "home", label: t("home"), href: "/home", icon: "home" },
        ...(teaches
          ? [{ key: "today", label: t("today"), href: "/today", icon: "today" } as const]
          : []),
        ...(ctx.can.leads
          ? [{ key: "leads", label: t("leads"), href: "/leads", icon: "leads" } as const]
          : []),
        { key: "students", label: t("students"), href: "/students", icon: "students" },
        ...(ctx.can.broadcasts
          ? [
              {
                key: "broadcasts",
                label: t("broadcasts"),
                href: "/broadcasts",
                icon: "broadcasts",
              } as const,
            ]
          : []),
        { key: "groups", label: t("groups"), href: "/groups", icon: "groups" },
        { key: "schedule", label: t("schedule"), href: "/schedule", icon: "schedule" },
        { key: "attendance", label: t("attendance"), href: "/attendance", icon: "attendance" },
        { key: "exams", label: t("exams"), href: "/exams", icon: "exams" },
        ...(ctx.can.billing || ctx.can.payments
          ? [
              {
                key: "payments",
                label: t("payments"),
                href: "/payments",
                icon: "payments",
              } as const,
            ]
          : []),
        ...(ctx.can.billing
          ? [{ key: "debtors", label: t("debtors"), href: "/debtors", icon: "debtors" } as const]
          : []),
        ...(ctx.can.manageStaff
          ? [{ key: "staff", label: t("staff"), href: "/staff", icon: "staff" } as const]
          : []),
        {
          key: "settings",
          label: t("settings"),
          icon: "settings",
          children: [
            { key: "center", label: t("center"), href: "/settings/center" },
            { key: "branches", label: t("branches"), href: "/settings/branches" },
            { key: "courses", label: t("courses"), href: "/settings/courses" },
            { key: "examTypes", label: t("examTypes"), href: "/settings/exam-types" },
            { key: "holidays", label: t("holidays"), href: "/settings/holidays" },
            ...(ctx.can.leads
              ? [{ key: "lostReasons", label: t("lostReasons"), href: "/settings/lost-reasons" }]
              : []),
            { key: "notifications", label: t("notifications"), href: "/settings/notifications" },
            { key: "telegram", label: t("telegram"), href: "/settings/telegram" },
            ...(ctx.membership.role === "owner"
              ? [
                  { key: "subscription", label: t("subscription"), href: "/settings/subscription" },
                  { key: "health", label: t("health"), href: "/settings/health" },
                  { key: "auditLog", label: t("auditLog"), href: "/settings/audit-log" },
                ]
              : []),
          ],
        },
      ]
    : [
        { key: "today", label: t("today"), href: "/today", icon: "today" },
        { key: "groups", label: t("myGroups"), href: "/groups", icon: "groups" },
        { key: "scores", label: t("scores"), href: "/exams", icon: "exams" },
      ];

  const tone = STATUS_TONE[ctx.center.status];
  const tb = await getTranslations("subscription.banner");
  // A server render: "now" is the request time.
  const now = new Date();
  const banner = subscriptionBanner(
    {
      status: ctx.center.status,
      trialEndsAt: ctx.center.trialEndsAt ? new Date(ctx.center.trialEndsAt) : null,
      pastDueSince: ctx.center.pastDueSince ? new Date(ctx.center.pastDueSince) : null,
      timeZone: ctx.center.timezone,
    },
    now,
  );
  const bannerText = !banner
    ? null
    : banner.kind === "read_only"
      ? tb("readOnly")
      : tb(banner.kind === "past_due" ? "pastDue" : "trialEnding", { days: banner.days });

  return (
    <AppShell
      nav={nav}
      user={{ name: ctx.user.fullName, roleLabel: tr(ctx.membership.role) }}
      centers={ctx.memberships.map((m) => ({ id: m.centerId, name: m.centerName }))}
      currentCenterId={ctx.center.id}
      centerChip={tone ? { label: ts(ctx.center.status), tone } : undefined}
      switchCenter={switchCenterAction}
      logout={logoutAction}
    >
      {banner && bannerText ? (
        <Alert
          variant={banner.kind === "trial_ending" ? "default" : "destructive"}
          data-testid="subscription-banner"
        >
          <CircleAlert />
          <p>
            {bannerText}{" "}
            {ctx.membership.role === "owner" ? (
              <Link href="/settings/subscription" className="font-semibold underline">
                {tb("open")}
              </Link>
            ) : (
              tb("askOwner")
            )}
          </p>
        </Alert>
      ) : null}
      {children}
    </AppShell>
  );
}
