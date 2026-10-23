/**
 * The public teacher demo (10-platform-onboarding, "Teacher demo"). `pnpm demo:seed` marks its accounts with
 * app_metadata.demo = true; only the service role can set app_metadata, so a visitor can't take the flag off.
 */
export function isDemoAccount(
  user: { app_metadata?: Record<string, unknown> } | null | undefined,
): boolean {
  return user?.app_metadata?.demo === true;
}
