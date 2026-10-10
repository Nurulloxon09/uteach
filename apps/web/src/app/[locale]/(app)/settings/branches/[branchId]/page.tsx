import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { TimezoneSelect } from "@/components/timezone-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { ArchiveButton } from "../../archive-button";
import { BranchForm } from "../branch-form";
import { RoomForm, RoomRow } from "./rooms";

export async function generateMetadata() {
  const t = await getTranslations("settings.branches");
  return { title: t("title") };
}

export default async function BranchPage({
  params,
}: PageProps<"/[locale]/settings/branches/[branchId]">) {
  const { branchId } = await params;
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.branches");
  const tr = await getTranslations("settings.rooms");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const [{ data: branch }, { data: rooms }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, address, phone, timezone, archived_at")
      .eq("id", branchId)
      .eq("center_id", ctx.center.id)
      .maybeSingle(),
    supabase
      .from("rooms")
      .select("id, name, capacity, archived_at")
      .eq("branch_id", branchId)
      .order("archived_at", { nullsFirst: true })
      .order("created_at"),
  ]);
  if (!branch) notFound();

  const archived = branch.archived_at !== null;
  const canEditRooms = ctx.can.manageRooms(branch.id) && !archived;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/settings/branches"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{branch.name}</h1>
        {archived ? <Badge variant="secondary">{tc("archived")}</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("detailsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <BranchForm
              branch={branch}
              editable={ctx.can.manageBranches && !archived}
              timezoneSelect={
                <TimezoneSelect
                  id="field-timezone"
                  name="timezone"
                  defaultValue={branch.timezone}
                />
              }
            />
            {ctx.can.manageBranches ? (
              <ArchiveButton kind="branch" id={branch.id} archived={archived} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tr("title")}</CardTitle>
            <CardDescription>{canEditRooms ? tr("hint") : tr("readOnlyHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(rooms ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("empty")}</p>
            ) : (
              (rooms ?? []).map((room) => (
                <RoomRow key={room.id} room={room} editable={canEditRooms} />
              ))
            )}
            {canEditRooms ? <RoomForm branchId={branch.id} /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
