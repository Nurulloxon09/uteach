"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getMemberships, homePathFor } from "@/lib/center";
import { setCurrentCenter } from "@/lib/current-center";

/** Switch the center shown in the app. Only centers the user is an active member of are accepted. */
export async function switchCenterAction(form: FormData): Promise<void> {
  const centerId = form.get("centerId");
  const memberships = await getMemberships();
  const target = memberships.find((m) => m.centerId === centerId);
  const locale = await getLocale();
  if (!target) return redirect({ href: "/", locale });

  await setCurrentCenter(target.centerId);
  return redirect({ href: homePathFor(target.role), locale });
}
