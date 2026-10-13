import { formatScore, ieltsBand } from "@uteach/core";
import { expect, test } from "@playwright/test";
import { seedScoreGroup } from "./db";
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
 * M6 E2E (30-milestones M6): a teacher enters a 15-student IELTS mock for their group with the keyboard only
 * (Tab across, values typed); 7.3 and 10 are rejected inline and Save refuses while a cell is red; after saving,
 * the student profile chart shows the new point against the target line and the exam day.
 */
const OWNER = { name: "Nodira Owner", phone: "+998990000005", password: "owner-pass-05" };
const TEACHER = { name: "Bekzod Teacher", phone: "+998990000020", password: "teacher-pass-20" };
const CENTER = "Score Academy";
const BRANCH = "Yunusobod";
const GROUP = "IELTS Morning";
const COUNT = 15;
const SECTIONS = ["Listening", "Reading", "Writing", "Speaking"] as const;

/** Band scores per student: Pupil 01 gets 6.5 overall (target 7.0 → 0.5 to go). */
const scores = Array.from({ length: COUNT }, (_, i) =>
  i === 0
    ? [6.5, 7, 6, 6.5]
    : [5 + (i % 4) * 0.5, 6 + (i % 3) * 0.5, 5.5 + (i % 2) * 0.5, 6 + (i % 5) * 0.5],
);
const name = (i: number) => `Pupil ${String(i + 1).padStart(2, "0")} Karimov`;
const text = (n: number) => formatScore(n, "ielts_band");

test.describe.serial("M6 · exams: teacher enters a mock → the chart shows it vs target", () => {
  let groupId = "";
  let studentIds: string[] = [];

  test("owner sets up an IELTS course, a group with a teacher and 15 students", async ({
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
    await course.getByLabel(en.courses.fields.name).fill("IELTS prep");
    await course.getByLabel(en.courses.fields.examType).click();
    await page.getByRole("option", { name: "IELTS", exact: true }).click();
    await course.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(course).toBeHidden();

    await createGroup(page, {
      room: "Room 1",
      teacher: TEACHER.name,
      times: 0,
      name: GROUP,
      course: "IELTS prep",
    });
    ({ groupId, studentIds } = await seedScoreGroup(CENTER, GROUP, COUNT, {
      total: 7,
      examInDays: 60,
    }));
  });

  test("teacher types a 15-student mock with the keyboard only", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, TEACHER.phone, TEACHER.password);
    await expect(page).toHaveURL(/\/en\/today$/);
    await page.goto(`/en/groups/${groupId}?tab=scores`);
    await settled(page);
    await page.getByTestId("enter-scores").click();
    await settled(page);
    await expect(page).toHaveURL(/\/scores/);

    const grid = page.getByTestId("score-grid");
    const inputs = grid.locator('[data-layout="table"]');
    await expect(inputs).toHaveCount(COUNT * SECTIONS.length);

    // Into the first cell, then nothing but typing and Tab.
    await inputs.first().focus();
    for (const row of scores) {
      for (const value of row) {
        await page.keyboard.type(String(value));
        await page.keyboard.press("Tab");
      }
    }
    const totals = grid.getByTestId("score-grid-total").locator("visible=true");
    for (const [i, row] of scores.entries()) {
      await expect(totals.nth(i), name(i)).toHaveText(text(ieltsBand(row)));
    }

    // Off the step and off the range: red inline, and Save refuses.
    const cell = (i: number, section: number) =>
      grid.getByLabel(
        en.exams.enter.cell.replace("{student}", name(i)).replace("{section}", SECTIONS[section]!),
      );
    const reading2 = cell(1, 1).locator("visible=true");
    await reading2.focus();
    await page.keyboard.type("7.3");
    await expect(reading2).toHaveAttribute("aria-invalid", "true");
    await expect(
      grid.getByText(en.exams.errors.off_step.replace("{step}", "0.5")).locator("visible=true"),
    ).toBeVisible();
    const writing3 = cell(2, 2).locator("visible=true");
    await writing3.focus();
    await page.keyboard.type("10");
    await expect(writing3).toHaveAttribute("aria-invalid", "true");
    await expect(
      grid
        .getByText(en.exams.errors.out_of_range.replace("{min}", "0").replace("{max}", "9"))
        .locator("visible=true"),
    ).toBeVisible();
    await page.getByTestId("score-save").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(en.exams.enter.fixErrors)).toBeVisible();

    // Put the right values back, then save from the keyboard.
    await reading2.focus();
    await page.keyboard.type(String(scores[1]![1]));
    await writing3.focus();
    await page.keyboard.type(String(scores[2]![2]));
    await expect(grid.locator("[aria-invalid='true']")).toHaveCount(0);
    await page.getByTestId("score-save").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/15 results saved/)).toBeVisible();

    // The group's table: Pupil 01 is 0.5 short of the target.
    await page.getByRole("link", { name: en.exams.enter.back }).click();
    await settled(page);
    const row = page.getByRole("row").filter({ hasText: name(0) });
    await expect(row).toContainText("6.5");
    await expect(row).toContainText("7.0");
    await expect(row).toContainText("0.5");
  });

  test("the student profile chart shows the new point against the target", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await page.goto(`/en/students/${studentIds[0]}?tab=scores`);
    await settled(page);
    const chart = page.getByTestId("score-chart");
    await expect(chart).toBeVisible();
    await expect(chart.getByTestId("score-chart-point")).toHaveCount(1);
    await expect(chart.getByTestId("score-chart-target")).toBeVisible();
    await expect(chart.getByTestId("score-chart-exam-date")).toBeVisible();
    await expect(page.getByRole("cell", { name: /^Listening 6.5 · Reading 7.0/ })).toBeVisible();
  });
});
