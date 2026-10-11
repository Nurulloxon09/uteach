/**
 * Onboarding wizard (10-platform-onboarding): steps 1–2 create the center and its first branch; steps 3–6
 * are optional and resumable. Progress lives in `centers.settings.onboarding` ({ step: "done" | "skipped" }).
 */
export const LATER_STEPS = ["rooms", "courses", "import", "staff"] as const;
export type LaterStep = (typeof LATER_STEPS)[number];
export type StepStatus = "done" | "skipped";
export type OnboardingProgress = Partial<Record<LaterStep, StepStatus>>;

export function isLaterStep(value: unknown): value is LaterStep {
  return typeof value === "string" && (LATER_STEPS as readonly string[]).includes(value);
}

/** Reads the progress from `centers.settings` (anything unexpected is ignored). */
export function readProgress(settings: unknown): OnboardingProgress {
  const raw = (settings as { onboarding?: Record<string, unknown> } | null)?.onboarding ?? {};
  const progress: OnboardingProgress = {};
  for (const step of LATER_STEPS) {
    const value = raw[step];
    if (value === "done" || value === "skipped") progress[step] = value;
  }
  return progress;
}

/** The first step neither done nor skipped, or null when the wizard is finished. */
export function nextStep(progress: OnboardingProgress, after?: LaterStep): LaterStep | null {
  const start = after ? LATER_STEPS.indexOf(after) + 1 : 0;
  return (
    LATER_STEPS.slice(start).find((s) => !progress[s]) ??
    LATER_STEPS.find((s) => !progress[s]) ??
    null
  );
}

/**
 * Course presets for step 4. Names and levels come from the catalog (`onboarding.presets.<key>`) in the
 * center's language; levels are a comma-separated list. Exam presets get linked to exam types in M6.
 */
export const COURSE_PRESETS = [
  { key: "general_english", kind: "language", minutes: 90 },
  { key: "kids_english", kind: "language", minutes: 60 },
  { key: "ielts", kind: "exam_prep", minutes: 90 },
  { key: "sat", kind: "exam_prep", minutes: 90 },
  { key: "cefr", kind: "exam_prep", minutes: 90 },
  { key: "milliy", kind: "exam_prep", minutes: 90 },
  { key: "russian", kind: "language", minutes: 90 },
  { key: "math", kind: "school_subject", minutes: 90 },
] as const;
export type PresetKey = (typeof COURSE_PRESETS)[number]["key"];
