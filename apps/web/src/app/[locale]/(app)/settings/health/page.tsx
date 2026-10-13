import { Activity, CircleAlert, CircleCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, Section, StatusChip } from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("settings.health");
  return { title: t("title") };
}

/** A heartbeat older than this means the service is down (30-milestones M4). */
const STALE_MS = 2 * 60 * 1000;

/**
 * Settings → Health (temporary, owners, until super-admin exists): when each background service last checked
 * in. The worker beats every 30 s; red after 2 minutes of silence.
 */
export default async function HealthPage() {
  const ctx = await requireAdminContext();
  if (ctx.membership.role !== "owner") notFound();
  const t = await getTranslations("settings.health");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase.rpc("worker_health");
  const services = data ?? [];
  // A server render: "now" is the request time.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

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
      <Section className="max-w-3xl" title={t("servicesTitle")} description={t("servicesHint")}>
        {services.length === 0 ? (
          <EmptyState icon={Activity} title={t("never")} hint={t("neverHint")} />
        ) : (
          <ul className="divide-y divide-border">
            {services.map((s) => {
              const ok = now - new Date(s.last_beat_at).getTime() < STALE_MS;
              return (
                <li
                  key={s.service}
                  className="flex items-center justify-between gap-4 py-3"
                  data-testid="service"
                >
                  <div className="flex items-center gap-3">
                    {ok ? (
                      <CircleCheck className="size-5 text-success" aria-hidden />
                    ) : (
                      <CircleAlert className="size-5 text-destructive" aria-hidden />
                    )}
                    <div>
                      <p className="font-semibold text-foreground">
                        {s.service === "worker" ? t("services.worker") : s.service}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("lastBeat", {
                          when: format.relativeTime(new Date(s.last_beat_at), now),
                        })}
                      </p>
                    </div>
                  </div>
                  <StatusChip tone={ok ? "success" : "destructive"}>
                    {ok ? t("ok") : t("down")}
                  </StatusChip>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
