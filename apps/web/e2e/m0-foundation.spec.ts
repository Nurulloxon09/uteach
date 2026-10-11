import { expect, test } from "@playwright/test";
import { TEST_CODE, en, inviteTeacher, logIn, logOut, settled, signUp } from "./helpers";

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

test.describe.serial("M0 foundation", () => {
  test("owner sets up a center and a teacher joins by invite", async ({ page, context }) => {
    // Owner signs up and creates the center.
    await page.goto("/en/signup");
    await signUp(page, OWNER);

    await expect(page).toHaveURL(/\/en\/onboarding$/);
    await page.getByLabel(en.onboarding.centerName).fill("Bright English");
    // The time zone combobox defaults to NEXT_PUBLIC_DEFAULT_TIMEZONE (Asia/Tashkent).
    await expect(page.getByLabel(en.onboarding.timezone)).toHaveText(/Asia\/Tashkent/);
    await page.getByLabel(en.onboarding.branchName).fill("Chilonzor");
    await page.getByRole("button", { name: en.onboarding.submit }).click();
    // The rest of the wizard (M1) can wait.
    await expect(page).toHaveURL(/\/en\/onboarding\/rooms$/);
    await page.getByTestId("finish-later").click();
    await expect(page).toHaveURL(/\/en\/home$/);

    // Second branch + a room.
    await page.goto("/en/settings/branches");
    await expect(page.getByTestId("branch-row")).toHaveCount(1);
    await settled(page);
    await page.getByRole("button", { name: en.settings.branches.addButton }).click();
    const branchDialog = page.getByTestId("branch-dialog");
    await branchDialog.getByLabel(en.settings.branches.fields.name).fill("Yunusobod");
    await branchDialog.getByRole("button", { name: en.settings.branches.addSubmit }).click();
    await expect(branchDialog).toBeHidden();
    await expect(page.getByTestId("branch-row")).toHaveCount(2);

    await page.getByRole("link", { name: "Yunusobod" }).first().click();
    await page.getByRole("tab", { name: en.settings.branches.tabRooms }).click();
    await page.getByRole("button", { name: en.settings.rooms.add }).click();
    const roomDialog = page.getByTestId("room-dialog");
    await roomDialog.getByLabel(en.settings.rooms.fields.name).fill("Room 101");
    await roomDialog.getByLabel(en.settings.rooms.fields.capacity).fill("12");
    await roomDialog.getByRole("button", { name: en.settings.rooms.add }).click();
    await expect(roomDialog).toBeHidden();
    await expect(page.getByTestId("room-row")).toHaveCount(1);

    // Invite a teacher to Chilonzor.
    const inviteUrl = await inviteTeacher(page, TEACHER, "Chilonzor");
    await expect(page.getByTestId("staff-row")).toHaveCount(2);

    // The teacher opens the link in a fresh session, signs up and accepts.
    await context.clearCookies();
    await page.goto(new URL(inviteUrl).pathname);
    await expect(page.getByRole("heading", { name: en.invite.title })).toBeVisible();
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
    await logOut(page);

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
    await logOut(page);

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
    await page.getByRole("link", { name: "Yunusobod" }).first().click();
    await page.getByRole("tab", { name: en.settings.branches.tabRooms }).click();
    await page
      .getByRole("button", { name: en.common.rowArchive.replace("{name}", "Room 101") })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: en.common.archive }).click();
    await expect(
      page.getByTestId("room-row").getByText(en.common.archived, { exact: true }),
    ).toBeVisible();

    // Disable the teacher.
    await page.goto("/en/staff");
    const teacherRow = page.getByTestId("staff-row").filter({ hasText: TEACHER.name });
    await teacherRow
      .getByRole("button", { name: en.staff.rowDisable.replace("{name}", TEACHER.name) })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: en.staff.disable }).click();
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
