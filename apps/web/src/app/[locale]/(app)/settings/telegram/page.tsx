import { BotOff, GraduationCap, ShieldCheck, Users, UserRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { EmptyState, PageHeader, Section, StatTiles } from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { InviteLink } from "../../staff/invite-link";

export async function generateMetadata() {
  const t = await getTranslations("settings.telegram");
  return { title: t("title") };
}

type Overview = {
  activeStudents: number;
  reachedStudents: number;
  linkedStudents: number;
  linkedGuardians: number;
  linkedStaff: number;
};

/** The QR code as SVG markup drawn in the current text color (theme tokens), with a transparent background. */
async function qrSvg(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return svg
    .replace(/stroke="#[0-9a-fA-F]{6,8}"/g, 'stroke="currentColor"')
    .replace(/fill="#[0-9a-fA-F]{6,8}"/g, 'fill="none"');
}

/**
 * Settings → Telegram (17): the center's bot link `t.me/<bot>?start=c_{slug}` to share and a QR code to
 * print, and who the bot reaches (students reached directly or through a guardian, linked guardians, staff).
 */
export default async function TelegramSettingsPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.telegram");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();
  const [{ data: center }, { data: overview }] = await Promise.all([
    supabase.from("centers").select("slug").eq("id", ctx.center.id).single(),
    supabase.rpc("notification_overview", { p_center_id: ctx.center.id }),
  ]);
  const bot = publicEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const url = bot && center ? `https://t.me/${bot}?start=c_${center.slug}` : null;
  const qr = url ? await qrSvg(url) : null;
  const o = (overview ?? {}) as Partial<Overview>;
  const n = (v: number | undefined) => format.number(v ?? 0);

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: tn("settings") },
          { label: t("title") },
        ]}
      />
      <Section className="max-w-3xl" title={t("linkTitle")} description={t("linkHint")}>
        {url && qr ? (
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
            <InviteLink url={url} title={t("linkLabel")} hint={t("linkShare")} testId="bot-link" />
            <figure className="space-y-2">
              <div
                className="size-44 rounded-2xl border border-border bg-card p-2 text-foreground [&_svg]:size-full"
                role="img"
                aria-label={t("qrLabel")}
                data-testid="bot-qr"
                // Generated locally from our own URL by the qrcode package.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <figcaption className="max-w-44 text-sm text-muted-foreground">
                {t("qrHint")}
              </figcaption>
            </figure>
          </div>
        ) : (
          <EmptyState icon={BotOff} title={t("notSetUp")} hint={t("notSetUpHint")} />
        )}
      </Section>
      <Section title={t("reachTitle")} description={t("reachHint")}>
        <StatTiles
          items={[
            {
              key: "reached",
              label: t("reached"),
              value: `${n(o.reachedStudents)} / ${n(o.activeStudents)}`,
              icon: GraduationCap,
              tone: "green",
              href: "/students?telegram=no",
            },
            {
              key: "guardians",
              label: t("guardians"),
              value: n(o.linkedGuardians),
              icon: Users,
              tone: "blue",
            },
            {
              key: "students",
              label: t("students"),
              value: n(o.linkedStudents),
              icon: UserRound,
              tone: "orange",
            },
            {
              key: "staff",
              label: t("staff"),
              value: n(o.linkedStaff),
              icon: ShieldCheck,
              tone: "purple",
            },
          ]}
        />
      </Section>
    </>
  );
}
