import { expect, test, type Page } from "@playwright/test";
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
 * M1c E2E (30-milestones M1): students with guardians (siblings share one) → enroll, freeze, transfer and
 * end → the teacher sees the roster with names only.
 */
const OWNER = {
  name: "Nodira Owner",
  login: "nodira.owner09",
  phone: "+998990000009",
  password: "owner-pass-9",
};
const TEACHER = {
  name: "Bekzod Teacher",
  login: "bekzod.teacher10",
  phone: "+998990000010",
  password: "teach-pass-10",
};
const GROUP = "General English · Mon/Wed/Fri 18:00";

function tashkentDate(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function addStudent(
  page: Page,
  name: string,
  phone: string,
  guardian?: { name: string; phone: string },
) {
  await page.goto("/en/students");
  await settled(page);
  await page.getByRole("button", { name: en.students.addButton }).click();
  const dialog = page.getByTestId("student-dialog");
  await dialog.getByLabel(en.students.fields.fullName).fill(name);
  await dialog.getByLabel(en.students.fields.phone, { exact: true }).fill(phone);
  if (guardian) {
    await dialog.getByLabel(en.students.guardian.name).fill(guardian.name);
    await dialog.getByLabel(en.students.guardian.phone).fill(guardian.phone);
  }
  await dialog.getByRole("button", { name: en.students.addSubmit }).click();
  return dialog;
}

async function chooseInCombobox(
  page: Page,
  dialog: ReturnType<Page["getByTestId"]>,
  label: string,
  option: string,
) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page
    .getByRole("option", { name: new RegExp(option) })
    .first()
    .click();
}

