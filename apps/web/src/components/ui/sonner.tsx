"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";

/** Toasts as small cards (`rounded-xl shadow-card`). Light mode only in MVP. */
const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" />,
        info: <InfoIcon className="size-[18px] text-primary" />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" />,
        error: <OctagonXIcon className="size-[18px] text-destructive" />,
        loading: <Loader2Icon className="size-[18px] animate-spin text-primary" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground shadow-card",
          title: "font-medium",
          description: "text-sm text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
