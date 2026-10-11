import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { AttendanceForm } from "./attendance-form";
import { CenterForm } from "./center-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.center");
  return { title: t("title") };
}

export default async function CenterSettingsPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.center");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("centers")
    .select(
      "attendance_edit_hours, absence_alert_delay_min, late_alert_enabled, quiet_hours_start, quiet_hours_end",
    )
    .eq("id", ctx.center.id)
    .single();

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
      <Section
        className="max-w-3xl"
        title={t("detailsTitle")}
        description={ctx.can.editCenter ? t("detailsHint") : t("readOnlyHint")}
      >
        <CenterForm center={ctx.center} editable={ctx.can.editCenter} />
      </Section>
      {rules ? (
        <Section
          className="max-w-3xl"
          title={t("attendanceTitle")}
          description={ctx.can.editCenter ? t("attendanceHint") : t("readOnlyHint")}
        >
          <AttendanceForm
            editable={ctx.can.editCenter}
            settings={{
              editHours: rules.attendance_edit_hours,
              alertDelay: rules.absence_alert_delay_min,
              lateAlerts: rules.late_alert_enabled,
              quietStart: rules.quiet_hours_start.slice(0, 5),
              quietEnd: rules.quiet_hours_end.slice(0, 5),
            }}
          />
        </Section>
      ) : null}
    </>
  );
}