test.describe.serial("M1 · students and enrollments", () => {
  test("owner adds students and guardians, enrolls, freezes, transfers and ends", async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, "Nur Academy", "Chilonzor");
    await addRoom(page, "Chilonzor", "Room A");
    const url = await inviteTeacher(page, TEACHER, "Chilonzor");
    await acceptInvite(browser, url, TEACHER);

    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("button", { name: en.courses.addButton }).click();
    const course = page.getByTestId("course-dialog");
    await course.getByLabel(en.courses.fields.name).fill("General English");
    await course.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(course).toBeHidden();
    await createGroup(page, { room: "Room A", teacher: TEACHER.name, times: 3 });
    await createGroup(page, {
      room: "Room A",
      teacher: OWNER.name,
      times: 1,
      firstStart: "20:00",
      name: "Evening B",
    });

    // Two siblings share one guardian (same phone).
    const guardian = { name: "Malika Valiyeva", phone: "+998901112233" };
    await expect(await addStudent(page, "Ali Valiyev", "+998931110001", guardian)).toBeHidden();
    await expect(
      await addStudent(page, "Vali Valiyev", "+998931110002", {
        name: "Mother",
        phone: guardian.phone,
      }),
    ).toBeHidden();
    await expect(page.getByTestId("student-row")).toHaveCount(2);

    // The same name again: a warning first, nothing created.
    const duplicate = await addStudent(page, "ali  valiyev", "+998931110003");
    await expect(duplicate.getByText(en.errors.duplicateStudent)).toBeVisible();
    await duplicate.getByRole("button", { name: en.common.cancel }).click();
    await expect(page.getByTestId("student-row")).toHaveCount(2);

    // Search by the guardian's phone finds both siblings.
    await page.getByLabel(en.students.searchLabel).fill("90 111 22");
    await expect(page.getByTestId("student-row")).toHaveCount(2);

    // Vali's profile: the guardian is shared, and their name was kept.
    await page.goto("/en/students");
    await settled(page);
    await page
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "Vali Valiyev") })
      .click();
    await page.getByRole("tab", { name: en.students.tabGuardians }).click();
    await expect(page.getByTestId("guardian-card")).toContainText(guardian.name);
    await expect(page.getByTestId("also-guardian-of")).toContainText("Ali Valiyev");

    // Enroll Ali from today, then freeze for a week.
    await page.goto("/en/students");
    await settled(page);
    await page
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "Ali Valiyev") })
      .click();
    await settled(page);
    await page.getByRole("button", { name: en.enrollments.enroll }).click();
    const enroll = page.getByTestId("enroll-dialog");
    await chooseInCombobox(page, enroll, en.enrollments.group, GROUP);
    await enroll.getByLabel(en.enrollments.startDate).fill(tashkentDate());
    await enroll.getByRole("button", { name: en.enrollments.enrollSubmit }).click();
    await expect(enroll).toBeHidden();
    await expect(page.getByTestId("enrollment-row")).toContainText(en.enrollments.status.active);

    await page.getByRole("button", { name: `Freeze Ali Valiyev · ${GROUP}` }).click();
    const freeze = page.getByTestId("freeze-dialog");
    await freeze.getByLabel(en.enrollments.to).fill(tashkentDate(6));
    await freeze.getByRole("button", { name: en.enrollments.freezeSubmit }).click();
    await expect(freeze).toBeHidden();
    await expect(page.getByTestId("enrollment-row")).toContainText(en.enrollments.status.frozen);

    // Vali joins from the group's roster, then transfers to Evening B tomorrow.
    await page.goto("/en/groups");
    await settled(page);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    await page.getByRole("tab", { name: en.groups.tabRoster }).click();
    await page.getByRole("button", { name: en.enrollments.addStudent }).click();
    const add = page.getByTestId("enroll-dialog");
    await chooseInCombobox(page, add, en.enrollments.student, "Vali Valiyev");
    await add.getByLabel(en.enrollments.startDate).fill(tashkentDate());
    await add.getByRole("button", { name: en.enrollments.enrollSubmit }).click();
    await expect(add).toBeHidden();
    await expect(page.getByTestId("roster-row")).toHaveCount(2);

    await page.getByRole("button", { name: `Transfer Vali Valiyev · ${GROUP}` }).click();
    const transfer = page.getByTestId("transfer-dialog");
    await chooseInCombobox(page, transfer, en.enrollments.toGroup, "Evening B");
    await transfer.getByLabel(en.enrollments.transferDate).fill(tashkentDate(1));
    await transfer.getByRole("button", { name: en.enrollments.transferSubmit }).click();
    await expect(transfer).toBeHidden();

    await page.goto("/en/students");
    await settled(page);
    await page
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "Vali Valiyev") })
      .click();
    await expect(page.getByTestId("enrollment-row")).toHaveCount(2);
    await expect(page.getByTestId("enrollment-row").filter({ hasText: "Evening B" })).toBeVisible();
    await expect(page.getByTestId("enrollment-row").filter({ hasText: GROUP })).toContainText(
      en.enrollments.reasons.transferred,
    );

    // End Vali's new enrollment on its first day.
    await page.getByRole("button", { name: "End Vali Valiyev · Evening B" }).click();
    const end = page.getByTestId("end-dialog");
    await end.getByLabel(en.enrollments.endDate).fill(tashkentDate(1));
    await end.getByRole("button", { name: en.enrollments.endSubmit }).click();
    await expect(end).toBeHidden();
    await expect(page.getByTestId("enrollment-row").filter({ hasText: "Evening B" })).toContainText(
      en.enrollments.reasons.completed,
    );
  });

  test("the teacher sees the roster with names only", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await logIn(page, TEACHER.login, TEACHER.password);
    await expect(page).toHaveURL(/\/en\/today$/);

    // No students pages for teachers.
    await page.goto("/en/students");
    await expect(page).toHaveURL(/\/en\/today$/);

    await page.goto("/en/groups");
    await settled(page);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    await page.getByRole("tab", { name: en.groups.tabRoster }).click();
    const cards = page.getByTestId("roster-row-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Ali Valiyev");
    await expect(page.getByText("+998931110001")).toHaveCount(0);
    await expect(page.getByRole("button", { name: en.enrollments.addStudent })).toHaveCount(0);
    await context.close();
  });
});
