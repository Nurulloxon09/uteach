import { useState } from "react";
import { Check, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const rows = [
  { name: "Evelyn Harper", id: "PRE43178", marks: 1185, percent: "98%", year: 2014 },
  { name: "Diana Plenty", id: "PRE43174", marks: 1165, percent: "91%", year: 2014 },
  { name: "John Millar", id: "PRE43187", marks: 1175, percent: "92%", year: 2014 },
  { name: "Miles Esther", id: "PRE43181", marks: 1180, percent: "95%", year: 2014 },
];

const tints = ["bg-stat-blue", "bg-stat-orange", "bg-stat-green", "bg-stat-purple"];

export function StarStudents() {
  const [selected, setSelected] = useState<string[]>(["PRE43174"]);
  const allSelected = selected.length === rows.length;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-[19px] font-bold tracking-tight text-foreground">Star Students</h2>
        <button
          aria-label="More options"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      <div className="-mx-1 mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="text-[15px] text-muted-foreground">
              <th className="w-12 px-2 pb-3 font-normal">
                <Box
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
                  label="Select all students"
                />
              </th>
              <th className="px-2 pb-3 font-normal">Name</th>
              <th className="px-2 pb-3 font-normal">ID</th>
              <th className="px-2 pb-3 font-normal">Marks</th>
              <th className="px-2 pb-3 font-normal">Percent</th>
              <th className="px-2 pb-3 font-normal">Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const checked = selected.includes(r.id);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-border/70 text-[15px] transition-colors",
                    checked ? "bg-primary-soft/60" : "hover:bg-muted/60",
                  )}
                >
                  <td className="px-2 py-3.5">
                    <Box checked={checked} onChange={() => toggle(r.id)} label={`Select ${r.name}`} />
                  </td>
                  <td className="px-2 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-secondary-foreground",
                          tints[i % tints.length],
                        )}
                      >
                        {r.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                      <span className="font-medium text-foreground">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3.5 text-secondary-foreground">{r.id}</td>
                  <td className="px-2 py-3.5 text-secondary-foreground">{r.marks}</td>
                  <td className="px-2 py-3.5 text-secondary-foreground">{r.percent}</td>
                  <td className="px-2 py-3.5 text-secondary-foreground">{r.year}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Box({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "grid size-5 place-items-center rounded-md border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary/60",
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
