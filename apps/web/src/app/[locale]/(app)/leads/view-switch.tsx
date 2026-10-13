"use client";

import { useTranslations } from "next-intl";
import { SegmentedControl } from "@/components/patterns";
import { useListParams } from "@/components/patterns/url-params";

/** Board | List, kept in the URL (`?view=list`). */
export function LeadViewSwitch({ view }: { view: "board" | "list" }) {
  const t = useTranslations("leads");
  const { setParams } = useListParams();
  return (
    <SegmentedControl
      label={t("view.label")}
      value={view}
      onChange={(v) => setParams({ view: v === "board" ? null : v, status: null })}
      options={[
        { value: "board", label: t("view.board") },
        { value: "list", label: t("view.list") },
      ]}
      testId="lead-view"
    />
  );
}
