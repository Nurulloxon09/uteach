import { todayIn } from "@uteach/core";
import { isLocale } from "@uteach/i18n";
import { TEMPLATE_KEYS, type TemplateKey } from "@uteach/i18n/notifications";
import { getTranslations } from "next-intl/server";
import { DataTable, MobileRecord, PageHeader, Section, StatusChip } from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { DeliveryForm } from "./delivery-form";
import { TemplateEditor, type TemplateEntry } from "./template-editor";

export async function generateMetadata() {
  const t = await getTranslations("settings.notifications");
  return { title: t("title") };
}

type TemplateRow = {
  center_id: string | null;
  key: string;
  channel: "telegram" | "sms" | "whatsapp" | "email";
  locale: string;
  body: string;
  sms_provider_template_id: string | null;
  is_enabled: boolean;
};

/**
 * Settings → Notifications (17, M4 plan): reminders and SMS (owners), and every message parents and staff get,
 * each with on/off, its texts per language (with a live preview), the Eskiz id of SMS texts and "reset to
 * default". Staff with `settings` edit messages; other admins read them.
 */
export default async function NotificationSettingsPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.notifications");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const [{ data: center }, { data: templates }, { data: overview }] = await Promise.all([
    supabase
      .from("centers")
      .select(
        "reminder_every_days, due_soon_reminder_enabled, sms_enabled, sms_monthly_cap, quiet_hours_start, quiet_hours_end",
      )
      .eq("id", ctx.center.id)
      .single(),
    supabase
      .from("notification_templates")
      .select("center_id, key, channel, locale, body, sms_provider_template_id, is_enabled")
      .or(`center_id.is.null,center_id.eq.${ctx.center.id}`),
    supabase.rpc("notification_overview", { p_center_id: ctx.center.id }),
  ]);

  const rows = (templates ?? []) as TemplateRow[];
  const entries: TemplateEntry[] = TEMPLATE_KEYS.map((key: TemplateKey) => {
    const entry: TemplateEntry = { key, enabled: true, customized: false, telegram: {}, sms: {} };
    for (const sys of rows.filter((r) => r.key === key && r.center_id === null)) {
      if (!isLocale(sys.locale) || (sys.channel !== "telegram" && sys.channel !== "sms")) continue;
      const own = rows.find(
        (r) =>
          r.center_id !== null &&
          r.key === key &&
          r.channel === sys.channel &&
          r.locale === sys.locale,
      );
      if (own) {
        entry.customized = true;
        if (!own.is_enabled) entry.enabled = false;
      }
      entry[sys.channel][sys.locale] = {
        body: own?.body ?? sys.body,
        systemBody: sys.body,
        smsId: own?.sms_provider_template_id ?? sys.sms_provider_template_id,
      };
    }
    return entry;
  });

  const smsThisMonth = Number((overview as { smsThisMonth?: number } | null)?.smsThisMonth ?? 0);
  const smsState = (e: TemplateEntry) => {
    const texts = Object.values(e.sms);
    if (texts.length === 0) return null;
    return texts.every((s) => s?.smsId) ? (
      <StatusChip tone="success">{t("smsApproved")}</StatusChip>
    ) : (
      <StatusChip tone="muted">{t("smsNotApproved")}</StatusChip>
    );
  };
  const statusOf = (e: TemplateEntry) => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip tone={e.enabled ? "success" : "muted"}>
        {e.enabled ? t("on") : t("off")}
      </StatusChip>
      {e.customized ? <StatusChip tone="primary">{t("customized")}</StatusChip> : null}
    </div>
  );
  const actionsOf = (e: TemplateEntry) => (
    <TemplateEditor
      entry={e}
      center={ctx.center.name}
      currency={ctx.center.currency}
      today={todayIn(ctx.center.timezone)}
      editable={ctx.can.settings}
    />
  );

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
      {center ? (
        <Section
          className="max-w-3xl"
          title={t("deliveryTitle")}
          description={
            <>
              {ctx.can.editCenter ? t("deliveryHint") : t("readOnlyHint")}{" "}
              {t("quietHours", {
                from: center.quiet_hours_start.slice(0, 5),
                to: center.quiet_hours_end.slice(0, 5),
              })}{" "}
              <Link href="/settings/center" className="font-medium text-primary hover:underline">
                {t("quietHoursLink")}
              </Link>
            </>
          }
        >
          <p className="mb-4 text-[15px] text-muted-foreground" data-testid="sms-usage">
            {t("smsUsage", { sent: smsThisMonth, cap: center.sms_monthly_cap })}
          </p>
          <DeliveryForm
            editable={ctx.can.editCenter}
            settings={{
              reminderEveryDays: center.reminder_every_days,
              dueSoon: center.due_soon_reminder_enabled,
              smsEnabled: center.sms_enabled,
              smsMonthlyCap: center.sms_monthly_cap,
            }}
          />
        </Section>
      ) : null}
      <Section
        title={t("messagesTitle")}
        description={ctx.can.settings ? t("messagesHint") : t("readOnlyHint")}
      >
        <DataTable
          testId="template-row"
          rows={entries}
          rowKey={(e) => e.key}
          columns={[
            {
              key: "message",
              header: t("message"),
              cell: (e) => (
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">{t(`keys.${e.key}.title`)}</p>
                  <p className="text-sm text-muted-foreground">{t(`keys.${e.key}.hint`)}</p>
                </div>
              ),
            },
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "sms", header: t("sms"), cell: (e) => smsState(e) ?? "—" },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-56" },
          ]}
          mobileCard={(e) => (
            <MobileRecord
              title={t(`keys.${e.key}.title`)}
              subtitle={t(`keys.${e.key}.hint`)}
              status={statusOf(e)}
              fields={[{ label: t("sms"), value: smsState(e) ?? "—" }]}
              actions={actionsOf(e)}
            />
          )}
        />
      </Section>
    </>
  );
}
