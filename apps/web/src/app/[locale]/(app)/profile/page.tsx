import { AtSign, Building2, KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  InitialsAvatar,
  PageHeader,
  ProfileCard,
  Section,
  StatusChip,
} from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getMemberships } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export async function generateMetadata() {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

/** My profile (M7g, every role): login (read-only), name, phone, language; centers and roles. */
export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getTranslations("profile");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tr = await getTranslations("roles");
  const supabase = await createClient();
  const [{ data: profile }, memberships] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, locale, username")
      .eq("id", user.id)
      .single(),
    getMemberships(),
  ]);
  if (!profile) return null;

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/" }, { label: t("title") }]}
        action={
          <Link
            href="/reset-password"
            className={buttonVariants({ variant: "outline-primary", size: "lg" })}
          >
            <KeyRound />
            {tn("changePassword")}
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ProfileCard
          avatar={<InitialsAvatar name={profile.full_name} size="lg" />}
          name={profile.full_name}
          rows={[
            { key: "login", icon: AtSign, value: profile.username },
            ...memberships.map((m) => ({
              key: m.membershipId,
              icon: Building2,
              value: (
                <span className="flex flex-wrap items-center gap-2">
                  {m.centerName}
                  <StatusChip tone="primary">{tr(m.role)}</StatusChip>
                </span>
              ),
            })),
          ]}
          chip={<p className="text-sm text-muted-foreground">{t("loginHint")}</p>}
        />
        <Section title={t("details")}>
          <ProfileForm
            profile={{
              fullName: profile.full_name,
              phone: profile.phone,
              locale: profile.locale,
            }}
          />
        </Section>
      </div>
    </>
  );
}
