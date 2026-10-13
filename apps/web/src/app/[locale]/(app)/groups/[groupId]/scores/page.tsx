import { todayIn } from "@uteach/core";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/patterns";
import { getCenterContext } from "@/lib/center";
import { isLocalDate } from "@/lib/dates";
import { defaultExamType, loadExamTypes } from "@/lib/exams";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";
import { ScoreEntry } from "./score-entry";

export async function generateMetadata() {
  const t = await getTranslations("exams");
  return { title: t("enter.button") };
}

/**
 * "Enter scores" for one group (16): exam type, kind and day in the URL (`?exam=&kind=&date=`), the roster as a
 * keyboard grid prefilled with what's saved for that choice. Teachers of the group and admins with
 * `academics` save; the database checks every value again.
 */
export default async function EnterScoresPage({
  params,
  searchParams,
}: PageProps<"/[locale]/groups/[groupId]/scores">) {
  const { groupId } = await params;
  const sp = await searchParams;
  if (!uuidField.safeParse(groupId).success) notFound();
  const ctx = await getCenterContext();
  const t = await getTranslations("exams");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, branch_id, courses ( exam_type_id )")
    .eq("id", groupId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!group) notFound();

  const { data: branch } = await supabase
    .from("branches")
    .select("timezone")
    .eq("id", group.branch_id)
    .maybeSingle();
  const isStaff = ctx.can.seeAdminPages;
  const types = (await loadExamTypes(ctx)).filter((x) => !x.archived);
  const fallback = defaultExamType(types, group.courses?.exam_type_id);
  const type = types.find((x) => x.id === sp.exam) ?? fallback;
  const kind = sp.kind === "diagnostic" ? "diagnostic" : "mock";
  const today = todayIn(branch?.timezone ?? ctx.center.timezone);
  const date =
    typeof sp.date === "string" && isLocalDate(sp.date) && sp.date <= today ? sp.date : today;

  // Roster: staff read enrollments; teachers get names from group_roster() (03).
  let roster: { id: string; name: string }[];
  if (isStaff) {
    const { data } = await supabase
      .from("enrollments")
      .select("student_id, students ( full_name )")
      .eq("group_id", group.id)
      .neq("status", "ended");
    roster = (data ?? []).map((e) => ({ id: e.student_id, name: e.students?.full_name ?? "—" }));
  } else {
    const { data } = await supabase.rpc("group_roster", { p_group_id: group.id });
    roster = (data ?? []).map((e) => ({ id: e.student_id, name: e.full_name }));
  }
  roster = [...new Map(roster.map((r) => [r.id, r])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const { data: saved } = type
    ? await supabase
        .from("exam_results")
        .select("student_id, section_scores, updated_at")
        .eq("group_id", group.id)
        .eq("exam_type_id", type.id)
        .eq("kind", kind)
        .eq("taken_on", date)
    : { data: [] };
  const savedScores = Object.fromEntries(
    (saved ?? []).map((r) => [r.student_id, (r.section_scores ?? {}) as Record<string, number>]),
  );
  const version = [type?.id, kind, date, ...(saved ?? []).map((r) => r.updated_at)].join("|");

  return (
    <>
      <PageHeader
        title={t("enter.title", { group: group.name })}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: isStaff ? "/home" : "/today" },
          { label: isStaff ? tn("groups") : tn("myGroups"), href: "/groups" },
          { label: group.name, href: `/groups/${group.id}?tab=scores` },
          { label: t("enter.button") },
        ]}
      />
      {type ? (
        <ScoreEntry
          key={version}
          groupId={group.id}
          types={types.map((x) => ({
            id: x.id,
            name: x.name,
            sections: x.sections,
            totalRule: x.totalRule,
          }))}
          examTypeId={type.id}
          kind={kind}
          date={date}
          today={today}
          rows={roster}
          saved={savedScores}
          hasSaved={(saved ?? []).length > 0}
        />
      ) : (
        <EmptyState title={t("types.emptyTitle")} />
      )}
    </>
  );
}
