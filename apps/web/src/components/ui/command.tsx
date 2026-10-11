"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * cmdk restyled like the reference select panel: bordered filter input, `rounded-lg px-3 py-2.5` options,
 * keyboard highlight in muted, the chosen option in `bg-primary-soft text-primary` (set by the caller).
 */
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("flex w-full flex-col overflow-hidden bg-card text-foreground", className)}
      {...props}
    />
  );
}

function CommandDialog({
  title,
  description,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Dialog {...props}>
      <DialogContent showCloseButton={false} className={cn("top-[12vh] max-w-[520px] p-3 sm:top-[12vh]", className)}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  withIcon = false,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & { withIcon?: boolean }) {
  return (
    <div data-slot="command-input-wrapper" className="relative">
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30",
          withIcon && "pr-10",
          className,
        )}
        {...props}
      />
      {withIcon ? (
        <SearchIcon className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-primary" />
      ) : null}
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("mt-2 max-h-[190px] overflow-x-hidden overflow-y-auto pr-1 outline-none", className)}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-3 py-2.5 text-[15px] text-muted-foreground", className)}
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "flex w-full cursor-default items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[15px] text-secondary-foreground outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:size-[18px] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList };
