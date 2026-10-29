import { PERMISSION_FLAGS } from "@uteach/db";
import { AtSign, Building2, CalendarDays, Layers, Phone, ShieldCheck } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  DetailPage,
  EmptyState,
  InitialsAvatar,
  MobileRecord,
  PageHeader,
  ProfileCard,
  Section,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Link, redirect } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { isPaletteKey } from "@/lib/palette";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";
import { EditMemberButton } from "../edit-member-dialog";
import { MemberActions } from "../member-actions";

export async function generateMetadata() {
  const t = await getTranslations("staff");
  return { title: t("title") };
}

const STATUS_TONE: Record<"active" | "invited" | "disabled", ChipTone> = {
  active: "success",
  invited: "warning",
  disabled: "muted",
};

/**
 * Staff profile (M7g): contact, login (owners), branches, and permissions (admins) or the groups a teacher
 * teaches. Opened from the Staff list by the people who see the list; Edit follows `memberships_update`.
 */
export default async function StaffMemberPage({
  params,
}: PageProps<"/[locale]/staff/[membershipId]">) {
  const { membershipId } = await params;
  if (!uuidField.safeParse(membershipId).success) notFound();
  const ctx = await requireAdminContext();
  if (!ctx.can.manageStaff) return redirect({ href: "/home", locale: await getLocale() });

  const t = await getTranslations("staff");
  const tp = await getTranslations("staff.profile");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tr = await getTranslations("roles");
  const tst = await getTranslations("memberStatus");
  const tf = await getTranslations("flags");
  const tg = await getTranslations("groups.status");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: m } = await supabase
    .from("memberships")
    .select(
      "id, profile_id, display_name, role, status, branch_ids, permissions, phone, color, created_at",
    )
    .eq("id", membershipId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!m) notFound();

  const isOwner = ctx.membership.role === "owner";
  const [{ data: branches }, { data: groups }, { data: logins }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("groups")
      .select("id, name, status")
      .eq("center_id", ctx.center.id)
      .eq("teacher_membership_id", m.id)
      .is("archived_at", null)
      .order("name"),
    isOwner
      ? supabase.rpc("member_logins", { p_center_id: ctx.center.id })
      : Promise.resolve({ data: null }),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const login = (logins ?? []).find((l) => l.membership_id === m.id)?.username;
  const myBranches = new Set(
    isOwner ? (branches ?? []).map((b) => b.id) : ctx.membership.branchIds,
  );
  const canManage =
    m.profile_id !== ctx.user.id &&
    (isOwner || (m.role === "teacher" && m.branch_ids.every((id) => myBranches.has(id))));

  const branchesText =
    m.role === "owner"
      ? t("allBranches")
      : format.list(m.branch_ids.map((id) => branchName.get(id) ?? "—"));
  const edit = {
    member: {
      id: m.id,
      name: m.display_name,
      phone: m.phone,
      role: m.role,
      branchIds: m.branch_ids,
      permissions: m.permissions,
      color: isPaletteKey(m.color) ? m.color : null,
    },
    branches: (branches ?? []).filter((b) => myBranches.has(b.id)),
    flags: [...PERMISSION_FLAGS],
    canEditFlags: isOwner,
  };

  const permissionsTab = {
    value: "permissions",
    label: t("fields.permissions"),
    content: (
      <Section title={t("fields.permissions")}>
        {m.permissions.length ? (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="member-permissions">
            {PERMISSION_FLAGS.filter((f) => m.permissions.includes(f)).map((flag) => (
              <li key={flag} className="rounded-xl bg-muted p-4">
                <p className="font-medium text-foreground">{tf(`${flag}.label` as never)}</p>
                <p className="text-sm text-muted-foreground">{tf(`${flag}.hint` as never)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ShieldCheck} title={tp("noPermissions")} />
        )}
      </Section>
    ),
  };
  const groupsTab = {
    value: "groups",
    label: tp("groups"),
    content: (
      <Section title={tp("groups")}>
        <DataTable
          testId="member-group-row"
          rows={groups ?? []}
          rowKey={(g) => g.id}
          empty={<EmptyState icon={Layers} title={tp("noGroups")} />}
          columns={[
            {
              key: "name",
              header: t("fields.name"),
              cell: (g) => (
                <Link
                  href={`/groups/${g.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {g.name}
                </Link>
              ),
            },
            { key: "status", header: tc("status"), cell: (g) => tg(g.status) },
          ]}
          mobileCard={(g) => <MobileRecord title={g.name} subtitle={tg(g.status)} />}
        />
      </Section>
    ),
  };

  return (
    <>
      <PageHeader
        title={m.display_name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: t("title"), href: "/staff" },
          { label: m.display_name },
        ]}
        action={canManage ? <EditMemberButton {...edit} /> : undefined}
      />
      <DetailPage
        header={
          <ProfileCard
            avatar={<InitialsAvatar name={m.display_name} size="lg" />}
            name={m.display_name}
            subtitle={tr(m.role)}
            rows={[
              { key: "phone", icon: Phone, value: m.phone ?? tp("noPhone") },
              ...(login ? [{ key: "login", icon: AtSign, value: login }] : []),
              { key: "branches", icon: Building2, value: branchesText },
              {
                key: "joined",
                icon: CalendarDays,
                value: tp("since", {
                  date: format.dateTime(new Date(m.created_at), {
                    dateStyle: "long",
                    timeZone: ctx.center.timezone,
                  }),
                }),
              },
            ]}
            chip={
              <div className="flex flex-wrap gap-2" data-testid="profile-chips">
                <StatusChip tone={STATUS_TONE[m.status]}>{tst(m.status)}</StatusChip>
              </div>
            }
            actions={
              canManage ? (
                <MemberActions
                  membershipId={m.id}
                  name={m.display_name}
                  status={m.status}
                  canSetPassword={isOwner}
                />
              ) : undefined
            }
          />
        }
        tabs={m.role === "admin" ? [permissionsTab, groupsTab] : [groupsTab]}
      />
    </>
  );
}
