import { useTranslations } from "next-intl";
import { StatusChip } from "@/components/patterns";
import type { MarkState } from "@/lib/attendance";

/** The attendance state of a lesson as a chip (Today, the Attendance list). */
export function MarkChip({ state }: { state: MarkState }) {
  const t = useTranslations("attendance.chip");
  const tl = useTranslations("lessons");
  switch (state.kind) {
    case "cancelled":
      return <StatusChip tone="muted">{tl("status.cancelled")}</StatusChip>;
    case "upcoming":
      return <StatusChip tone="muted">{t("upcoming")}</StatusChip>;
    case "toMark":
      return <StatusChip tone="warning">{t("toMark")}</StatusChip>;
    case "notMarked":
      return <StatusChip tone="destructive">{t("notMarked")}</StatusChip>;
    case "marked":
      return (
        <span className="flex flex-wrap gap-1.5">
          <StatusChip tone="success">
            {t("marked", { marked: state.marked, expected: state.expected })}
          </StatusChip>
          {state.absent > 0 ? (
            <StatusChip tone="destructive">{t("absent", { count: state.absent })}</StatusChip>
          ) : null}
        </span>
      );
  }
}
