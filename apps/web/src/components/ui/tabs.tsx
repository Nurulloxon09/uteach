"use client";

import * as React from "react";
import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";

/** Underline tabs: active tab in primary with a 2 px primary underline (05-ui §5, DetailPage). */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex w-full gap-6 overflow-x-auto border-b border-border/70", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px shrink-0 border-b-2 border-transparent px-1 pt-1 pb-3 text-[15px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 data-active:border-primary data-active:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content data-slot="tabs-content" className={cn("mt-5 outline-none", className)} {...props} />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
