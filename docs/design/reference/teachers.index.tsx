import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { AddTeacherDialog } from "@/components/dashboard/AddTeacherDialog";
import {
  CheckboxCell,
  DateRangeButton,
  TablePagination,
  TableSearch,
} from "@/components/dashboard/TableChrome";
import { RowActions } from "@/components/dashboard/RowActions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teachers/")({
  head: () => ({
    meta: [
      { title: "All Teachers - Spik School Management" },
      {
        name: "description",
        content:
          "Teacher directory for Spik: names, addresses, subjects, classes and phone numbers with quick add and edit actions.",
      },
      { property: "og:title", content: "All Teachers - Spik School Management" },
      {
        property: "og:description",
        content: "Manage every teacher record, subject assignment and contact detail in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeachersPage,
});

export type Teacher = {
  id: number;
  name: string;
  address: string;
  code: string;
  subject: string;
  klass: string;
  phone: string;
  tint: string;
};

export const teachers: Teacher[] = [
  { id: 1, name: "Floyd Miles", address: "TA-107 Newyork", code: "#0021", subject: "Mathematics", klass: "01", phone: "+123 9988568", tint: "bg-stat-purple" },
  { id: 2, name: "Jane Cooper", address: "Australia, Sydney", code: "#0011", subject: "English", klass: "02", phone: "+123 7988566", tint: "bg-stat-blue" },
  { id: 3, name: "Jenny Wilson", address: "TA-107 Newyork", code: "#0031", subject: "Physics", klass: "03", phone: "+123 7988567", tint: "bg-stat-green" },
  { id: 4, name: "Annette Black", address: "Australia, Sydney", code: "#0022", subject: "Literature", klass: "04", phone: "+123 5988565", tint: "bg-stat-orange" },
  { id: 5, name: "Arlene McCoy", address: "TA-107 Newyork", code: "#0013", subject: "Mathematics", klass: "04", phone: "+123 4948564", tint: "bg-stat-blue" },
  { id: 6, name: "Robert Fox", address: "TA-107 Newyork", code: "#0014", subject: "English", klass: "03", phone: "+123 3983563", tint: "bg-stat-purple" },
  { id: 7, name: "Arlene McCoy", address: "Australia, Sydney", code: "#0018", subject: "Physics", klass: "01", phone: "+123 4988555", tint: "bg-stat-green" },
  { id: 8, name: "Albert Flores", address: "TA-107 Newyork", code: "#0017", subject: "Mathematics", klass: "01", phone: "+123 6988566", tint: "bg-stat-orange" },
  { id: 9, name: "Devon Lane", address: "Australia, Sydney", code: "#0019", subject: "Literature", klass: "02", phone: "+123 9988568", tint: "bg-stat-blue" },
];

function TeachersPage() {
  const [selected, setSelected] = useState<number[]>([3, 7]);
  const [page, setPage] = useState(2);
  const [dialogOpen, setDialogOpen] = useState(false);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allChecked = selected.length === teachers.length;

  return (
    <DashboardShell>
      <PageHeader
        title="All Teachers"
        crumbs={[{ label: "Home", to: "/" }, { label: "Teachers" }]}
        action={
          <button
            onClick={() => setDialogOpen(true)}
            className="flex h-12 items-center gap-2 rounded-xl border border-primary bg-card px-5 text-[15px] font-semibold text-primary transition-colors hover:bg-primary-soft"
          >
            <Plus className="size-[18px]" strokeWidth={2.4} />
            Add Teacher
          </button>
        }
      />

      <section className="rounded-2xl bg-card p-4 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-foreground">Teachers Information</h2>
          <div className="flex flex-wrap items-center gap-3">
            <TableSearch />
            <DateRangeButton />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead>
              <tr className="bg-primary-soft/60 text-[15px] text-secondary-foreground">
                <th className="w-14 rounded-l-xl py-4 pl-5">
                  <CheckboxCell
                    checked={allChecked}
                    onChange={() => setSelected(allChecked ? [] : teachers.map((t) => t.id))}
                    label="Select all teachers"
                  />
                </th>
                <th className="py-4 font-medium">Teachers Name</th>
                <th className="py-4 font-medium">Address</th>
                <th className="py-4 font-medium">Id</th>
                <th className="py-4 font-medium">Subject</th>
                <th className="py-4 font-medium">Class</th>
                <th className="py-4 font-medium">Phone</th>
                <th className="rounded-r-xl py-4 pr-5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => {
                const isSelected = selected.includes(teacher.id);
                return (
                  <tr
                    key={teacher.id}
                    className={cn(
                      "border-b border-border/70 text-[15px] transition-colors last:border-0",
                      isSelected ? "bg-card shadow-card" : "hover:bg-muted/60",
                    )}
                  >
                    <td className="py-4 pl-5">
                      <CheckboxCell
                        checked={isSelected}
                        onChange={() => toggle(teacher.id)}
                        label={`Select ${teacher.name}`}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold text-foreground/70",
                            teacher.tint,
                          )}
                        >
                          {teacher.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")}
                        </span>
                        <span className="font-medium text-foreground">{teacher.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-secondary-foreground">{teacher.address}</td>
                    <td className="py-3 text-secondary-foreground">{teacher.code}</td>
                    <td className="py-3 text-secondary-foreground">{teacher.subject}</td>
                    <td className="py-3 text-secondary-foreground">{teacher.klass}</td>
                    <td className="py-3 text-secondary-foreground">{teacher.phone}</td>
                    <td className="py-3 pr-5">
                      <RowActions name={teacher.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <TablePagination page={page} onPageChange={setPage} />

      <AddTeacherDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </DashboardShell>
  );
}
