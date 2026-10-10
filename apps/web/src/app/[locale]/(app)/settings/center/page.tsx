import { getTranslations } from "next-intl/server";
import { TimezoneSelect } from "@/components/timezone-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminContext } from "@/lib/center";
import { CenterForm } from "./center-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.center");
  return { title: t("title") };
}

export default async function CenterSettingsPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.center");

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
          <CardDescription>
            {ctx.can.editCenter ? t("detailsHint") : t("readOnlyHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CenterForm
            center={ctx.center}
            editable={ctx.can.editCenter}
            timezoneSelect={
              <TimezoneSelect
                id="field-timezone"
                name="timezone"
                defaultValue={ctx.center.timezone}
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
