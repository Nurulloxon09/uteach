"use client";

import { CalendarClock, UserRound, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { EmptyState, FieldError, FormDialog, SelectField, StatusChip } from "@/components/patterns";
import { cn } from "@/lib/utils";
import { scheduleTrialAction } from "../actions";

export type TrialLesson = {
  id: string;
  groupName: string;
  courseId: string;
  when: string;
  teacherName: string;
  count: number;
  capacity: number | null;
};

const ALL = "__all__";

/**
 * Trial picker (11): upcoming lessons (3 weeks) of the user's groups, filtered by course (the lead's
 * interested course first), with time, teacher and how full the group is. Booking moves the lead to
 * "Trial scheduled" and puts them on that lesson's attendance sheet.
 */
export function TrialDialog({
  leadId,
  leadName,
  lessons,
  courses,
  defaultCourseId,
  open,
  onOpenChange,
  trigger,
}: {
  leadId: string;
  leadName: string;
  lessons: TrialLesson[];
  courses: { id: string; name: string }[];
  defaultCourseId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  const t = useTranslations("leads.trial");
  const [course, setCourse] = useState(
    defaultCourseId && lessons.some((l) => l.courseId === defaultCourseId) ? defaultCourseId : ALL,
  );
  const shown = course === ALL ? lessons : lessons.filter((l) => l.courseId === course);
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name: leadName })}
      description={t("hint")}
      action={scheduleTrialAction}
      submitLabel={t("submit")}
      successToast={t("done")}
      testId="trial-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="leadId" value={leadId} />
          {courses.length > 1 ? (
            <SelectField
              name="courseFilter"
              label={t("course")}
              state={null}
              value={course}
              onValueChange={setCourse}
              options={[
                { value: ALL, label: t("allCourses") },
                ...courses.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          ) : null}
          {shown.length === 0 ? (
            <EmptyState icon={CalendarClock} title={t("empty")} hint={t("emptyHint")} />
          ) : (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-[15px] text-secondary-foreground">{t("lesson")}</legend>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {shown.map((l) => {
                  const full = l.capacity !== null && l.count >= l.capacity;
                  return (
                    <label
                      key={l.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors",
                        "has-[:checked]:border-primary has-[:checked]:bg-primary-soft/60 hover:bg-muted/60",
                      )}
                      data-testid="trial-lesson"
                    >
                      <input
                        type="radio"
                        name="lessonId"
                        value={l.id}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block text-[15px] font-semibold text-foreground">
                          {l.groupName}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarClock className="size-3.5 text-primary" aria-hidden />
                            {l.when}
                          </span>
                          <span className="flex items-center gap-1">
                            <UserRound className="size-3.5 text-primary" aria-hidden />
                            {l.teacherName}
                          </span>
                          <span className="flex items-center gap-1">
                            <UsersRound className="size-3.5 text-primary" aria-hidden />
                            {l.capacity === null
                              ? t("students", { count: l.count })
                              : t("seats", { count: l.count, capacity: l.capacity })}
                          </span>
                        </span>
                      </span>
                      {full ? <StatusChip tone="warning">{t("full")}</StatusChip> : null}
                    </label>
                  );
                })}
              </div>
              <FieldError name="lessonId" state={state} />
            </fieldset>
          )}
        </>
      )}
    </FormDialog>
  );
}
