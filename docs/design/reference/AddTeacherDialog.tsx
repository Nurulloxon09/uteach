import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

const subjects = ["Bangla", "English", "Mathematics", "Chemistry", "Economics", "Physics"];

export function AddTeacherDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selectOpen, setSelectOpen] = useState(true);
  const [value, setValue] = useState<string | null>("Bangla");
  const [filter, setFilter] = useState("Bangla");

  if (!open) return null;

  const list = subjects.filter((s) => s.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button aria-label="Close dialog" onClick={onClose} className="fixed inset-0 bg-foreground/25 backdrop-blur-[2px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add New Teacher"
        className="relative z-10 w-full max-w-[460px] rounded-2xl bg-card p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">Add New Teacher</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-secondary-foreground transition-colors hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="teacher-name" className="block text-[15px] text-secondary-foreground">
              Teacher name
            </label>
            <input
              id="teacher-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Please Select"
              className="h-12 w-full rounded-xl bg-muted px-4 text-[15px] text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-[15px] text-secondary-foreground">ID No</span>
            <button
              onClick={() => setSelectOpen((v) => !v)}
              aria-expanded={selectOpen}
              className="flex h-12 w-full items-center justify-between rounded-xl bg-muted px-4 text-[15px] text-muted-foreground transition-colors hover:bg-muted/70"
            >
              <span className={cn(value && "text-foreground")}>{value ?? "Please Select"}</span>
              {selectOpen ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>

            {selectOpen && (
              <div className="rounded-xl border border-border bg-card p-3 shadow-card">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="Filter options"
                  className="h-11 w-full rounded-lg border border-border px-3 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="mt-3 h-1 w-4 rounded bg-border" />
                <ul className="mt-2 max-h-[190px] overflow-y-auto pr-1">
                  {list.map((option) => (
                    <li key={option}>
                      <button
                        onClick={() => setValue(option)}
                        className={cn(
                          "w-full rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors",
                          value === option
                            ? "bg-primary-soft font-medium text-primary"
                            : "text-secondary-foreground hover:bg-muted",
                        )}
                      >
                        {option}
                      </button>
                    </li>
                  ))}
                  {list.length === 0 && (
                    <li className="px-3 py-2.5 text-[15px] text-muted-foreground">No results</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="h-11 rounded-xl border border-border bg-card px-6 text-[15px] font-medium text-secondary-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="h-11 rounded-xl bg-primary px-7 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
