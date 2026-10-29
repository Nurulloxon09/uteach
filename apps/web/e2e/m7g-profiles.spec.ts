import { expect, test } from "@playwright/test";
import { acceptInvite, createCenter, en, inviteTeacher, logIn, settled } from "./helpers";

/**
 * M7g E2E (30-milestones M7g plan): the owner opens a teacher's profile from the Staff list and changes the
 * phone there; the teacher changes their own name on My profile.
 */
const OWNER = {
  name: "Feruza Owner",
  login: "feruza.owner",
  phone: "+998990000021",
  password: "owner-pass-21",
};
const TEACHER = {
  name: "Rustam Teacher",
  login: "rustam.teacher",
  phone: "+998990000022",
  password: "teach-pass-22",
};
const NEW_PHONE = "+998935550022";

test.describe.serial("M7g · staff profile and my profile", () => {
  test("the owner edits a teacher's phone on the teacher's profile", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, "Profile Academy", "Sergeli");
    const inviteUrl = await inviteTeacher(page, TEACHER, "Sergeli");
    await acceptInvite(browser, inviteUrl, TEACHER);

    await page.goto("/en/staff");
    await settled(page);
    const row = page.getByTestId("staff-row").filter({ hasText: TEACHER.name });
    await expect(row).toContainText(TEACHER.login);
    await row.getByTestId("staff-profile-link").click();
    await expect(page).toHaveURL(/\/en\/staff\/[0-9a-f-]{36}$/);
    await settled(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEACHER.name);
    await expect(page.getByText(TEACHER.login, { exact: true })).toBeVisible();

    await page.getByTestId("member-edit").click();
    const dialog = page.getByTestId("member-dialog");
    await dialog.getByLabel(en.staff.fields.phone).fill(NEW_PHONE);
    await dialog.getByRole("button", { name: en.common.save }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByText(NEW_PHONE, { exact: true })).toBeVisible();
  });

  test("the teacher changes their own name on My profile", async ({ page }) => {
    await logIn(page, TEACHER.login, TEACHER.password);
    await expect(page).toHaveURL(/\/en\/today$/);
    await page.getByRole("button", { name: en.nav.account }).click();
    await page.getByRole("menuitem", { name: en.nav.profile }).click();
    await expect(page).toHaveURL(/\/en\/profile$/);
    await settled(page);

    const form = page.getByTestId("profile-form");
    await expect(page.getByText(TEACHER.login, { exact: true })).toBeVisible();
    await form.getByLabel(en.auth.fields.fullName).fill("Rustam Karimov");
    await form.getByRole("button", { name: en.common.save }).click();
    await expect(page.getByText(en.common.saved, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("profile-form").getByLabel(en.auth.fields.fullName)).toHaveValue(
      "Rustam Karimov",
    );
  });
});
