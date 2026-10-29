/**
 * Login names (10 "Auth", M7f). People log in with a login + password; Supabase Auth stores the account under a
 * hidden email built from the login. This is the only place that builds it (the `m7f_username_login` trigger reads
 * the login back from the same address).
 */
export const LOGIN_EMAIL_DOMAIN = "login.uteach.invalid";

/** 3–32 characters: a–z, 0–9, `.` and `_`, starting with a letter or digit (the `profiles_username_check`). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,31}$/;

/** Trims and lower-cases what someone typed; `null` when it isn't a valid login. */
export function normalizeUsername(value: string): string | null {
  const username = value.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}

/** The hidden Auth email for a login (already normalized). */
export function loginEmail(username: string): string {
  return `${username}@${LOGIN_EMAIL_DOMAIN}`;
}
