import { expect, test, type Page } from "@playwright/test";
import { acceptInvite, createCenter, en, inviteTeacher, logIn, settled } from "./helpers";

/**
 * M0.5 E2E (30-milestones): the app shell and patterns work with keyboard and on a phone.
 * Uses its own center so it doesn't depend on the M0 test's state.
 */
const OWNER = {
  name: "Umida Owner",
  login: "umida.owner03",
  phone: "+998990000003",
  password: "owner-pass-3",
};
const TEACHER = {
  name: "Timur Teacher",
  login: "timur.teacher04",
  phone: "+998990000004",
  password: "teach-pass-4",
};

/** True when keyboard focus is inside an open dialog. */
const focusInDialog = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));

test.describe.serial("M0.5 UI foundation", () => {
  test("owner: sidebar, staff list filters, and a keyboard-safe invite dialog", async ({
    page,
    browser,
  }) => {
    await createCenter(page, OWNER, "Sunrise Academy", "Olmazor");

    // Desktop sidebar: Home, Staff and the Settings group.
    const sidebar = page.getByRole("complementary", { name: en.nav.menu });
    await expect(sidebar.getByRole("link", { name: en.nav.home })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: en.nav.staff })).toBeVisible();
    await sidebar.getByRole("button", { name: en.nav.settings }).click();
    await sidebar.getByRole("link", { name: en.nav.branches }).click();
    await expect(page).toHaveURL(/\/en\/settings\/branches$/);
    await expect(page.getByTestId("branch-row")).toHaveCount(1);

    const inviteUrl = await inviteTeacher(page, TEACHER, "Olmazor");
    await acceptInvite(browser, inviteUrl, TEACHER);

    // Staff list: two rows; search and filters narrow it through the URL.
    await page.goto("/en/staff");
    await settled(page);
    await expect(page.getByTestId("staff-row")).toHaveCount(2);
    await page.getByLabel(en.staff.searchLabel).fill("Timur");
    await expect(page).toHaveURL(/[?&]q=Timur/);
    await expect(page.getByTestId("staff-row")).toHaveCount(1);
    await expect(page.getByTestId("staff-row")).toContainText(TEACHER.name);

    await page.goto("/en/staff?role=owner");
    await expect(page.getByTestId("staff-row")).toHaveCount(1);
    await expect(page.getByTestId("staff-row")).toContainText(OWNER.name);
    await page.goto("/en/staff?status=disabled");
    await expect(page.getByTestId("staff-row")).toHaveCount(0);

    // Invite dialog: focus stays inside while tabbing; Esc closes and returns focus to the trigger.
    await page.goto("/en/staff");
    await settled(page);
    const trigger = page.getByRole("button", { name: en.staff.inviteButton });
    await trigger.click();
    await expect(page.getByTestId("invite-dialog")).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await focusInDialog(page)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("invite-dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("/dev/ui is available in development and 404 in production", async ({ page }) => {
    await logIn(page, OWNER.login, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    const response = await page.goto("/en/dev/ui");
    if (process.env.CI) {
      // CI runs `pnpm start` (NODE_ENV=production).
      expect(response?.status()).toBe(404);
    } else {
      expect(response?.status()).toBe(200);
      await expect(page.locator("#list-page")).toBeVisible();
    }
  });

  test("teacher on a phone: drawer menu with Today and My groups", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await logIn(page, TEACHER.login, TEACHER.password);
    await expect(page).toHaveURL(/\/en\/today$/);
    await expect(page.getByTestId("today-title")).toHaveText(en.today.title);

    // No sidebar on a phone; the menu button opens a drawer.
    await expect(page.getByRole("complementary", { name: en.nav.menu })).toHaveCount(0);
    const menuButton = page.getByRole("button", { name: en.nav.openMenu });
    await menuButton.click();
    const drawer = page.getByRole("dialog", { name: en.nav.menu });
    await expect(drawer).toBeVisible();
    const links = drawer.getByRole("navigation").getByRole("link");
    await expect(links).toHaveCount(3);
    await expect(links).toHaveText([en.nav.today, en.nav.myGroups, en.nav.scores]);

    // Esc closes it and focus goes back to the menu button.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();

    // Following a link closes the drawer.
    await menuButton.click();
    await drawer.getByRole("link", { name: en.nav.today }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/en\/today$/);
    await context.close();
  });
});
