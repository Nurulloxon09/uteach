import { expect, test, type Page } from "@playwright/test";
import en from "@uteach/i18n/messages/en.json";

/**
 * M0 E2E (30-milestones): sign up → create center → add branch and room → invite a teacher →
 * teacher accepts → teacher sees the empty "Today" page; then log in / log out / reset password,
 * archiving, and disabling a member.
 * Selectors use the English catalog, so copy changes don't break the test.
 * Needs a fresh database: `pnpm e2e` from the repo root resets it first.
 */
const OWNER = { name: "Olim Owner", phone: "+998990000001", password: "owner-pass-1" };
const TEACHER = { name: "Tamara Teacher", phone: "+998990000002", password: "teach-pass-1" };
const NEW_OWNER_PASSWORD = "owner-pass-2";
const TEST_CODE = "123456"; // supabase/config.toml [auth.sms.test_otp]

/** Wait until the page is loaded and idle, so typing isn't lost to a dev-mode compile/re-render. */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
}

async function signUp(page: Page, person: typeof OWNER) {
  await settled(page);
  await page.getByLabel(en.auth.fields.fullName).fill(person.name);
  await page.getByLabel(en.auth.fields.phone).fill(person.phone);
  await page.getByLabel(en.auth.fields.password).fill(person.password);
  await page.getByRole("button", { name: en.auth.signup.submit }).click();

  await expect(page.getByText(en.auth.verify.title, { exact: true })).toBeVisible();
  await settled(page);
  await page.getByLabel(en.auth.fields.code).fill(TEST_CODE);
  await page.getByRole("button", { name: en.auth.verify.submit }).click();
}

async function logIn(page: Page, phone: string, password: string) {
  await page.goto("/en/login");
  await settled(page);
  await page.getByLabel(en.auth.fields.phone).fill(phone);
  await page.getByLabel(en.auth.fields.password).fill(password);
  await page.getByRole("button", { name: en.auth.login.submit }).click();
}

async function logOut(page: Page, name: string) {
  await page.getByRole("button", { name }).click();
  await page.getByRole("menuitem", { name: en.nav.logout }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
}

test.describe.serial("M0 foundation", () => {
  test("owner sets up a center and a teacher joins by invite", async ({ page, context }) => {
    // Owner signs up and creates the center.
    await page.goto("/en/signup");
    await signUp(page, OWNER);

    await expect(page).toHaveURL(/\/en\/onboarding$/);
    await page.getByLabel(en.onboarding.centerName).fill("Bright English");
    await page.getByLabel(en.onboarding.timezone).selectOption("Asia/Tashkent");
    await page.getByLabel(en.onboarding.branchName).fill("Chilonzor");
    await page.getByRole("button", { name: en.onboarding.submit }).click();
    await expect(page).toHaveURL(/\/en\/home$/);

    // Second branch + a room.
    await page.goto("/en/settings/branches");
    await expect(page.getByTestId("branch-row")).toHaveCount(1);
    await page.getByLabel(en.settings.branches.fields.name).fill("Yunusobod");
    await page.getByRole("button", { name: en.settings.branches.addSubmit }).click();
    await expect(page.getByTestId("branch-row")).toHaveCount(2);

    await page.getByRole("link", { name: "Yunusobod" }).click();
    await page.locator("#new-room-name").fill("Room 101");
    await page.locator("#new-room-capacity").fill("12");
    await page.getByRole("button", { name: en.settings.rooms.add }).click();
    await expect(page.getByTestId("room-row")).toHaveCount(1);

    // Invite a teacher to Chilonzor.
    await page.goto("/en/staff");
    await page.getByLabel(en.staff.fields.name).fill(TEACHER.name);
    await page.getByLabel(en.staff.fields.phone).fill(TEACHER.phone);
    await page.getByLabel(en.staff.fields.role).selectOption("teacher");
    await page.getByRole("checkbox", { name: "Chilonzor" }).check();
    await page.getByRole("button", { name: en.staff.inviteSubmit }).click();
    const inviteUrl = await page.getByTestId("invite-url").inputValue();
    expect(inviteUrl).toMatch(/\/en\/invite\/[0-9a-f]{48}$/);
    await expect(page.getByTestId("staff-row")).toHaveCount(2);

    // The teacher opens the link in a fresh session, signs up and accepts.
    await context.clearCookies();
    await page.goto(new URL(inviteUrl).pathname);
    await expect(page.getByText(en.invite.title, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: en.invite.signupToAccept }).click();
    await signUp(page, TEACHER);

    await expect(page).toHaveURL(/\/en\/invite\//);
    await page.getByRole("button", { name: en.invite.accept }).click();

    await expect(page).toHaveURL(/\/en\/today$/);
    await expect(page.getByTestId("today-title")).toHaveText(en.today.title);
    await expect(page.getByText(en.today.emptyTitle, { exact: true })).toBeVisible();
    // Teachers have no admin navigation.
    await expect(page.getByRole("link", { name: en.nav.staff })).toHaveCount(0);
  });

  test("owner logs out, logs back in and resets the password", async ({ page }) => {
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await logOut(page, OWNER.name);

    // Forgot password: SMS code, then a new password.
    await page.getByRole("link", { name: en.auth.login.forgot }).click();
    await expect(page).toHaveURL(/\/en\/forgot-password$/);
    await settled(page);
    await page.getByLabel(en.auth.fields.phone).fill(OWNER.phone);
    await page.getByRole("button", { name: en.auth.forgot.submit }).click();
    await expect(page).toHaveURL(/\/en\/verify$/);
    await settled(page);
    await page.getByLabel(en.auth.fields.code).fill(TEST_CODE);
    await page.getByRole("button", { name: en.auth.verify.submit }).click();
    await expect(page).toHaveURL(/\/en\/reset-password$/);
    await settled(page);
    await page.getByLabel(en.auth.fields.newPassword, { exact: true }).fill(NEW_OWNER_PASSWORD);
    await page.getByLabel(en.auth.fields.confirmPassword).fill(NEW_OWNER_PASSWORD);
    await page.getByRole("button", { name: en.auth.reset.submit }).click();
    await expect(page).toHaveURL(/\/en\/home$/);
    await logOut(page, OWNER.name);

    // The old password no longer works; the new one does.
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page.getByText(en.errors.auth.invalidCredentials, { exact: true })).toBeVisible();
    await logIn(page, OWNER.phone, NEW_OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/en\/home$/);
  });

  test("owner archives a room and disables the teacher, who loses access", async ({
    page,
    browser,
  }) => {
    await logIn(page, OWNER.phone, NEW_OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/en\/home$/);

    // Archive the room (with the confirm dialog).
    await page.goto("/en/settings/branches");
    await page.getByRole("link", { name: "Yunusobod" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("room-row").getByRole("button", { name: en.common.archive }).click();
    await expect(
      page.getByTestId("room-row").getByText(en.common.archived, { exact: true }),
    ).toBeVisible();

    // Disable the teacher.
    await page.goto("/en/staff");
    const teacherRow = page.getByTestId("staff-row").filter({ hasText: TEACHER.name });
    await teacherRow.getByRole("button", { name: en.staff.disable }).click();
    await expect(teacherRow.getByText(en.memberStatus.disabled, { exact: true })).toBeVisible();

    // The teacher can still log in, but has no center any more.
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await logIn(teacherPage, TEACHER.phone, TEACHER.password);
    await expect(teacherPage).toHaveURL(/\/en\/onboarding$/);
    await teacherPage.goto("/en/today");
    await expect(teacherPage).toHaveURL(/\/en\/onboarding$/);
    await teacherContext.close();
  });
});
