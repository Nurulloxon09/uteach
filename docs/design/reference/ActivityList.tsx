import { BadgeDollarSign, GraduationCap, MoreVertical, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  {
    title: "New Teacher",
    desc: "It is a long established readable..",
    time: "Just now",
    icon: UserRound,
    bg: "bg-stat-blue",
  },
  {
    title: "Fees Structure",
    desc: "It is a long established readable..",
    time: "Today",
    icon: BadgeDollarSign,
    bg: "bg-stat-orange",
  },
  {
    title: "New Course",
    desc: "It is a long established readable..",
    time: "24 Sep 2023",
    icon: GraduationCap,
    bg: "bg-stat-green",
  },
  {
    title: "New Result",
    desc: "It is a long established readable..",
    time: "18 Sep 2023",
    icon: GraduationCap,
    bg: "bg-stat-purple",
  },
];

export function ActivityList() {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-[19px] font-bold tracking-tight text-foreground">All Exam Results</h2>
        <button
          aria-label="More options"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      <ul className="mt-3">
        {items.map((it) => (
          <li
            key={it.title}
            className="flex items-center gap-3.5 border-b border-border/70 py-4 transition-colors last:border-0 hover:bg-muted/50"
          >
            <span
              className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-primary", it.bg)}
            >
              <it.icon className="size-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-foreground">{it.title}</p>
              <p className="truncate text-sm text-muted-foreground">{it.desc}</p>
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">{it.time}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
