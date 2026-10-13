import "server-only";
import { todayIn } from "@uteach/core";
import type { ComposerOptions } from "@/app/[locale]/(app)/broadcasts/broadcast-composer";
import { loadBranches, loadCourses, loadGroupOptions } from "@/lib/academics";
import type { CenterContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";

/**
 * What the broadcast composer offers (17): the user's branches, groups and courses, whether SMS broadcasts are
 * possible (an approved `broadcast` SMS template, system or the center's own) and today in the center.
 */
export async function loadComposerOptions(ctx: CenterContext): Promise<ComposerOptions> {
  const supabase = await createClient();
  const [branches, groups, courses, { count }] = await Promise.all([
    loadBranches(ctx),
    loadGroupOptions(ctx),
    loadCourses(ctx),
    supabase
      .from("notification_templates")
      .select("id", { count: "exact", head: true })
      .eq("key", "broadcast")
      .eq("channel", "sms")
      .eq("is_enabled", true)
      .not("sms_provider_template_id", "is", null),
  ]);
  return {
    branches: branches.map((b) => ({ value: b.id, label: b.name })),
    groups: groups.map((g) => ({ value: g.id, label: g.name })),
    courses: courses.map((c) => ({ value: c.id, label: c.name })),
    smsAvailable: (count ?? 0) > 0,
    today: todayIn(ctx.center.timezone),
  };
}
