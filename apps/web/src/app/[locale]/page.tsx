import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getCenterContext, homePathFor } from "@/lib/center";

/** "/" sends people where they belong: login, onboarding, home or today. */
export default async function IndexPage() {
  await requireUser();
  const ctx = await getCenterContext();
  return redirect({ href: homePathFor(ctx.membership.role), locale: await getLocale() });
}
