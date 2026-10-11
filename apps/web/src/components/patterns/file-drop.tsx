"use client";

import { FileSpreadsheet } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A dashed drop zone for one file (Excel import): drop a file or press the zone to pick one. The whole zone
 * is a labelled button, so it works with the keyboard; `accept` filters the picker.
 */
export function FileDrop({
  label,
  hint,
  accept,
  disabled,
  onFile,
  testId,
}: {
  label: string;
  hint?: string;
  accept?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  testId?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      }}
      className={cn(
        "rounded-2xl border-2 border-dashed border-border bg-muted/40 transition-colors",
        over && "border-primary bg-primary-soft/60",
        disabled && "opacity-60",
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center outline-none focus-within:ring-2 focus-within:ring-primary/30",
          disabled && "cursor-not-allowed",
        )}
      >
        <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
          <FileSpreadsheet className="size-6" />
        </span>
        <span className="text-[15px] font-semibold text-foreground">{label}</span>
        {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          data-testid={testId}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
