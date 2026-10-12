import { expect, test, type Page } from "@playwright/test";
import { addRoom, createCenter, createGroup, en, logIn, settled } from "./helpers";

/**
 * M3b E2E (30-milestones M3, M3 plan): the owner enrolls a student in a priced group → cycle 1 is charged →
 * records a cash payment with the resulting balance shown first → prints both receipts → the balance is
 * settled → the payment shows on the Payments page, is voided there, and the debt comes back. The full M3 happy
 * path (12 lessons, next cycle, debtors) comes with M3c.
 */
const OWNER = { name: "Malika Owner", phone: "+998990000014", password: "owner-pass-14" };
const GROUP = "Evening A";
const STUDENT = "Aziz Rahimov";

/** Today in Tashkent and the current time rounded down to 5 minutes. */
function tashkentNow(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const minute = String(Math.floor(Number(get("minute")) / 5) * 5).padStart(2, "0");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${minute}` };
}

async function openStudentPayments(page: Page) {
  await page.goto("/en/students");
  await settled(page);
  await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", STUDENT) }).click();
  await settled(page);
  await page.getByRole("tab", { name: en.billing.tab }).click();
}

test.describe.serial("M3b · payments and receipts", () => {
  const now = tashkentNow();

  test("owner sets up a priced group with a lesson today and enrolls a student", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, "Kassa Academy", "Yunusobod");
    await addRoom(page, "Yunusobod", "Room 1");

    // A course with a price: the new group takes it as its cycle price (12 lessons).
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

    // The group's first lesson: an extra lesson today.
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    await page.getByRole("button", { name: en.lessons.extra }).click();
    const extra = page.getByTestId("makeup-dialog");
    await extra.getByLabel(en.lessons.date).fill(now.date);
    await extra.getByLabel(en.lessons.time).fill(now.time);
    await extra.getByLabel(en.lessons.duration).fill("60");
    await extra.getByRole("button", { name: en.lessons.makeupSubmit }).click();
    await expect(extra).toBeHidden();

    await page.goto("/en/students");
    await settled(page);
    await page.getByRole("button", { name: en.students.addButton }).click();
    const student = page.getByTestId("student-dialog");
    await student.getByLabel(en.students.fields.fullName).fill(STUDENT);
    await student.getByLabel(en.students.fields.phone, { exact: true }).fill("+998931234567");
    await student.getByRole("button", { name: en.students.addSubmit }).click();
    await expect(student).toBeHidden();

    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", STUDENT) }).click();
    await settled(page);
    await page.getByRole("button", { name: en.enrollments.enroll }).click();
    const enroll = page.getByTestId("enroll-dialog");
    await enroll.getByLabel(en.enrollments.group, { exact: true }).click();
    await page
      .getByRole("option", { name: new RegExp(GROUP) })
      .first()
      .click();
    await enroll.getByLabel(en.enrollments.startDate).fill(now.date);
    await enroll.getByRole("button", { name: en.enrollments.enrollSubmit }).click();
    await expect(enroll).toBeHidden();
  });

  test("cycle 1 is charged; a cash payment settles it and prints receipts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    await openStudentPayments(page);
    const cycle = page.getByTestId("cycle-row");
    await expect(cycle).toHaveCount(1);
    await expect(cycle).toContainText(en.billing.cycles.cycle.replace("{no}", "1"));
    await expect(cycle).toContainText("600,000");
    await expect(page.getByTestId("student-balance")).toContainText("600,000");
    await expect(page.getByTestId("profile-chips")).toContainText("600,000");

    await page.getByRole("button", { name: en.billing.record.button }).click();
    const dialog = page.getByTestId("payment-dialog");
    await expect(dialog.getByLabel(en.billing.record.amount)).toHaveValue("600000");
    await expect(dialog.getByTestId("balance-after")).toHaveText(en.billing.settled);
    await dialog.getByLabel(en.billing.record.amount).fill("200000");
    await expect(dialog.getByTestId("balance-after")).toContainText("400,000");
    await dialog.getByLabel(en.billing.record.amount).fill("600000");
    await dialog.getByRole("button", { name: en.billing.record.submit }).click();

    const recorded = dialog.getByTestId("payment-recorded");
    await expect(recorded).toContainText(/YUN-\d{4}-000001/);
    for (const size of ["80mm", "a4"]) {
      const href = await dialog.getByTestId(`receipt-${size}`).getAttribute("href");
      const res = await page.request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("application/pdf");
      expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
    }
    await dialog.getByRole("button", { name: en.common.done }).click();

    await expect(page.getByTestId("student-balance")).toHaveText(en.billing.settled);
    await expect(page.getByTestId("cycle-row")).toContainText(en.billing.cycles.paid);
    await expect(page.getByTestId("payment-row")).toHaveCount(1);
  });

  test("the Payments page lists it; voiding brings the debt back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    await page.getByRole("link", { name: en.nav.payments }).first().click();
    await expect(page).toHaveURL(/\/en\/payments$/);
    await settled(page);
    const row = page.getByTestId("payments-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(STUDENT);
    await expect(row).toContainText("600,000");

    await row.getByRole("button", { name: /^Void payment YUN-/ }).click();
    const dialog = page.getByTestId("void-payment-dialog");
    await dialog.getByRole("button", { name: en.billing.void.paymentSubmit }).click();
    await expect(dialog).toContainText(en.errors.validation.required);
    await dialog.getByLabel(en.billing.void.reason).fill("Entered twice");
    await dialog.getByRole("button", { name: en.billing.void.paymentSubmit }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(en.billing.payments.voided);

    await openStudentPayments(page);
    await expect(page.getByTestId("student-balance")).toContainText("600,000");
    await expect(page.getByTestId("payment-row")).toContainText(en.billing.payments.voided);
  });
});
