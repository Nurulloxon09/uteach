import { Clock, Layers, Tag, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DetailPage,
  InitialsAvatar,
  PageHeader,
  ProfileCard,
  StatusChip,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { loadCoursePrices } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { formatMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { minorToInput } from "@/lib/validation";
import { EditCourseDialog } from "../course-dialog";
import { LevelsPanel } from "./levels";

export async function generateMetadata() {
  const t = await getTranslations("courses");
  return { title: t("title") };
}

/** Course page: ProfileCard + Levels tab; Edit in the page header. */
export default async function CoursePage({
  params,
}: PageProps<"/[locale]/settings/courses/[courseId]">) {
  const { courseId } = await params;
  const ctx = await requireAdminContext();
  const t = await getTranslations("courses");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const [{ data: course }, { data: levels }, prices] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, kind, default_lesson_minutes, description, archived_at")
      .eq("id", courseId)
      .eq("center_id", ctx.center.id)
      .maybeSingle(),
    supabase
      .from("levels")
      .select("id, name, next_level_id")
      .eq("course_id", courseId)
      .is("archived_at", null)
      .order("sort_order"),
    loadCoursePrices(ctx),
  ]);
  if (!course) notFound();

  const editable = ctx.can.academics && course.archived_at === null;
  const price = prices[course.id];
  const levelList = (levels ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    nextLevelId: l.next_level_id,
  }));

  return (
    <>
      <PageHeader
        title={course.name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: t("title"), href: "/settings/courses" },
          { label: course.name },
        ]}
        action={
          editable ? (
            <EditCourseDialog
              course={{
                id: course.id,
                name: course.name,
                kind: course.kind,
                defaultLessonMinutes: course.default_lesson_minutes,
                description: course.description,
                defaultPrice: minorToInput(price),
              }}
              showPrice={ctx.can.billing}
              trigger={
                <Button variant="outline-primary" size="lg">
                  {tc("edit")}
                </Button>
              }
            />
          ) : undefined
        }
      />
      <DetailPage
        header={
          <ProfileCard
            avatar={<InitialsAvatar name={course.name} size="lg" />}
            name={course.name}
            subtitle={course.description ?? undefined}
            rows={[
              { key: "kind", icon: Tag, value: t(`kinds.${course.kind as "language"}`) },
              {
                key: "minutes",
                icon: Clock,
                value: course.default_lesson_minutes
                  ? t("minutesValue", { count: course.default_lesson_minutes })
                  : "—",
              },
              { key: "levels", icon: Layers, value: t("levelsCount", { count: levelList.length }) },
              ...(ctx.can.billing && price
                ? [
                    {
                      key: "price",
                      icon: Wallet,
                      value: formatMinor(price, ctx.center.currency, ctx.locale),
                    },
                  ]
                : []),
            ]}
            chip={
              course.archived_at ? (
                <StatusChip tone="muted">{tc("archived")}</StatusChip>
              ) : (
                <StatusChip tone="success">{tc("active")}</StatusChip>
              )
            }
          />
        }
        tabs={[
          {
            value: "levels",
            label: t("tabLevels"),
            content: <LevelsPanel courseId={course.id} levels={levelList} editable={editable} />,
          },
        ]}
      />
    </>
  );
}
