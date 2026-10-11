import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

/**
 * Buttons from the reference (05-ui §5): primary `h-11 rounded-xl px-6 font-semibold`, outline on a card,
 * the outlined-primary page action, and round ghost icon buttons.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[15px] font-medium outline-none transition-colors select-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: "bg-primary font-semibold text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-card text-secondary-foreground hover:bg-muted",
        "outline-primary":
          "border border-primary bg-card font-semibold text-primary hover:bg-primary-soft",
        ghost: "text-secondary-foreground hover:bg-muted hover:text-foreground",
        "ghost-round": "rounded-full bg-muted/80 text-secondary-foreground hover:bg-muted",
        destructive: "bg-destructive font-semibold text-destructive-foreground hover:opacity-90",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 rounded-lg px-3.5 text-sm",
        lg: "h-12 px-5",
        icon: "size-10",
        "icon-sm": "size-9 rounded-lg",
        inline: "h-auto p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
