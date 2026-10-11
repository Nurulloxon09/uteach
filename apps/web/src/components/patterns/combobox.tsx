"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string };

/**
 * The reference dialog's searchable select: trigger like an input, panel with a filter input and options;
 * the chosen option is `bg-primary-soft text-primary`. Submits through a hidden input named `name`.
 */
export function Combobox({
  id,
  name,
  options,
  defaultValue,
  value: controlled,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  invalid,
}: {
  id?: string;
  name?: string;
  options: ComboboxOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ?? internal;
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            aria-expanded={open}
            data-invalid={invalid ? "true" : undefined}
            aria-describedby={invalid && id ? `${id}-error` : undefined}
            className="flex h-12 w-full items-center justify-between gap-2 rounded-xl bg-muted px-4 text-left text-[15px] outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 data-[invalid=true]:ring-2 data-[invalid=true]:ring-destructive/30"
          >
            <span
              className={cn("truncate", selected ? "text-foreground" : "text-muted-foreground")}
            >
              {selected?.label ?? placeholder}
            </span>
            {open ? (
              <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64">
          <Command>
            <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {options.map((o) => {
                const isSelected = o.value === value;
                return (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => {
                      if (controlled === undefined) setInternal(o.value);
                      onValueChange?.(o.value);
                      setOpen(false);
                    }}
                    aria-selected={isSelected}
                    className={cn(
                      isSelected &&
                        "bg-primary-soft font-medium text-primary data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.hint ? (
                      <span className="ml-auto shrink-0 text-sm text-muted-foreground">
                        {o.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </>
  );
}
