"use client";

import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { FilterButton, SegmentedControl } from "@/components/patterns";
import { useListParams } from "@/components/patterns/url-params";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Day navigation, "one day / not marked" and the branch filter of the Attendance page (state in the URL). */
export function AttendanceToolbar({
  view,
  prevDate,
  nextDate,
  today,
  branches,
}: {
  view: "day" | "unmarked";
  prevDate: string;
  nextDate: string;
  today: string;
  branches: { id: string; name: string }[];
}) {
  const t = useTranslations("attendance.list");
  const { hrefWith, setParams } = useListParams();

  return (
    <>
      {view === "day" ? (
        <div className="flex items-center gap-1">
          <Link
            href={hrefWith({ date: prevDate })}
            aria-label={t("previousDay")}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronLeft />
          </Link>
          <Link href={hrefWith({ date: today })} className={buttonVariants({ variant: "outline" })}>
            {t("today")}
          </Link>
          <Link
            href={hrefWith({ date: nextDate })}
            aria-label={t("nextDay")}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronRight />
          </Link>
        </div>
      ) : null}
      <SegmentedControl
        label={t("viewLabel")}
        value={view}
        options={[
          { value: "day", label: t("viewDay") },
          { value: "unmarked", label: t("viewUnmarked") },
        ]}
        onChange={(v) => setParams({ view: v === "day" ? null : v })}
        testId="attendance-view"
      />
      {branches.length > 1 ? (
        <FilterButton
          icon={<Building2 />}
          label={t("branch")}
          param="branch"
          allLabel={t("allBranches")}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : null}
    </>
  );
}
