import { expect, type Browser, type Page } from "@playwright/test";
import en from "@uteach/i18n/messages/en.json";

export { en };

/** Fixed SMS code for test phones +99899000000x (supabase/config.toml [auth.sms.test_otp]). */
export const TEST_CODE = "123456";

export type Person = { name: string; phone: string; password: string };

/** Wait until the page is loaded and idle, so typing isn't lost to a dev-mode compile/re-render. */
export async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** Fill the sign-up form (already open) and confirm the SMS code. */
export async function signUp(page: Page, person: Person) {
  await settled(page);
  await page.getByLabel(en.auth.fields.fullName).fill(person.name);
  await page.getByLabel(en.auth.fields.phone).fill(person.phone);
  await page.getByLabel(en.auth.fields.password).fill(person.password);
  await page.getByRole("button", { name: en.auth.signup.submit }).click();

  await expect(page.getByRole("heading", { name: en.auth.verify.title })).toBeVisible();
  await settled(page);
  await page.getByLabel(en.auth.fields.code).fill(TEST_CODE);
  await page.getByRole("button", { name: en.auth.verify.submit }).click();
}

export async function logIn(page: Page, phone: string, password: string) {
  await page.goto("/en/login");
  await settled(page);
  await page.getByLabel(en.auth.fields.phone).fill(phone);
  await page.getByLabel(en.auth.fields.password).fill(password);
  await page.getByRole("button", { name: en.auth.login.submit }).click();
}

/** Log out through the user chip in the top bar. */
export async function logOut(page: Page) {
  await page.getByRole("button", { name: en.nav.account }).click();
  await page.getByRole("menuitem", { name: en.nav.logout }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
}

/** Sign up a new owner and create a center with one branch; ends on /home. */
export async function createCenter(page: Page, owner: Person, center: string, branch: string) {
  await page.goto("/en/signup");
  await signUp(page, owner);
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  await settled(page);
  await page.getByLabel(en.onboarding.centerName).fill(center);
  await page.getByLabel(en.onboarding.branchName).fill(branch);
  await page.getByRole("button", { name: en.onboarding.submit }).click();
  await expect(page).toHaveURL(/\/en\/home$/);
}

/** Invite a teacher to `branch` from /staff; returns the one-time link. */
export async function inviteTeacher(page: Page, teacher: Person, branch: string): Promise<string> {
  await page.goto("/en/staff");
  await settled(page);
  await page.getByRole("button", { name: en.staff.inviteButton }).click();
  const invite = page.getByTestId("invite-dialog");
  await invite.getByLabel(en.staff.fields.name).fill(teacher.name);
  await invite.getByLabel(en.staff.fields.phone).fill(teacher.phone);
  await invite.getByLabel(en.staff.fields.role).click();
  await page.getByRole("option", { name: en.roles.teacher }).click();
  await invite.getByRole("checkbox", { name: branch }).check();
  await invite.getByRole("button", { name: en.staff.inviteSubmit }).click();
  const url = await invite.getByTestId("invite-url").inputValue();
  expect(url).toMatch(/\/en\/invite\/[0-9a-f]{48}$/);
  await invite.getByRole("button", { name: en.common.done }).click();
  await expect(invite).toBeHidden();
  return url;
}

/** In a fresh browser context, the teacher signs up from the invite link and accepts it; ends on /today. */
export async function acceptInvite(browser: Browser, inviteUrl: string, teacher: Person) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByRole("heading", { name: en.invite.title })).toBeVisible();
  await page.getByRole("link", { name: en.invite.signupToAccept }).click();
  await signUp(page, teacher);
  await expect(page).toHaveURL(/\/en\/invite\//);
  await page.getByRole("button", { name: en.invite.accept }).click();
  await expect(page).toHaveURL(/\/en\/today$/);
  await context.close();
}
