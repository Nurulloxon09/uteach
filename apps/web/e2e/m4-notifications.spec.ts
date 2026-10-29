import { expect, test } from "@playwright/test";
import { broadcastRecipients, seedNotifyCenter } from "./db";
import { createCenter, en, settled } from "./helpers";

/**
 * M4 staff screens (30-milestones M4): a broadcast to "debtors of branch X" reaches exactly that set and the
 * preview count matches; Debtors → "Send reminder" (once a day) and the "Last reminder" column; Students →
 * "Telegram: not linked"; Settings → Notifications: edit a message with a live preview, then reset it; Settings
 * → Telegram without a bot shows how to set it up. The worker side (delivery) is tested in apps/worker.
 */
const OWNER = {
  name: "Nargiza Owner",
  login: "nargiza.owner16",
  phone: "+998990000016",
  password: "owner-pass-16",
};
const CENTER = "Notify Academy";
const BRANCHES = { first: "Chilonzor", second: "Yunusobod" };

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));

test.describe.configure({ mode: "serial" });

test("owner sets up the center with debtors in two branches", async ({ page }) => {
  await createCenter(page, OWNER, CENTER, BRANCHES.first);
  await seedNotifyCenter(CENTER, BRANCHES);
});

test("a broadcast to debtors of one branch reaches exactly them, as previewed", async ({
  page,
}) => {
  await page.goto("/en/login");
  await settled(page);
  await page.getByLabel(en.auth.fields.phone).fill(OWNER.phone);
  await page.getByLabel(en.auth.fields.password).fill(OWNER.password);
  await page.getByRole("button", { name: en.auth.login.submit }).click();
  await expect(page).toHaveURL(/\/en\/home$/);

  await page.goto("/en/broadcasts");
  await settled(page);
  await expect(page.getByText(en.broadcasts.emptyTitle)).toBeVisible();
  await page.getByTestId("new-broadcast").click();
  const composer = page.getByTestId("broadcast-composer");
  await composer.getByTestId("audience-branches").click();
  await page.getByRole("checkbox", { name: BRANCHES.first }).click();
  await page.keyboard.press("Escape");
  await composer.getByRole("radio", { name: en.broadcasts.audience.debtors }).click();
  // Aziz owes (through his mother), Bahrom owes nothing, Charos is in the other branch.
  await expect(composer.getByTestId("broadcast-preview")).toHaveText(
    "1 recipient (1 student); 1 without Telegram won't get it.",
  );
  await composer
    .getByLabel(en.broadcasts.text, { exact: true })
    .fill("Darslar 1-noyabrdan boshlanadi.");
  await composer.getByRole("button", { name: en.broadcasts.send }).click();
  await expect(composer.getByText(en.errors.validation.confirmBroadcast)).toBeVisible();
  // The failed send resets the form; the audience must survive it.
  await expect(composer.getByTestId("broadcast-preview")).toHaveText(
    "1 recipient (1 student); 1 without Telegram won't get it.",
  );
  await composer.getByRole("checkbox", { name: /Send to 1 recipient/ }).click();
  await composer.getByRole("button", { name: en.broadcasts.send }).click();
  await expect(composer.getByTestId("broadcast-queued")).toHaveText("Queued for 1 recipient.");
  expect(await broadcastRecipients(CENTER)).toEqual(["Aziza Mother"]);

  await composer.getByRole("button", { name: en.common.done }).click();
  await page.reload();
  const row = page.getByTestId("broadcast-row").filter({ visible: true }).first();
  await expect(row).toContainText("Darslar 1-noyabrdan boshlanadi.");
  await expect(row).toContainText(fill(en.broadcasts.waiting, { count: 1 }));
});

test("Debtors: send a reminder once a day; the last reminder shows", async ({ page }) => {
  await page.goto("/en/login");
  await settled(page);
  await page.getByLabel(en.auth.fields.phone).fill(OWNER.phone);
  await page.getByLabel(en.auth.fields.password).fill(OWNER.password);
  await page.getByRole("button", { name: en.auth.login.submit }).click();
  await expect(page).toHaveURL(/\/en\/home$/);

  await page.goto("/en/debtors");
  await settled(page);
  const row = page
    .getByTestId("debtor-row")
    .filter({ visible: true })
    .filter({ hasText: "Aziz Debtor" });
  await expect(row).toContainText(en.debtors.noReminder);
  await row.getByTestId("send-reminder").click();
  await expect(
    page.getByText(fill(en.debtors.reminderQueued, { name: "Aziz Debtor" })),
  ).toBeVisible();
  await expect(row.getByTestId("last-reminder")).toBeVisible();
  await row.getByTestId("send-reminder").click();
  await expect(
    page.getByText(fill(en.debtors.reminderAlready, { name: "Aziz Debtor" })),
  ).toBeVisible();

  await page.goto("/en/students?telegram=no");
  await settled(page);
  await expect(page.getByTestId("student-row").filter({ visible: true })).toHaveCount(3);
});

test("Settings: edit a message with a live preview, reset it; Telegram without a bot", async ({
  page,
}) => {
  await page.goto("/en/login");
  await settled(page);
  await page.getByLabel(en.auth.fields.phone).fill(OWNER.phone);
  await page.getByLabel(en.auth.fields.password).fill(OWNER.password);
  await page.getByRole("button", { name: en.auth.login.submit }).click();
  await expect(page).toHaveURL(/\/en\/home$/);

  await page.goto("/en/settings/notifications");
  await settled(page);
  await page.getByTestId("edit-absence_alert").filter({ visible: true }).click();
  const editor = page.getByTestId("template-editor");
  await editor.getByRole("tab", { name: en.locale.en }).click();
  const text = editor.locator('textarea[name="telegram.en"]');
  await text.fill("Heads up: {student} missed {group} on {date}.");
  await expect(editor.getByTestId("preview-telegram.en")).toContainText(
    "Heads up: Ali Valiyev missed IELTS-2 on October 14",
  );
  await text.fill("Broken {student");
  await expect(editor.getByTestId("preview-telegram.en")).toContainText(
    en.settings.notifications.previewInvalid,
  );
  await text.fill("Heads up: {student} missed {group}.");
  await editor.getByRole("button", { name: en.common.save }).click();
  await expect(editor).toBeHidden();
  const row = page
    .getByTestId("template-row")
    .filter({ visible: true })
    .filter({ hasText: en.settings.notifications.keys.absence_alert.title });
  await expect(row).toContainText(en.settings.notifications.customized);

  await row.getByRole("button", { name: en.settings.notifications.reset }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.settings.notifications.reset })
    .click();
  await expect(row).not.toContainText(en.settings.notifications.customized);

  await page.goto("/en/settings/telegram");
  await settled(page);
  await expect(page.getByText(en.settings.telegram.notSetUp)).toBeVisible();
});
