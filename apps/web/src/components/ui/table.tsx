import * as React from "react";
import { cn } from "cn";

/**
 * The reference "Teachers Information" table: header row `bg-primary-soft/60` with rounded ends, `py-4 font-medium`;
 * rows `border-b border-border/70 hover:bg-muted/60`, `text-[15px]`. No fixed min-width: phones get cards instead.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full border-collapse text-left text-[15px]", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-0 [&_tr]:bg-primary-soft/60 [&_tr]:hover:bg-primary-soft/60", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border/70 transition-colors hover:bg-muted/60 data-[state=selected]:bg-card data-[state=selected]:shadow-card",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "py-4 pr-4 text-left align-middle font-medium whitespace-nowrap text-secondary-foreground first:rounded-l-xl first:pl-5 last:rounded-r-xl last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("py-3 pr-4 align-middle text-secondary-foreground first:pl-5 last:pr-5", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
