import { Pencil, Trash2 } from "lucide-react";

export function RowActions({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        aria-label={`Delete ${name}`}
        className="text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-[18px]" strokeWidth={1.7} />
      </button>
      <button
        aria-label={`Edit ${name}`}
        className="text-muted-foreground transition-colors hover:text-primary"
      >
        <Pencil className="size-[18px]" strokeWidth={1.7} />
      </button>
    </div>
  );
}
