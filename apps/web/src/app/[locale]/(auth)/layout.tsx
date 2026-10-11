import { AuthLayout } from "@/components/patterns";

export default function AuthGroupLayout({ children }: LayoutProps<"/[locale]">) {
  return <AuthLayout>{children}</AuthLayout>;
}
