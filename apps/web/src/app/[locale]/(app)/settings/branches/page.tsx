import { getTranslations } from "next-intl/server";
import { TimezoneSelect } from "@/components/timezone-select";
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
import { Link } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { BranchForm } from "./branch-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.branches");
  return { title: t("title") };
}

export default async function BranchesPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.branches");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const [{ data: branches }, { data: rooms }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, address, timezone, archived_at")
      .eq("center_id", ctx.center.id)
      .order("archived_at", { nullsFirst: true })
      .order("created_at"),
    supabase
      .from("rooms")
      .select("branch_id")
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
  ]);

  const roomCount = new Map<string, number>();
  for (const r of rooms ?? []) roomCount.set(r.branch_id, (roomCount.get(r.branch_id) ?? 0) + 1);

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.address")}</TableHead>
                <TableHead>{t("columns.timezone")}</TableHead>
                <TableHead>{t("columns.rooms")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(branches ?? []).map((b) => (
                <TableRow key={b.id} data-testid="branch-row">
                  <TableCell>
                    <Link
                      href={`/settings/branches/${b.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {b.name}
                    </Link>
                    {b.archived_at ? (
                      <Badge variant="secondary" className="ml-2">
                        {tc("archived")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.address}</TableCell>
                  <TableCell className="text-sm">{b.timezone}</TableCell>
                  <TableCell>{roomCount.get(b.id) ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {ctx.can.manageBranches ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t("addTitle")}</CardTitle>
            <CardDescription>{t("addHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BranchForm
              timezoneSelect={
                <TimezoneSelect
                  id="field-timezone"
                  name="timezone"
                  defaultValue={ctx.center.timezone}
                />
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
