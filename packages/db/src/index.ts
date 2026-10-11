import type { Database } from "./database.types";

export type { Database, Json } from "./database.types";

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type MembershipRole = Enums<"membership_role">;
export type MembershipStatus = Enums<"membership_status">;
export type CenterStatus = Enums<"center_status">;

/** Admin permission flags (03-roles-permissions.md). Must match the check on memberships.permissions. */
export const PERMISSION_FLAGS = [
  "students",
  "leads",
  "attendance",
  "payments",
  "billing",
  "broadcasts",
  "academics",
  "adjustments",
  "discounts",
  "void",
  "refunds",
  "import",
  "staff",
  "settings",
  "cash_closing",
  "finance",
  "payroll",
  "analytics",
] as const;

export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];

/** Flags ticked by default when inviting an admin. */
export const DEFAULT_ADMIN_FLAGS: readonly PermissionFlag[] = [
  "students",
  "leads",
  "attendance",
  "payments",
  "billing",
  "broadcasts",
];

/**
 * Error codes raised by our SQL functions and triggers (`raise exception '<code>'`).
 * The web app maps them to i18n keys under `errors.db.*`.
 */
export const DB_ERROR_CODES = [
  "not_authenticated",
  "profile_missing",
  "forbidden",
  "center_read_only",
  "already_member",
  "already_invited",
  "invite_invalid",
  "invite_expired",
  "invite_phone_mismatch",
  "cannot_change_own_role",
  "use_accept_invite",
  "last_owner",
  "invalid_branch",
  "duplicate",
  "not_found",
  "invalid_teacher",
  "invalid_room",
  "rule_needs_teacher",
  "rule_not_found",
  "lesson_conflict",
  "lesson_conflict_room",
  "lesson_conflict_teacher",
  "lesson_not_scheduled",
  "invalid_duration",
  "invalid_resolution",
  "guardian_phone_taken",
  "group_closed",
  "enrollment_after_group_end",
  "discount_reason_required",
  "discount_cap",
  "enrollment_exists",
  "enrollment_ended",
  "freeze_outside_enrollment",
  "freeze_overlap",
  "invalid_dates",
  "transfer_same_group",
  "transfer_before_start",
  "use_transfer",
  "student_has_active_enrollments",
] as const;

export type DbErrorCode = (typeof DB_ERROR_CODES)[number];

export function asDbErrorCode(message: string | undefined | null): DbErrorCode | null {
  if (!message) return null;
  return (DB_ERROR_CODES as readonly string[]).includes(message) ? (message as DbErrorCode) : null;
}
