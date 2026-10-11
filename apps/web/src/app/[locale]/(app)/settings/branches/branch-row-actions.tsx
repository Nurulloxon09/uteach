"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { RowActions, type RowAction } from "@/components/patterns";
import { ArchiveRowActions } from "../archive-button";

/** Branch row: Open, plus Archive/Restore for owners. Admins only open (read-only). */
export function BranchRowActions({
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
    href: `/settings/branches/${id}`,
  };
  return canManage ? (
    <ArchiveRowActions kind="branch" id={id} name={name} archived={archived} extra={[open]} />
  ) : (
    <RowActions actions={[open]} />
  );
}
