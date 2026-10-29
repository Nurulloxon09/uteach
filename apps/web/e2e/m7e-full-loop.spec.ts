import { expect, test, type Page } from "@playwright/test";
import { addLesson, capStudents, lessonIds, paymentNotices } from "./db";
import { addRoom, createCenter, createGroup, en, logIn, settled } from "./helpers";

/**
 * M7 E2E, the full loop (30-milestones M7e plan): lead → trial → convert → attendance → charge → payment →
 * `payment_received` queued for the parent with the receipt (the worker test proves the Telegram delivery).
 * Then the student-limit message on a center whose plan is full, clicked through to Settings → Subscription.
 * The owner teaches the group, so one login covers every step.
 */
const OWNER = {
  name: "Sardor Owner",
  login: "sardor.owner17",
  phone: "+998990000017",
  password: "owner-pass-17",
};
const CENTER = "Loop Academy";
const BRANCH = "Yunusobod";
const GROUP = "Morning A";
const LEAD = { name: "Kamola Yusupova", phone: "+998931117701" };
const PARENT = "Gulnora Yusupova";
const SECOND = { name: "Jasur Aliyev", phone: "+998931117702" };

async function home(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await logIn(page, OWNER.login, OWNER.password);
  await expect(page).toHaveURL(/\/en\/home$/);
}

async function addLead(page: Page, lead: { name: string; phone: string }) {
  await page.goto("/en/leads");
  await settled(page);
  await page.getByRole("button", { name: en.leads.addButton }).click();
  const dialog = page.getByTestId("lead-dialog");
  await dialog.getByLabel(en.leads.fields.fullName).fill(lead.name);
  await dialog.getByLabel(en.leads.fields.phone).fill(lead.phone);
  await dialog.getByRole("button", { name: en.leads.addSubmit }).click();
  await expect(dialog).toBeHidden();
}

async function openLead(page: Page, name: string) {
  await page.goto("/en/leads?view=list");
  await settled(page);
  await page.getByRole("link", { name }).click();
  await settled(page);
}

test.describe.serial("M7 · the full loop", () => {
  test("owner sets up a center, a priced group and two lessons soon", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, CENTER, BRANCH);
    await addRoom(page, BRANCH, "Room 1");

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
      teacher: OWNER.name,
      times: 0,
      name: GROUP,
      course: "English",
    });
    // Short and back to back: the trial is on the first, the student's first class is the second. Both open
    // for marking right away (the sheet opens 30 minutes before the start).
    await addLesson(CENTER, GROUP, 10, 10);
    await addLesson(CENTER, GROUP, 22, 30);

    // Signed in, "/" still goes to Home (visitors get the landing page instead).
    await page.goto("/en");
    await expect(page).toHaveURL(/\/en\/home$/);
  });

  test("lead → trial booked → marked present", async ({ page }) => {
    await home(page);
    await addLead(page, LEAD);
    await openLead(page, LEAD.name);

    await page.getByTestId("lead-schedule-trial").click();
    const trial = page.getByTestId("trial-dialog");
    await trial.getByTestId("trial-lesson").first().click();
    await trial.getByRole("button", { name: en.leads.trial.submit }).click();
    await expect(trial).toBeHidden();
    await expect(page.getByTestId("lead-status")).toContainText(en.leads.status.trial_scheduled);

    const [trialLesson] = await lessonIds(CENTER, GROUP);
    await page.goto(`/en/attendance/${trialLesson}`);
    await settled(page);
    const row = page.getByTestId("attendance-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(LEAD.name);
    await page.getByTestId("all-present").click();
    await page.getByTestId("attendance-save").click();
    await expect(page.getByTestId("attendance-save")).toBeDisabled();

    await openLead(page, LEAD.name);
    await expect(page.getByTestId("lead-status")).toContainText(en.leads.status.trial_done);
  });

  test("convert with the parent → cycle 1 charge → attendance → payment → receipt queued", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await home(page);
    await openLead(page, LEAD.name);

    // The lead's phone is the mother's: she becomes the guardian who gets payment messages.
    await page.getByTestId("lead-convert").click();
    const convert = page.getByTestId("convert-dialog");
    await convert.getByRole("radio", { name: en.leads.convert.phoneIsParent }).click();
    await convert.getByLabel(en.students.guardian.name).fill(PARENT);
    await convert.getByRole("button", { name: en.leads.convert.submit }).click();
    await expect(convert.getByTestId("convert-done")).toBeVisible();
    await convert.getByRole("link", { name: en.leads.convert.openStudent }).click();
    await expect(page).toHaveURL(/\/en\/students\/[0-9a-f-]{36}$/);
    await settled(page);
    await expect(page.getByTestId("profile-card")).toContainText(LEAD.name);
    const studentUrl = page.url();

    // Charge: cycle 1 starts at the group's next lesson.
    await page.getByRole("tab", { name: en.billing.tab }).click();
    await expect(page.getByTestId("cycle-row")).toHaveCount(1);
    await expect(page.getByTestId("cycle-row")).toContainText("600,000");
    await expect(page.getByTestId("student-balance")).toContainText("600,000");

    // Attendance: her first class.
    const [, classLesson] = await lessonIds(CENTER, GROUP);
    await page.goto(`/en/attendance/${classLesson}`);
    await settled(page);
    const row = page.getByTestId("attendance-row").filter({ hasText: LEAD.name });
    await expect(row).toHaveCount(1);
    await page.getByTestId("all-present").click();
    await page.getByTestId("attendance-save").click();
    await expect(page.getByTestId("attendance-save")).toBeDisabled();

    // Payment in cash for the whole cycle.
    await page.goto(studentUrl);
    await settled(page);
    await page.getByRole("tab", { name: en.billing.tab }).click();
    await page.getByRole("button", { name: en.billing.record.button }).click();
    const dialog = page.getByTestId("payment-dialog");
    await expect(dialog.getByLabel(en.billing.record.amount)).toHaveValue("600000");
    await dialog.getByRole("button", { name: en.billing.record.submit }).click();
    const recorded = dialog.getByTestId("payment-recorded");
    await expect(recorded).toContainText(/YUN-\d{4}-000001/);
    const receiptNo = (await recorded.textContent())!.match(/YUN-\d{4}-000001/)![0];
    await dialog.getByRole("button", { name: en.common.done }).click();
    await expect(page.getByTestId("student-balance")).toHaveText(en.billing.settled);

    // The receipt notice is queued for the mother (the worker turns it into the Telegram message + PDF).
    const notices = await paymentNotices(CENTER);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ guardian: PARENT, receiptNo, status: "pending" });
    expect(notices[0]!.paymentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("a full plan: converting one more student shows the limit and leads to Subscription", async ({
    page,
  }) => {
    await capStudents(CENTER, 1);
    await home(page);
    await addLead(page, SECOND);
    await openLead(page, SECOND.name);

    await page.getByTestId("lead-convert").click();
    const convert = page.getByTestId("convert-dialog");
    await convert.getByRole("button", { name: en.leads.convert.submit }).click();
    const error = convert.getByTestId("form-error");
    await expect(error).toContainText(en.errors.db.student_limit_reached);
    await error.getByTestId("plan-error-link").click();
    await expect(page).toHaveURL(/\/en\/settings\/subscription$/);
    await expect(page.getByTestId("subscription-banner")).toHaveCount(0);
  });
});
