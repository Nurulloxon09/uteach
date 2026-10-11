import { DEFAULT_ADMIN_FLAGS, PERMISSION_FLAGS } from "@uteach/db";
import { FileSpreadsheet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { getCenterContext } from "@/lib/center";
import { isLaterStep, readProgress } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { InviteDialog } from "../../(app)/staff/invite-dialog";
import { WizardFrame } from "../wizard-frame";
import { ContinueButton, CoursesStepForm, RoomsStepForm, SkipButton } from "./step-forms";

export async function generateMetadata() {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

/** Wizard steps 3–6 (10): rooms → course presets → import → staff. Owners only; each step can be skipped. */
export default async function OnboardingStepPage({
  params,
}: PageProps<"/[locale]/onboarding/[step]">) {
  const { step } = await params;
  if (!isLaterStep(step)) notFound();
  const ctx = await getCenterContext();
  if (ctx.membership.role !== "owner")
    return redirect({ href: "/home", locale: await getLocale() });
  const t = await getTranslations("onboarding");
  const supabase = await createClient();

  const [{ data: center }, { data: rooms }, { data: branches }, { count: invited }] =
    await Promise.all([
      supabase.from("centers").select("settings").eq("id", ctx.center.id).single(),
      supabase
        .from("rooms")
        .select("name")
        .eq("center_id", ctx.center.id)
        .is("archived_at", null)
        .order("created_at"),
      supabase
        .from("branches")
        .select("id, name")
        .eq("center_id", ctx.center.id)
        .is("archived_at", null)
        .order("created_at"),
      supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("center_id", ctx.center.id)
        .neq("role", "owner"),
    ]);
  const progress = readProgress(center?.settings);
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SkipButton step={step} />
      <Link
        href="/home"
        className="text-sm font-medium text-muted-foreground hover:text-primary"
        data-testid="finish-later"
      >
        {t("finishLater")}
      </Link>
    </div>
  );

  return (
    <WizardFrame
      current={step}
      progress={progress}
      title={t(`titles.${step}`)}
      description={t(`hints.${step}`)}
      footer={footer}
    >
      {step === "rooms" ? (
        <div className="space-y-5">
          {rooms?.length ? (
            <p className="text-[15px] text-secondary-foreground">
              {t("existingRooms", { names: rooms.map((r) => r.name).join(", ") })}
            </p>
          ) : null}
          <RoomsStepForm />
        </div>
      ) : null}

      {step === "courses" ? <CoursesStepForm /> : null}

      {step === "import" ? (
        <div className="space-y-4">
          <Link
            href="/import?kind=students&from=onboarding"
            className={buttonVariants({
              variant: "outline-primary",
              size: "lg",
              className: "w-full",
            })}
          >
            <FileSpreadsheet />
            {t("openImport")}
          </Link>
          <ContinueButton step="import" label={t("continue")} />
        </div>
      ) : null}

      {step === "staff" ? (
        <div className="space-y-4">
          <p className="text-[15px] text-secondary-foreground">
            {t("invitedCount", { count: invited ?? 0 })}
          </p>
          <div className="flex justify-center">
            <InviteDialog
              roles={["teacher", "admin"]}
              branches={branches ?? []}
              flags={[...PERMISSION_FLAGS]}
              defaultFlags={[...DEFAULT_ADMIN_FLAGS]}
            />
          </div>
          <ContinueButton step="staff" label={t("finish")} />
        </div>
      ) : null}
    </WizardFrame>
  );
}
