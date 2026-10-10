import { expect, test, type Page } from "@playwright/test";
import en from "@uteach/i18n/messages/en.json";

/**
 * M0 E2E (30-milestones): sign up → create center → add branch and room → invite a teacher →
 * teacher accepts → teacher sees the empty "Today" page.
 * Selectors use the English catalog, so copy changes don't break the test.
 */
const OWNER = { name: "Olim Owner", phone: "+998990000001", password: "owner-pass-1" };
const TEACHER = { name: "Tamara Teacher", phone: "+998990000002", password: "teach-pass-1" };
const TEST_CODE = "123456"; // supabase/config.toml [auth.sms.test_otp]

async function signUp(page: Page, person: typeof OWNER) {
  await page.getByLabel(en.auth.fields.fullName).fill(person.name);
  await page.getByLabel(en.auth.fields.phone).fill(person.phone);
  await page.getByLabel(en.auth.fields.password).fill(person.password);
  await page.getByRole("button", { name: en.auth.signup.submit }).click();

  await expect(page.getByText(en.auth.verify.title)).toBeVisible();
  await page.getByLabel(en.auth.fields.code).fill(TEST_CODE);
  await page.getByRole("button", { name: en.auth.verify.submit }).click();
}

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
  await expect(page.getByText(en.invite.title)).toBeVisible();
  await page.getByRole("link", { name: en.invite.signupToAccept }).click();
  await signUp(page, TEACHER);

  await expect(page).toHaveURL(/\/en\/invite\//);
  await page.getByRole("button", { name: en.invite.accept }).click();

  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(page.getByTestId("today-title")).toHaveText(en.today.title);
  await expect(page.getByText(en.today.emptyTitle)).toBeVisible();
  // Teachers have no admin navigation.
  await expect(page.getByRole("link", { name: en.nav.staff })).toHaveCount(0);
});
