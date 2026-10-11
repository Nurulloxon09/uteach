import { GraduationCap, UserRound, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const stats = [
  { label: "Students", value: "15.00K", bg: "bg-stat-purple", icon: GraduationCap },
  { label: "Teachers", value: "2.00K", bg: "bg-stat-blue", icon: UserRound },
  { label: "Parents", value: "5.6K", bg: "bg-stat-orange", icon: Users },
  { label: "Earnings", value: "$19.3K", bg: "bg-stat-green", icon: Wallet },
];

export function StatCards() {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <h1 className="text-[22px] font-bold tracking-tight text-foreground">Admin Dashboard</h1>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={cn(
              "flex items-start justify-between gap-3 rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5",
              s.bg,
            )}
          >
            <div>
              <p className="text-[15px] font-medium text-secondary-foreground/80">{s.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{s.value}</p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card/60 text-primary">
              <s.icon className="size-5" strokeWidth={1.9} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
