import { PublicLayout } from "@/components/patterns";
import { publicEnv } from "@/lib/env";

export default function PublicGroupLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <PublicLayout contactTelegram={publicEnv.NEXT_PUBLIC_CONTACT_TELEGRAM}>{children}</PublicLayout>
  );
}
