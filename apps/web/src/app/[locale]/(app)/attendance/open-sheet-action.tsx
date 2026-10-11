"use client";

import { ClipboardCheck } from "lucide-react";
import { RowActions } from "@/components/patterns";

/** "Open attendance" icon link for a lesson row (icons can't cross from server pages). */
export function OpenSheetAction({ href, label }: { href: string; label: string }) {
  return <RowActions actions={[{ key: "open", label, icon: ClipboardCheck, href }]} />;
}
