import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/** Inline form messages in the soft token style. */
const alertVariants = cva(
  "relative grid w-full gap-1 rounded-xl px-4 py-3 text-left text-[15px] has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:size-[18px]",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-accent-foreground",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-success/15 text-foreground *:[svg]:text-success",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-semibold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-[15px]", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
