import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

/** /admin opens on Centers. */
export default async function AdminIndexPage() {
  return redirect({ href: "/admin/centers", locale: await getLocale() });
}
