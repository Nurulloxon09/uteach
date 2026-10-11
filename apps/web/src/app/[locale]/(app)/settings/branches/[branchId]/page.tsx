import { DoorOpen, Globe, MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DetailPage,
  InitialsAvatar,
  PageHeader,
  ProfileCard,
  StatusChip,
} from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { ArchiveButton } from "../../archive-button";
import { EditBranchForm } from "../branch-form";
import { RoomsPanel, type Room } from "./rooms";

export async function generateMetadata() {
  const t = await getTranslations("settings.branches");
  return { title: t("title") };
}

/** Branch detail: ProfileCard + tabs (Details | Rooms). */
export default async function BranchPage({
  params,
}: PageProps<"/[locale]/settings/branches/[branchId]">) {
  const { branchId } = await params;
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.branches");
  const tn = await getTranslations("nav");
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
  const activeRooms = (rooms ?? []).filter((r) => r.archived_at === null).length;
  const canEditRooms = ctx.can.manageRooms(branch.id) && !archived;

  return (
    <>
      <PageHeader
        title={branch.name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: t("title"), href: "/settings/branches" },
          { label: branch.name },
        ]}
      />
      <DetailPage
        header={
          <ProfileCard
            avatar={<InitialsAvatar name={branch.name} size="lg" />}
            name={branch.name}
            subtitle={t("roomsCount", { count: activeRooms })}
            rows={[
              ...(branch.address ? [{ key: "address", icon: MapPin, value: branch.address }] : []),
              ...(branch.phone ? [{ key: "phone", icon: Phone, value: branch.phone }] : []),
              { key: "timezone", icon: Globe, value: branch.timezone.replaceAll("_", " ") },
              { key: "rooms", icon: DoorOpen, value: t("roomsCount", { count: activeRooms }) },
            ]}
            chip={
              archived ? (
                <StatusChip tone="muted">{tc("archived")}</StatusChip>
              ) : (
                <StatusChip tone="success">{t("statusActive")}</StatusChip>
              )
            }
          />
        }
        tabs={[
          {
            value: "details",
            label: t("tabDetails"),
            content: (
              <div className="space-y-5">
                <EditBranchForm branch={branch} editable={ctx.can.manageBranches && !archived} />
                {ctx.can.manageBranches ? (
                  <div className="border-t border-border/70 pt-5">
                    <ArchiveButton kind="branch" id={branch.id} archived={archived} />
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            value: "rooms",
            label: t("tabRooms"),
            content: (
              <RoomsPanel
                branchId={branch.id}
                rooms={(rooms ?? []) as Room[]}
                editable={canEditRooms}
              />
            ),
          },
        ]}
      />
    </>
  );
}
