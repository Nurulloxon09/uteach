import { MoreVertical } from "lucide-react";

const male = 9800;
const female = 5200;
const total = male + female;

function Ring() {
  const r = 78;
  const c = 2 * Math.PI * r;
  const malePct = male / total;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--primary-soft)" strokeWidth="26" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="var(--chart-teacher)"
          strokeWidth="26"
          strokeLinecap="round"
          strokeDasharray={`${c * malePct} ${c}`}
        />
        <circle
          cx="100"
          cy="100"
          r={r - 22}
          fill="none"
          stroke="var(--chart-female)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * (r - 22) * (female / total)} ${2 * Math.PI * (r - 22)}`}
          transform="rotate(120 100 100)"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="text-[15px] text-muted-foreground">Total</p>
        <p className="text-3xl font-bold tracking-tight text-foreground">{total}</p>
      </div>
    </div>
  );
}

export function StudentsDonut() {
  return (
    <section className="flex flex-col rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-[19px] font-bold tracking-tight text-foreground">Students</h2>
        <button
          aria-label="More options"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 items-center py-6">
        <Ring />
      </div>

      <div className="flex items-center justify-center gap-8">
        <span className="flex items-center gap-2 text-[15px] text-secondary-foreground">
          <span className="size-3 rounded-full bg-chart-teacher" /> Male
        </span>
        <span className="flex items-center gap-2 text-[15px] text-secondary-foreground">
          <span className="size-3 rounded-full bg-chart-female" /> Female
        </span>
      </div>
    </section>
  );
}
