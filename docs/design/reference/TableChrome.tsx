import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function TableSearch({ placeholder = "Search by  name or roll" }: { placeholder?: string }) {
  return (
    <label className="relative block w-full sm:w-[300px]">
      <span className="sr-only">Search table</span>
      <input
        type="search"
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-border bg-card pl-4 pr-11 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-primary/30"
      />
      <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-primary" />
    </label>
  );
}

export function DateRangeButton({ label = "Last 30 days" }: { label?: string }) {
  return (
    <button className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm text-secondary-foreground transition-colors hover:bg-muted">
      <Calendar className="size-4 text-muted-foreground" strokeWidth={1.8} />
      <span className="flex-1 whitespace-nowrap">{label}</span>
      <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  );
}

export function CheckboxCell({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "grid size-[22px] place-items-center rounded-[7px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary/60",
      )}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.2}>
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function TablePagination({
  page,
  onPageChange,
  pages = [1, 2, 3, 4, 5],
  lastPage = 100,
}: {
  page: number;
  onPageChange: (p: number) => void;
  pages?: number[];
  lastPage?: number;
}) {
  const btn =
    "grid size-9 place-items-center rounded-lg text-sm font-medium transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
      <button
        aria-label="Previous page"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className={cn(btn, "text-secondary-foreground hover:bg-muted")}
      >
        <ChevronLeft className="size-4" />
      </button>

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            btn,
            p === page
              ? "bg-primary text-primary-foreground"
              : "text-secondary-foreground hover:bg-muted",
          )}
        >
          {p}
        </button>
      ))}

      <span className="px-2 text-lg leading-none tracking-widest text-muted-foreground">•••</span>

      <button
        onClick={() => onPageChange(lastPage)}
        className={cn(btn, "w-11 text-secondary-foreground hover:bg-muted")}
      >
        {lastPage}
      </button>

      <button
        aria-label="Next page"
        onClick={() => onPageChange(page + 1)}
        className={cn(btn, "text-secondary-foreground hover:bg-muted")}
      >
        <ChevronRight className="size-4" />
      </button>

      <button className="ml-2 flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-secondary-foreground transition-colors hover:bg-muted">
        10 / page
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}
