import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StatCards } from "@/components/dashboard/StatCards";
import { ExamResultsChart } from "@/components/dashboard/ExamResultsChart";
import { StudentsDonut } from "@/components/dashboard/StudentsDonut";
import { StarStudents } from "@/components/dashboard/StarStudents";
import { ActivityList } from "@/components/dashboard/ActivityList";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spik Admin Dashboard - School Management Overview" },
      {
        name: "description",
        content:
          "Spik school admin dashboard with student, teacher and parent stats, exam result charts, star students and activity updates.",
      },
      { property: "og:title", content: "Spik Admin Dashboard - School Management Overview" },
      {
        property: "og:description",
        content:
          "Track students, teachers, earnings and exam results in one clean school management dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <DashboardShell>
      <StatCards />

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <ExamResultsChart />
        <StudentsDonut />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <StarStudents />
        <ActivityList />
      </div>
    </DashboardShell>
  );

}
