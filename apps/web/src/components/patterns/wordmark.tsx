import { GraduationCap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { BRAND } from "./brand";

/**
 * Logo block from the reference sidebar: icon in a `size-9 rounded-xl bg-primary/10` square + wordmark in
 * `text-xl font-extrabold`, first letter in primary (05-ui §4, §6b).
 */
export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/30", className)}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
        <GraduationCap className="size-5" strokeWidth={2} aria-hidden />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-primary">
        {BRAND.slice(0, 1)}
        <span className="text-foreground">{BRAND.slice(1)}</span>
      </span>
    </Link>
  );
}
