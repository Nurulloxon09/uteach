"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "./segmented-control";

export type AudienceRecipients = "guardians" | "students" | "both";

/** Who a broadcast goes to (17): every list empty = everyone in the user's branches. */
export type Audience = {
  branchIds: string[];
  groupIds: string[];
  courseIds: string[];
  debtors: boolean;
  recipients: AudienceRecipients;
};

type Option = { value: string; label: string };

/** A FilterButton-sized button that opens a checkbox list (several values). */
function MultiPick({
  label,
  allLabel,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  allLabel: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => value.includes(o.value));
  const summary =
    chosen.length === 0 ? allLabel : chosen.length === 1 ? chosen[0]!.label : `${chosen.length}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid={testId}
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm text-secondary-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30",
          chosen.length ? "border-primary/50" : "border-border",
        )}
      >
        <span className="whitespace-nowrap">
          {label}:<span className="ml-1 font-semibold text-primary">{summary}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-64 overflow-y-auto p-1.5" align="start">
        <ul aria-label={label} className="space-y-0.5">
          {options.map((o) => {
            const id = `pick-${testId ?? label}-${o.value}`;
            const checked = value.includes(o.value);
            return (
              <li key={o.value}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(c) =>
                      onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))
                    }
                  />
                  <span>{o.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Choose a broadcast's audience (17): branches, groups and courses (several each; none = all), "only debtors",
 * and whether guardians, students or both get it. Controlled; the caller asks the database for the count.
 */
export function AudiencePicker({
  value,
  onChange,
  branches,
  groups,
  courses,
  labels,
}: {
  value: Audience;
  onChange: (value: Audience) => void;
  branches: Option[];
  groups: Option[];
  courses: Option[];
  labels: {
    branches: string;
    groups: string;
    courses: string;
    all: string;
    everyone: string;
    debtors: string;
    recipients: string;
    guardians: string;
    students: string;
    both: string;
  };
}) {
  const set = (patch: Partial<Audience>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4" data-testid="audience-picker">
      <div className="flex flex-wrap gap-2">
        {branches.length > 1 ? (
          <MultiPick
            testId="audience-branches"
            label={labels.branches}
            allLabel={labels.all}
            options={branches}
            value={value.branchIds}
            onChange={(branchIds) => set({ branchIds })}
          />
        ) : null}
        <MultiPick
          testId="audience-groups"
          label={labels.groups}
          allLabel={labels.all}
          options={groups}
          value={value.groupIds}
          onChange={(groupIds) => set({ groupIds })}
        />
        {courses.length > 1 ? (
          <MultiPick
            testId="audience-courses"
            label={labels.courses}
            allLabel={labels.all}
            options={courses}
            value={value.courseIds}
            onChange={(courseIds) => set({ courseIds })}
          />
        ) : null}
      </div>
      {/* Segmented, not a checkbox: a checkbox inside a form is reset (unticked) by React's form reset. */}
      <SegmentedControl
        label={labels.debtors}
        value={value.debtors ? "debtors" : "all"}
        onChange={(v) => set({ debtors: v === "debtors" })}
        testId="audience-debtors"
        options={[
          { value: "all", label: labels.everyone },
          { value: "debtors", label: labels.debtors },
        ]}
      />
      <div className="space-y-2">
        <p className="text-[15px] text-secondary-foreground">{labels.recipients}</p>
        <SegmentedControl
          label={labels.recipients}
          value={value.recipients}
          onChange={(recipients) => set({ recipients })}
          testId="audience-recipients"
          options={[
            { value: "guardians", label: labels.guardians },
            { value: "students", label: labels.students },
            { value: "both", label: labels.both },
          ]}
        />
      </div>
    </div>
  );
}
