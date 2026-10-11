import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { teachers } from "@/routes/teachers.index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teachers/details")({
  head: () => ({
    meta: [
      { title: "Teachers Details - Spik School Management" },
      {
        name: "description",
        content:
          "Detailed teacher profiles for Spik with subject, class assignment, address and contact information.",
      },
      { property: "og:title", content: "Teachers Details - Spik School Management" },
      {
        property: "og:description",
        content: "Review individual teacher profiles, assignments and contact details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeacherDetailsPage,
});

function TeacherDetailsPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Teachers Details"
        crumbs={[{ label: "Home", to: "/" }, { label: "Teachers", to: "/teachers" }, { label: "Details" }]}
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {teachers.slice(0, 6).map((teacher) => (
          <article key={teacher.id} className="rounded-2xl bg-card p-6 shadow-card">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "grid size-14 place-items-center rounded-full text-base font-bold text-foreground/70",
                  teacher.tint,
                )}
              >
                {teacher.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">{teacher.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {teacher.subject} · Class {teacher.klass}
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-[15px]">
              <div className="flex items-center gap-3 text-secondary-foreground">
                <MapPin className="size-4 text-primary" strokeWidth={1.8} />
                <dd>{teacher.address}</dd>
              </div>
              <div className="flex items-center gap-3 text-secondary-foreground">
                <Phone className="size-4 text-primary" strokeWidth={1.8} />
                <dd>{teacher.phone}</dd>
              </div>
              <div className="flex items-center gap-3 text-secondary-foreground">
                <Mail className="size-4 text-primary" strokeWidth={1.8} />
                <dd>{teacher.name.split(" ")[0]?.toLowerCase()}@spik.edu</dd>
              </div>
            </dl>

            <p className="mt-5 inline-flex rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary">
              ID {teacher.code}
            </p>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
