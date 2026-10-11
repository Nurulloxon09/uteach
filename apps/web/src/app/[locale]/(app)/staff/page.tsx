import { DEFAULT_ADMIN_FLAGS, PERMISSION_FLAGS } from "@uteach/db";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { redirect } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { MemberActions } from "./member-actions";

export async function generateMetadata() {
  const t = await getTranslations("staff");
  return { title: t("title") };
}

export default async function StaffPage() {
  const ctx = await requireAdminContext();
  if (!ctx.can.manageStaff) return redirect({ href: "/home", locale: await getLocale() });

  const t = await getTranslations("staff");
  const tr = await getTranslations("roles");
  const tst = await getTranslations("memberStatus");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: members }, { data: branches }] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, profile_id, display_name, role, status, branch_ids, permissions, invited_phone, invite_expires_at",
      )
      .eq("center_id", ctx.center.id)
      .order("created_at"),
    supabase
      .from("branches")
      .select("id, name")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null)
      .order("created_at"),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const isOwner = ctx.membership.role === "owner";
  const myBranches = new Set(
    isOwner ? (branches ?? []).map((b) => b.id) : ctx.membership.branchIds,
  );
  const scopeBranches = (branches ?? []).filter((b) => myBranches.has(b.id));
  const canManage = (m: { role: string; branch_ids: string[]; profile_id: string | null }) =>
    m.profile_id !== ctx.user.id &&
    (isOwner || (m.role === "teacher" && m.branch_ids.every((id) => myBranches.has(id))));

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("inviteTitle")}</CardTitle>
          <CardDescription>{t("inviteDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm
            roles={isOwner ? ["teacher", "admin"] : ["teacher"]}
            branches={scopeBranches}
            flags={[...PERMISSION_FLAGS]}
            defaultFlags={[...DEFAULT_ADMIN_FLAGS]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.role")}</TableHead>
                <TableHead>{t("columns.branches")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).map((m) => (
                <TableRow key={m.id} data-testid="staff-row">
                  <TableCell>
                    <div className="font-medium">{m.display_name}</div>
                    {m.status === "invited" && m.invited_phone ? (
                      <div className="text-xs text-muted-foreground">{m.invited_phone}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {tr(m.role)}
                    {m.role === "admin" && m.permissions.length ? (
                      <div className="text-xs text-muted-foreground">
                        {t("flagCount", { count: m.permissions.length })}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.role === "owner"
                      ? t("allBranches")
                      : format.list(m.branch_ids.map((id) => branchName.get(id) ?? "—"))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>
                      {tst(m.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage(m) ? <MemberActions membershipId={m.id} status={m.status} /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
