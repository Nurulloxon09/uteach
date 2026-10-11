"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useListParams } from "./url-params";

/** Table search from the reference `TableChrome` (`h-11 rounded-xl border`, primary icon); writes `?q=`. */
export function TableSearch({
  placeholder,
  label,
  param = "q",
  className,
}: {
  placeholder: string;
  /** Screen-reader label (translated). */
  label: string;
  param?: string;
  className?: string;
}) {
  const { searchParams, setParams } = useListParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <label className={cn("relative block w-full sm:w-[300px]", className)}>
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setParams({ [param]: next.trim() || null }), 300);
        }}
        className="h-11 w-full rounded-xl border border-border bg-card pr-11 pl-4 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
      />
      <Search className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-primary" />
    </label>
  );
}
