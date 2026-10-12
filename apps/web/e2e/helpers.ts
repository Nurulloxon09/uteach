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

/**
 * Sign up a new owner and create a center with one branch (wizard steps 1–2), then leave the rest of the
 * wizard for later ("Finish later"); ends on /home.
 */
export async function createCenter(page: Page, owner: Person, center: string, branch: string) {
  await page.goto("/en/signup");
  await signUp(page, owner);
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  await settled(page);
  await page.getByLabel(en.onboarding.centerName).fill(center);
  await page.getByLabel(en.onboarding.branchName).fill(branch);
  await page.getByRole("button", { name: en.onboarding.submit }).click();
  await expect(page).toHaveURL(/\/en\/onboarding\/rooms$/);
  await page.getByTestId("finish-later").click();
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

export async function addRoom(page: Page, branch: string, room: string) {
  await page.goto("/en/settings/branches");
  await settled(page);
  await page.getByRole("link", { name: branch }).first().click();
  await page.getByRole("tab", { name: en.settings.branches.tabRooms }).click();
  await page.getByRole("button", { name: en.settings.rooms.add }).click();
  const dialog = page.getByTestId("room-dialog");
  await dialog.getByLabel(en.settings.rooms.fields.name).fill(room);
  await dialog.getByRole("button", { name: en.settings.rooms.add }).click();
  await expect(dialog).toBeHidden();
}

/** Opens "New group" and fills it; `times` = how many weekly times to add (Mon, Wed, Fri…). */
export async function createGroup(
  page: Page,
  opts: {
    room: string;
    teacher: string;
    times: number;
    firstStart?: string;
    name?: string;
    days?: string[];
    course?: string;
    /** yyyy-mm-dd; the group price takes effect from it. */
    startDate?: string;
  },
) {
  await page.goto("/en/groups");
  await settled(page);
  await page.getByRole("button", { name: en.groups.addButton }).click();
  const dialog = page.getByTestId("group-dialog");
  if (opts.course) {
    await dialog.getByLabel(en.groups.fields.course).click();
    await page.getByRole("option", { name: opts.course, exact: true }).click();
  }
  await dialog.getByLabel(en.groups.fields.teacher).click();
  await page.getByRole("option", { name: opts.teacher }).click();
  await dialog.getByLabel(en.groups.fields.room).click();
  await page.getByRole("option", { name: opts.room }).click();
  for (let i = 0; i < opts.times; i++)
    await dialog.getByRole("button", { name: en.slots.add }).click();
  for (const [i, day] of (opts.days ?? []).entries()) {
    await dialog.getByLabel(en.slots.weekday).nth(i).click();
    await page.getByRole("option", { name: day, exact: true }).click();
  }
  if (opts.firstStart) {
    for (let i = 0; i < opts.times; i++)
      await dialog.getByLabel(en.slots.start).nth(i).fill(opts.firstStart);
  }
  if (opts.name) await dialog.getByLabel(en.groups.fields.name).fill(opts.name);
  if (opts.startDate) await dialog.getByLabel(en.groups.fields.startDate).fill(opts.startDate);
  await dialog.getByRole("button", { name: en.groups.addSubmit }).click();
  await expect(dialog).toBeHidden();
}
