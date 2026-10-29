import {
  DEFAULT_ADMIN_FLAGS,
  PERMISSION_FLAGS,
  type MembershipRole,
  type MembershipStatus,
} from "@uteach/db";
import { CircleDot, SearchX, UserCog, Users } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  FilterButton,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  PageHeader,
  Pagination,
  Section,
  StatusChip,
  TableSearch,
  pageCountFor,
  parseListParams,
  type ChipTone,
} from "@/components/patterns";
import { Link, redirect } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { isPaletteKey } from "@/lib/palette";
import { ilikePattern } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { InviteDialog } from "./invite-dialog";
import { MemberActions } from "./member-actions";

export async function generateMetadata() {
  const t = await getTranslations("staff");
  return { title: t("title") };
}

const STATUS_TONE: Record<MembershipStatus, ChipTone> = {
  active: "success",
  invited: "warning",
  disabled: "muted",
};
const ROLES: MembershipRole[] = ["owner", "admin", "teacher"];
const STATUSES: MembershipStatus[] = ["active", "invited", "disabled"];

type Member = {
  id: string;
  profile_id: string | null;
  display_name: string;
  role: MembershipRole;
  status: MembershipStatus;
  branch_ids: string[];
  permissions: string[];
  invited_phone: string | null;
  phone: string | null;
  color: string | null;
};

