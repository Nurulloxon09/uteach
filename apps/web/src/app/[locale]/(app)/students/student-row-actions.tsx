"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { RowActions, type RowAction } from "@/components/patterns";
import { ArchiveRowActions } from "../settings/archive-button";

/** Student row: Open, plus Archive/Restore for staff with `students`. */
export function StudentRowActions({
  id,
  name,
  archived,
  canManage,
}: {
  id: string;
  name: string;
  archived: boolean;
  canManage: boolean;
}) {
  const tc = useTranslations("common");
  const open: RowAction = {
    key: "open",
    label: tc("rowOpen", { name }),
    icon: ArrowRight,
    href: `/students/${id}`,
  };
  return canManage ? (
    <ArchiveRowActions kind="student" id={id} name={name} archived={archived} extra={[open]} />
  ) : (
    <RowActions actions={[open]} />
  );
}
