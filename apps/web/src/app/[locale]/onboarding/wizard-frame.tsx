import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthCard, AuthLayout, Stepper, type Step } from "@/components/patterns";
import { LATER_STEPS, type LaterStep, type OnboardingProgress } from "@/lib/onboarding";

const ALL_STEPS = ["center", "branch", ...LATER_STEPS] as const;

/** The onboarding wizard's frame: stepper (6 steps) above a wide card. */
export async function WizardFrame({
  current,
  progress,
  title,
  description,
  footer,
  children,
}: {
  /** "setup" = steps 1–2 (center + branch). */
  current: "setup" | LaterStep;
  progress: OnboardingProgress;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations("onboarding");
  const created = current !== "setup";
  const steps: Step[] = ALL_STEPS.map((key) => {
    if (key === "center" || key === "branch") {
      return { key, label: t(`steps.${key}`), state: created ? "done" : "current" };
    }
    const status = progress[key];
    return {
      key,
      label: t(`steps.${key}`),
      state:
        key === current
          ? "current"
          : status === "done"
            ? "done"
            : status === "skipped"
              ? "skipped"
              : "todo",
      href: created ? `/onboarding/${key}` : undefined,
    };
  });

  return (
    <AuthLayout wide>
      <div className="mb-6">
        <Stepper steps={steps} label={t("stepsLabel")} />
      </div>
      <AuthCard title={title} description={description} footer={footer}>
        {children}
      </AuthCard>
    </AuthLayout>
  );
}
