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
 * M1b E2E (30-milestones M1): course + level → group with Mon/Wed/Fri 18:00 → 8 weeks of lessons →
 * a room clash lands in the conflicts inbox → the timetable refuses a clashing drop and accepts a free one →
 * cancel and substitute; the substitute sees the lesson in their Today.
 */
const OWNER = { name: "Otabek Owner", phone: "+998990000007", password: "owner-pass-7" };
const TEACHER = { name: "Sevara Teacher", phone: "+998990000008", password: "teach-pass-8" };

/** "YYYY-MM-DD" in Tashkent, `days` from today. */
function tashkentDate(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week after this one. */
function nextMonday(): string {
  const today = tashkentDate();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  return tashkentDate(8 - weekday);
}

/** Drags a timetable block by (dx, dy) pixels with the mouse (dnd-kit needs real pointer moves). */
async function drag(page: Page, block: ReturnType<Page["locator"]>, dx: number, dy: number) {
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  if (!box) throw new Error("block not visible");
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y + 10, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe.serial("M1 · courses, groups and the timetable", () => {
  test("owner plans a group; clashes are refused and listed", async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, "Atlas Academy", "Chilonzor");
    await addRoom(page, "Chilonzor", "Room A");
    await addRoom(page, "Chilonzor", "Room B");
    const url = await inviteTeacher(page, TEACHER, "Chilonzor");
    await acceptInvite(browser, url, TEACHER);

    // Course with a level.
    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("button", { name: en.courses.addButton }).click();
    const courseDialog = page.getByTestId("course-dialog");
    await courseDialog.getByLabel(en.courses.fields.name).fill("IELTS");
    await courseDialog.getByLabel(en.courses.fields.price).fill("600000");
    await courseDialog.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(courseDialog).toBeHidden();
    await expect(page.getByTestId("course-row")).toHaveCount(1);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", "IELTS") }).click();
    await page.getByRole("button", { name: en.courses.levels.add }).click();
    const levelDialog = page.getByTestId("level-dialog");
    await levelDialog.getByLabel(en.courses.levels.name).fill("6.0");
    await levelDialog.getByRole("button", { name: en.courses.levels.add }).click();
    await expect(levelDialog).toBeHidden();
    await expect(page.getByTestId("level-row")).toHaveCount(1);

    // Group: owner teaches Mon/Wed/Fri 18:00 in Room A (owners can teach; lessons reference a membership).
    await createGroup(page, { room: "Room A", teacher: OWNER.name, times: 3 });
    await expect(page.getByTestId("group-row")).toHaveCount(1);
    await expect(page.getByTestId("group-row")).toContainText("IELTS · Mon/Wed/Fri 18:00");
    await page
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "IELTS · Mon/Wed/Fri 18:00") })
      .click();
    // 8 weeks × 3 = 24 upcoming lessons (the list shows the next 24).
    await expect(page.getByTestId("lesson-row")).toHaveCount(24);

    // A second group in the same room on Mondays at 18:30: every Monday clashes.
    await createGroup(page, {
      room: "Room A",
      teacher: TEACHER.name,
      times: 1,
      firstStart: "18:30",
      name: "Clash",
    });
    await page.goto(`/en/schedule?date=${nextMonday()}`);
    await settled(page);
    await expect(page.getByTestId("conflicts-button")).toContainText("8");
    await page.getByTestId("conflicts-button").click();
    await expect(page.getByTestId("conflict-item")).toHaveCount(8);
    await page
      .getByTestId("conflict-item")
      .first()
      .getByRole("button", { name: en.schedule.skip })
      .click();
    await expect(page.getByTestId("conflict-item")).toHaveCount(7);
    await page.keyboard.press("Escape");
    // Wait for the panel (and its overlay) to close before dragging: the overlay would swallow the drag.
    await expect(page.getByRole("dialog")).toBeHidden();

    // Next week's timetable: Mon, Wed, Fri.
    const blocks = page.getByTestId("timetable-lesson");
    await expect(blocks).toHaveCount(3);
    // 4rem time column, then 7 equal day columns.
    const columnWidth = ((await page.getByTestId("timetable").boundingBox())!.width - 64) / 7;

    // A new day asks "notify students?" (M2) before moving.
    const dropDialog = page.getByTestId("drop-dialog");

    // Wednesday → Monday 18:00 clashes with Monday's lesson (same teacher and room): refused.
    const wednesday = blocks.nth(1);
    await drag(page, wednesday, -2 * columnWidth, 0);
    await expect(dropDialog.getByRole("checkbox", { name: en.lessons.notify })).toBeChecked();
    await dropDialog.getByRole("button", { name: en.lessons.move }).click();
    await expect(
      page.getByText(/The (room is taken|teacher already has a lesson) at that time\./),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dropDialog).toBeHidden();

    // Friday → Saturday is free: moved.
    const friday = blocks.nth(2);
    await drag(page, friday, columnWidth, 0);
    await dropDialog.getByRole("button", { name: en.lessons.move }).click();
    await expect(page.getByText(en.lessons.moved)).toBeVisible();
  });

  test("cancel a lesson and hand one to a substitute, who sees it in Today", async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await page.goto("/en/groups");
    await settled(page);
    await page
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "IELTS · Mon/Wed/Fri 18:00") })
      .click();
    await settled(page);

    // Cancel the first upcoming lesson (center's fault by default).
    const first = page.getByTestId("lesson-row").first();
    await first.getByRole("button", { name: /^Cancel / }).click();
    const cancel = page.getByTestId("cancel-dialog");
    await cancel.getByLabel(en.lessons.reason).fill("Teacher ill");
    await cancel.getByRole("button", { name: en.lessons.cancelSubmit }).click();
    await expect(cancel).toBeHidden();
    await expect(page.getByTestId("lesson-row").first()).toContainText(en.lessons.status.cancelled);

    // An extra lesson today at 07:00, taught by the substitute.
    await page.getByRole("button", { name: en.lessons.extra }).click();
    const extra = page.getByTestId("makeup-dialog");
    await extra.getByLabel(en.lessons.time).fill("07:00");
    await extra.getByRole("button", { name: en.lessons.makeupSubmit }).click();
    await expect(extra).toBeHidden();
    const todayRow = page.getByTestId("lesson-row").filter({ hasText: "07:00" });
    await expect(todayRow).toHaveCount(1);
    await todayRow.getByRole("button", { name: /^Substitute for / }).click();
    const sub = page.getByTestId("substitute-dialog");
    await sub.getByLabel(en.lessons.teacher).click();
    await page.getByRole("option", { name: TEACHER.name }).click();
    await sub.getByRole("button", { name: en.lessons.substituteSubmit }).click();
    await expect(sub).toBeHidden();
    await expect(todayRow).toContainText(en.lessons.substituteChip);

    // The substitute (a teacher of another group) sees it in Today, on a phone.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const teacherPage = await context.newPage();
    await logIn(teacherPage, TEACHER.phone, TEACHER.password);
    await expect(teacherPage).toHaveURL(/\/en\/today$/);
    const lesson = teacherPage.getByTestId("today-lesson").filter({ hasText: "07:00" });
    await expect(lesson).toContainText("IELTS · Mon/Wed/Fri 18:00");
    await expect(lesson).toContainText(en.lessons.substituteChip);
    // Tapping it opens its attendance sheet (M2).
    await lesson.click();
    await expect(teacherPage).toHaveURL(/\/en\/attendance\/[0-9a-f-]{36}$/);
    // Teachers never see prices: no Price tab on the group page.
    await teacherPage.goto("/en/groups");
    await settled(teacherPage);
    await teacherPage
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "IELTS · Mon/Wed/Fri 18:00") })
      .first()
      .click();
    await expect(teacherPage.getByRole("tab", { name: en.groups.tabLessons })).toBeVisible();
    await expect(teacherPage.getByRole("tab", { name: en.groups.tabPrice })).toHaveCount(0);
    await context.close();
  });
});
