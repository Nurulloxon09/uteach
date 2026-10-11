"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionState } from "@/lib/actions";
import { FieldError } from "./fields";

export type WeeklySlot = {
  id?: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  roomId?: string | null;
  teacherMembershipId?: string | null;
};

type Option = { value: string; label: string };

const DEFAULT_SLOT: WeeklySlot = { weekday: 1, startTime: "18:00", durationMinutes: 90 };
const GROUP_DEFAULT = "__group__";

/**
 * Weekly time slots of a group (13-schedule rules): weekday, start time and length, optionally a room or
 * teacher other than the group's. Submits the list as JSON in a hidden input named `name`.
 */
export function WeeklySlotsField({
  name,
  label,
  state,
  defaultValue = [],
  onChange,
  dayLabels,
  rooms,
  teachers,
  defaultDuration = 90,
}: {
  name: string;
  label: string;
  state: ActionState;
  defaultValue?: WeeklySlot[];
  onChange?: (slots: WeeklySlot[]) => void;
  /** Full weekday names, keys 1 (Monday) … 7. */
  dayLabels: Record<number, string>;
  rooms?: Option[];
  teachers?: Option[];
  defaultDuration?: number;
}) {
  const t = useTranslations("slots");
  const [slots, setSlots] = useState<WeeklySlot[]>(defaultValue);

  const update = (next: WeeklySlot[]) => {
    setSlots(next);
    onChange?.(next);
  };
  const patch = (index: number, change: Partial<WeeklySlot>) =>
    update(slots.map((s, i) => (i === index ? { ...s, ...change } : s)));

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-[15px] text-secondary-foreground">{label}</legend>
      <input type="hidden" name={name} value={JSON.stringify(slots)} />
      {slots.map((slot, i) => {
        const n = i + 1;
        return (
          <div
            key={slot.id ?? `new-${i}`}
            className="space-y-3 rounded-xl border border-border/70 p-3"
            data-testid="weekly-slot"
          >
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${name}-${i}-day`} className="text-sm">
                  {t("weekday", { n })}
                </Label>
                <Select
                  value={String(slot.weekday)}
                  onValueChange={(v) => patch(i, { weekday: Number(v) })}
                >
                  <SelectTrigger id={`${name}-${i}-day`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {dayLabels[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${name}-${i}-time`} className="text-sm">
                  {t("start", { n })}
                </Label>
                <Input
                  id={`${name}-${i}-time`}
                  type="time"
                  step={300}
                  value={slot.startTime.slice(0, 5)}
                  onChange={(e) => patch(i, { startTime: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-28 space-y-1.5">
                <Label htmlFor={`${name}-${i}-length`} className="text-sm">
                  {t("minutes", { n })}
                </Label>
                <Input
                  id={`${name}-${i}-length`}
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={480}
                  step={5}
                  value={slot.durationMinutes}
                  onChange={(e) => patch(i, { durationMinutes: Number(e.target.value) })}
                />
              </div>
              {rooms && rooms.length > 0 ? (
                <OverrideSelect
                  id={`${name}-${i}-room`}
                  label={t("room", { n })}
                  groupDefault={t("groupDefault")}
                  options={rooms}
                  value={slot.roomId ?? null}
                  onChange={(roomId) => patch(i, { roomId })}
                />
              ) : (
                <div className="flex-1" />
              )}
              <Button
                type="button"
                variant="ghost-round"
                size="icon"
                aria-label={t("remove", { n })}
                onClick={() => update(slots.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            {teachers && teachers.length > 0 ? (
              <OverrideSelect
                id={`${name}-${i}-teacher`}
                label={t("teacher", { n })}
                groupDefault={t("groupDefault")}
                options={teachers}
                value={slot.teacherMembershipId ?? null}
                onChange={(teacherMembershipId) => patch(i, { teacherMembershipId })}
              />
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          update([
            ...slots,
            {
              ...DEFAULT_SLOT,
              durationMinutes: defaultDuration,
              weekday: Math.min(7, (slots.at(-1)?.weekday ?? -1) + 2) || 1,
              startTime: slots.at(-1)?.startTime ?? DEFAULT_SLOT.startTime,
            },
          ])
        }
      >
        <Plus />
        {t("add")}
      </Button>
      <FieldError name={name} state={state} />
    </fieldset>
  );
}

function OverrideSelect({
  id,
  label,
  groupDefault,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  groupDefault: string;
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Select
        value={value ?? GROUP_DEFAULT}
        onValueChange={(v) => onChange(v === GROUP_DEFAULT ? null : v)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GROUP_DEFAULT}>{groupDefault}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
