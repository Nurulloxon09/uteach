import { expect, test, type Page } from "@playwright/test";
import { addLessonSoon } from "./db";
import {
  acceptInvite,
  addRoom,
  createCenter,
  createGroup,
  en,
  inviteTeacher,
  logIn,
  settled,
} from "./helpers";

/**
 * M5 E2E happy path (30-milestones M5): create a lead (a second one with the same phone shows the duplicate
 * warning) → contacted → book a trial on an upcoming lesson → the teacher sees the guest on the sheet and marks
 * them present → the lead is "Trial done" → convert → the student is in the group with the first charge.
 */
const OWNER = {
  name: "Malika Owner",
  login: "malika.owner19",
  phone: "+998990000019",
  password: "owner-pass-19",
};
const TEACHER = {
  name: "Aziz Teacher",
  login: "aziz.teacher18",
  phone: "+998990000018",
  password: "teacher-pass-18",
};
const CENTER = "Lead Academy";
const BRANCH = "Chilonzor";
const GROUP = "Evening A";
const LEAD = { name: "Dilnoza Rahimova", phone: "+998931115501" };

async function openLead(page: Page) {
  await page.goto("/en/leads?view=list");
  await settled(page);
  await page.getByRole("link", { name: LEAD.name }).click();
  await settled(page);
}

test.describe.serial("M5 · leads: lead → trial → convert", () => {
  let lessonId = "";

  test("owner sets up a priced group with a teacher and an upcoming lesson", async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, CENTER, BRANCH);
    await addRoom(page, BRANCH, "Room 1");
    const invite = await inviteTeacher(page, TEACHER, BRANCH);
    await acceptInvite(browser, invite, TEACHER);

    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("button", { name: en.courses.addButton }).click();
    const course = page.getByTestId("course-dialog");
    await course.getByLabel(en.courses.fields.name).fill("English");
    await course.getByLabel(en.courses.fields.price).fill("600000");
    await course.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(course).toBeHidden();

    await createGroup(page, {
      room: "Room 1",
      teacher: TEACHER.name,
      times: 0,
      name: GROUP,
      course: "English",
    });
    lessonId = await addLessonSoon(CENTER, GROUP, 20);
  });

  test("a new lead, the duplicate warning, and the move to Contacted", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.login, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    await page.goto("/en/leads");
    await settled(page);
    await page.getByRole("button", { name: en.leads.addButton }).click();
    let dialog = page.getByTestId("lead-dialog");
    await dialog.getByLabel(en.leads.fields.fullName).fill(LEAD.name);
    await dialog.getByLabel(en.leads.fields.phone).fill(LEAD.phone);
    await dialog.getByLabel(en.leads.fields.goal).fill("IELTS 7.0");
    await dialog.getByRole("button", { name: en.leads.addSubmit }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-column="new"]').getByTestId("kanban-card")).toContainText(
      LEAD.name,
    );

    // The same phone again: the warning links to the first lead (it never blocks).
    await page.getByRole("button", { name: en.leads.addButton }).click();
    dialog = page.getByTestId("lead-dialog");
    await dialog.getByLabel(en.leads.fields.phone).fill(LEAD.phone);
    await dialog.getByLabel(en.leads.fields.fullName).click();
    await expect(dialog.getByTestId("lead-duplicates")).toContainText(LEAD.name);
    await dialog.getByRole("button", { name: en.common.cancel }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: LEAD.name }).click();
    await settled(page);
    await page.getByTestId("lead-move").click();
    await page.getByRole("menuitem", { name: en.leads.status.contacted }).click();
    await expect(page.getByTestId("lead-status")).toContainText(en.leads.status.contacted);
    await expect(page.getByTestId("timeline-entry").first()).toContainText(
      en.leads.timeline.moved
        .replace("{from}", en.leads.status.new)
        .replace("{to}", en.leads.status.contacted),
    );
  });

  test("booking a trial puts the lead on the lesson's sheet", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.login, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await openLead(page);

    await page.getByTestId("lead-schedule-trial").click();
    const trial = page.getByTestId("trial-dialog");
    await expect(trial.getByTestId("trial-lesson")).toHaveCount(1);
    await trial.getByTestId("trial-lesson").click();
    await trial.getByRole("button", { name: en.leads.trial.submit }).click();
    await expect(trial).toBeHidden();
    await expect(page.getByTestId("lead-status")).toContainText(en.leads.status.trial_scheduled);
    await expect(page.getByTestId("open-trial")).toContainText(GROUP);
  });

  test("the teacher marks the guest present; the lead is Trial done", async ({ page, browser }) => {
    const teacher = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const sheet = await teacher.newPage();
    await logIn(sheet, TEACHER.login, TEACHER.password);
    await expect(sheet).toHaveURL(/\/en\/today$/);
    await sheet.goto(`/en/attendance/${lessonId}`);
    await settled(sheet);
    const row = sheet.getByTestId("attendance-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(LEAD.name);
    await expect(row).toContainText(en.attendance.trial);
    await sheet.getByTestId("all-present").click();
    await sheet.getByTestId("attendance-save").click();
    await expect(sheet.getByTestId("attendance-save")).toBeDisabled();
    // The save's refresh can re-render the sheet and wipe the box, so refill until the text sticks.
    const feedbackSave = sheet
      .getByTestId("trial-feedback")
      .getByRole("button", { name: en.attendance.trialFeedbackSave });
    await expect(async () => {
      await sheet
        .getByLabel(en.attendance.trialFeedback.replace("{name}", LEAD.name))
        .fill("Level B1");
      await expect(feedbackSave).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await feedbackSave.click();
    await expect(sheet.getByText(en.attendance.trialFeedbackSaved)).toBeVisible();
    await teacher.close();

    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.login, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await openLead(page);
    await expect(page.getByTestId("lead-status")).toContainText(en.leads.status.trial_done);
    await expect(page.getByTestId("trial-feedback-list")).toContainText("Level B1");
  });

  test("convert: the student is in the group with the first charge", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.login, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await openLead(page);

    await page.getByTestId("lead-convert").click();
    const convert = page.getByTestId("convert-dialog");
    await convert.getByRole("button", { name: en.leads.convert.submit }).click();
    await expect(convert.getByTestId("convert-done")).toBeVisible();
    await expect(convert.getByTestId("convert-first-payment")).toBeVisible();
    await convert.getByRole("link", { name: en.leads.convert.openStudent }).click();
    await settled(page);

    await expect(page.getByTestId("profile-card")).toContainText(LEAD.name);
    await expect(page.getByText(GROUP).first()).toBeVisible();
    await page.getByRole("tab", { name: en.billing.tab }).click();
    await expect(page.getByTestId("cycle-row")).toHaveCount(1);
    await expect(page.getByTestId("cycle-row")).toContainText("600,000");

    await page.goto("/en/leads?view=list&status=won");
    await settled(page);
    await expect(page.getByTestId("lead-row")).toContainText(LEAD.name);
  });
});
