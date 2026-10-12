import "server-only";
import type { CenterStatus, MembershipRole, PermissionFlag } from "@uteach/db";
import { isLocale, type Locale } from "@uteach/i18n";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Which of the user's centers the app is showing. Switching it never grants access: RLS decides. */
export const CURRENT_CENTER_COOKIE = "uteach_center";

export type MembershipSummary = {
  membershipId: string;
  centerId: string;
  centerName: string;
  role: MembershipRole;
};

export type CenterContext = {
  user: CurrentUser;
  /** UI language of this request. */
  locale: Locale;
  memberships: MembershipSummary[];
  center: {
    id: string;
    name: string;
    timezone: string;
    defaultLocale: string;
    status: CenterStatus;
    trialEndsAt: string | null;
    countryCode: string;
    currency: string;
  };
  membership: {
    id: string;
    role: MembershipRole;
    permissions: PermissionFlag[];
    branchIds: string[];
  };
  can: {
    editCenter: boolean;
    manageBranches: boolean;
    manageStaff: boolean;
    manageRooms: (branchId: string) => boolean;
    seeAdminPages: boolean;
    /** Courses, levels, groups, schedule rules, lessons, holidays (03). */
    academics: boolean;
    /** Prices, charges, balances. */
    billing: boolean;
    /** Students, guardians, enrollments. */
    students: boolean;
    /** Mark and edit any attendance in their branches, at any time (14). */
    attendance: boolean;
    /** Record payments and print receipts (15). */
    payments: boolean;
    /** Void payments, charges and adjustments. */
    void: boolean;
    /** Waive, write off, corrections. */
    adjustments: boolean;
    discounts: boolean;
    import: boolean;
    /** Is this branch in the user's scope (owners: every branch). */
    inBranch: (branchId: string) => boolean;
  };
};

/** Active memberships of the signed-in user, with center names. */
export const getMemberships = cache(async (): Promise<MembershipSummary[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, center_id, role, centers ( name )")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at");

  return (data ?? []).map((m) => ({
    membershipId: m.id,
    centerId: m.center_id,
    centerName: m.centers?.name ?? "",
    role: m.role,
  }));
});

/**
 * Everything a staff page needs about "where am I and what may I do".
 * Redirects to onboarding when the user has no center yet.
 */
export const getCenterContext = cache(async (): Promise<CenterContext> => {
  const user = await requireUser();
  const memberships = await getMemberships();
  const locale = await getLocale();

  if (memberships.length === 0) {
    return redirect({ href: "/onboarding", locale });
  }

  const cookieStore = await cookies();
  const wanted = cookieStore.get(CURRENT_CENTER_COOKIE)?.value;
  const current = memberships.find((m) => m.centerId === wanted) ?? memberships[0]!;

  const supabase = await createClient();
  const [{ data: center }, { data: membership }] = await Promise.all([
    supabase
      .from("centers")
      .select("id, name, timezone, default_locale, status, trial_ends_at, country_code, currency")
      .eq("id", current.centerId)
      .single(),
    supabase
      .from("memberships")
      .select("id, role, permissions, branch_ids")
      .eq("id", current.membershipId)
      .single(),
  ]);

  if (!center || !membership) {
    return redirect({ href: "/onboarding", locale });
  }

  const role = membership.role;
  const permissions = membership.permissions as PermissionFlag[];
  const isOwner = role === "owner";
  const has = (flag: PermissionFlag) => isOwner || (role === "admin" && permissions.includes(flag));
  const inBranch = (branchId: string) => isOwner || membership.branch_ids.includes(branchId);

  return {
    user,
    locale: isLocale(locale) ? locale : "uz",
    memberships,
    center: {
      id: center.id,
      name: center.name,
      timezone: center.timezone,
      defaultLocale: center.default_locale,
      status: center.status,
      trialEndsAt: center.trial_ends_at,
      countryCode: center.country_code,
      currency: center.currency,
    },
    membership: {
      id: membership.id,
      role,
      permissions,
      branchIds: membership.branch_ids,
    },
    can: {
      editCenter: isOwner,
      manageBranches: isOwner,
      manageStaff: has("staff"),
      manageRooms: (branchId) => has("settings") && inBranch(branchId),
      seeAdminPages: role === "owner" || role === "admin",
      academics: has("academics"),
      billing: has("billing"),
      students: has("students"),
      attendance: has("attendance"),
      payments: has("payments"),
      void: has("void"),
      adjustments: has("adjustments"),
      discounts: has("discounts"),
      import: has("import"),
      inBranch,
    },
  };
});

/** For pages only owners/admins may open. Teachers go to their Today page. */
export async function requireAdminContext(): Promise<CenterContext> {
  const ctx = await getCenterContext();
  if (!ctx.can.seeAdminPages) {
    const locale = await getLocale();
    return redirect({ href: "/today", locale });
  }
  return ctx;
}

export function homePathFor(role: MembershipRole): "/home" | "/today" {
  return role === "teacher" ? "/today" : "/home";
}
