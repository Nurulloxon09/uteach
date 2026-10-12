"use client";

import { FileSpreadsheet } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";

/** "Export" on the Debtors page: downloads the rows the current filters show (paging aside) as .xlsx. */
export function DebtorsExportLink({ label }: { label: string }) {
  const locale = useLocale();
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete("page");
  params.delete("size");
  const query = params.toString();
  return (
    <a
      href={`/${locale}/debtors/export${query ? `?${query}` : ""}`}
      className={buttonVariants({ variant: "outline", size: "lg" })}
      data-testid="debtors-export"
      download
    >
      <FileSpreadsheet />
      {label}
    </a>
  );
}