/** Staff: a ListPage (05-ui §5) with search, role/status filters, pagination and the invite dialog. */
export default async function StaffPage({ searchParams }: PageProps<"/[locale]/staff">) {
  const ctx = await requireAdminContext();
  if (!ctx.can.manageStaff) return redirect({ href: "/home", locale: await getLocale() });

  const t = await getTranslations("staff");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const tStates = await getTranslations("states");
  const tr = await getTranslations("roles");
  const tst = await getTranslations("memberStatus");
  const format = await getFormatter();
  const list = parseListParams(await searchParams, ["role", "status"] as const);
  const supabase = await createClient();

  let query = supabase
    .from("memberships")
    .select(
      "id, profile_id, display_name, role, status, branch_ids, permissions, invited_phone, phone, color",
      {
        count: "exact",
      },
    )
    .eq("center_id", ctx.center.id);
  const role = ROLES.find((r) => r === list.filters.role);
  const status = STATUSES.find((s) => s === list.filters.status);
  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);
  const pattern = ilikePattern(list.q);
  if (pattern) query = query.or(`display_name.ilike.${pattern},phone.ilike.${pattern}`);

  const [{ data, count }, { data: branches }] = await Promise.all([
    query.order("created_at").range(list.from, list.to),
    supabase
      .from("branches")
      .select("id, name")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .order("created_at"),
  ]);
  const members = (data ?? []) as Member[];
  // Owners see each person's login (M7f), to tell someone who forgot it.
  const { data: logins } =
    ctx.membership.role === "owner"
      ? await supabase.rpc("member_logins", { p_center_id: ctx.center.id })
      : { data: null };
  const loginOf = new Map((logins ?? []).map((l) => [l.membership_id, l.username]));
  const subOf = (m: Member) => loginOf.get(m.id) ?? undefined;
  const profileLink = (m: Member) => (
    <Link
      href={`/staff/${m.id}`}
      className="underline-offset-4 hover:text-primary hover:underline"
      data-testid="staff-profile-link"
    >
      {m.display_name}
    </Link>
  );
  const filtered = Boolean(role || status || pattern);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const isOwner = ctx.membership.role === "owner";
  const myBranches = new Set(
    isOwner ? (branches ?? []).map((b) => b.id) : ctx.membership.branchIds,
  );
  const scopeBranches = (branches ?? []).filter((b) => myBranches.has(b.id));
  const canManage = (m: Member) =>
    m.profile_id !== ctx.user.id &&
    (isOwner || (m.role === "teacher" && m.branch_ids.every((id) => myBranches.has(id))));

  const branchesOf = (m: Member) =>
    m.role === "owner"
      ? t("allBranches")
      : format.list(m.branch_ids.map((id) => branchName.get(id) ?? "—"));
  const roleOf = (m: Member) => (
    <>
      {tr(m.role)}
      {m.role === "admin" && m.permissions.length ? (
        <span className="block text-xs text-muted-foreground">
          {t("flagCount", { count: m.permissions.length })}
        </span>
      ) : null}
    </>
  );
  const statusOf = (m: Member) => (
    <StatusChip tone={STATUS_TONE[m.status]}>{tst(m.status)}</StatusChip>
  );
  const actionsOf = (m: Member) =>
    canManage(m) ? (
      <MemberActions
        membershipId={m.id}
        name={m.display_name}
        status={m.status}
        canSetPassword={isOwner}
        edit={{
          member: {
            id: m.id,
            name: m.display_name,
            phone: m.phone,
            role: m.role,
            branchIds: m.branch_ids,
            permissions: m.permissions,
            color: isPaletteKey(m.color) ? m.color : null,
          },
          branches: scopeBranches,
          flags: [...PERMISSION_FLAGS],
          canEditFlags: isOwner,
        }}
      />
    ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
        action={
          <InviteDialog
            roles={isOwner ? ["teacher", "admin"] : ["teacher"]}
            branches={scopeBranches}
            flags={[...PERMISSION_FLAGS]}
            defaultFlags={[...DEFAULT_ADMIN_FLAGS]}
          />
        }
      />

      <Section
        title={t("listTitle")}
        tools={
          <>
            <TableSearch placeholder={t("searchPlaceholder")} label={t("searchLabel")} />
            <FilterButton
              icon={<UserCog strokeWidth={1.8} />}
              label={t("filterRole")}
              param="role"
              allLabel={tc("all")}
              options={ROLES.map((r) => ({ value: r, label: tr(r) }))}
            />
            <FilterButton
              icon={<CircleDot strokeWidth={1.8} />}
              label={t("filterStatus")}
              param="status"
              allLabel={tc("all")}
              options={STATUSES.map((s) => ({ value: s, label: tst(s) }))}
            />
          </>
        }
      >
        <DataTable
          testId="staff-row"
          rows={members}
          rowKey={(m) => m.id}
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title={tStates("noResults")}
                hint={tStates("noResultsHint")}
              />
            ) : (
              <EmptyState icon={Users} title={t("emptyTitle")} hint={t("emptyHint")} />
            )
          }
          columns={[
            {
              key: "name",
              header: t("columns.name"),
              cell: (m) => (
                <NameCell
                  avatar={<InitialsAvatar name={m.display_name} />}
                  name={profileLink(m)}
                  sub={subOf(m)}
                />
              ),
            },
            { key: "phone", header: t("fields.phone"), cell: (m) => m.phone ?? "—" },
            { key: "role", header: t("columns.role"), cell: roleOf },
            {
              key: "branches",
              header: t("columns.branches"),
              cell: branchesOf,
              className: "max-w-[260px]",
            },
            { key: "status", header: t("columns.status"), cell: statusOf },
            { key: "actions", header: t("columns.actions"), cell: actionsOf, className: "w-24" },
          ]}
          mobileCard={(m) => (
            <MobileRecord
              avatar={<InitialsAvatar name={m.display_name} />}
              title={profileLink(m)}
              subtitle={m.phone ?? tr(m.role)}
              status={statusOf(m)}
              fields={[
                { label: t("columns.role"), value: roleOf(m) },
                { label: t("columns.branches"), value: branchesOf(m) },
              ]}
              actions={actionsOf(m)}
            />
          )}
        />
      </Section>

      <Pagination
        page={list.page}
        pageCount={pageCountFor(count ?? 0, list.size)}
        pageSize={list.size}
      />
    </>
  );
}
