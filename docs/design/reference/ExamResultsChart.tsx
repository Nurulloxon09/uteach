import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";

const data = [
  { day: "Mon", teacher: 8000, students: 34000 },
  { day: "Tue", teacher: 36000, students: 21000 },
  { day: "Wed", teacher: 62000, students: 72000 },
  { day: "Thu", teacher: 43000, students: 24000 },
  { day: "Fri", teacher: 68000, students: 46000 },
  { day: "Sat", teacher: 44000, students: 39000 },
  { day: "Sun", teacher: 76000, students: 30000 },
  { day: " ", teacher: 47000, students: 52000 },
];

const ticks = [0, 25000, 50000, 75000, 100000];
const fmt = (v: number) => (v === 0 ? "0" : `${v / 1000}k`);

export function ExamResultsChart() {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-[19px] font-bold tracking-tight text-foreground">All Exam Results</h2>
        <div className="ml-auto flex flex-wrap items-center gap-5">
          <span className="flex items-center gap-2 text-sm text-secondary-foreground">
            <span className="size-2.5 rounded-full bg-chart-teacher" /> Teacher
          </span>
          <span className="flex items-center gap-2 text-sm text-secondary-foreground">
            <span className="size-2.5 rounded-full bg-chart-student" /> Students
          </span>
          <button className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            Monthly <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="mt-6 w-full">
        <ResponsiveContainer width="100%" height={290} minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="teacherFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-teacher)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--chart-teacher)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="studentFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-student)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--chart-student)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
              dy={10}
            />
            <YAxis
              ticks={ticks}
              domain={[0, 100000]}
              tickFormatter={fmt}
              axisLine={false}
              tickLine={false}
              width={52}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="students"
              stroke="var(--chart-student)"
              strokeWidth={3}
              fill="url(#studentFill)"
            />
            <Area
              type="monotone"
              dataKey="teacher"
              stroke="var(--chart-teacher)"
              strokeWidth={3}
              fill="url(#teacherFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
