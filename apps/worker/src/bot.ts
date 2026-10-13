import { attendanceRateBp, countMarks } from "@uteach/core";
import { formatMoney, intlLocale, locales, type Locale } from "@uteach/i18n";
import { Bot, InlineKeyboard, InputFile, Keyboard, type BotConfig, type Context } from "grammy";
import type { BotState, SubjectRow, WorkerDb } from "./db";
import {
  addDays,
  formatDay,
  formatTime,
  localeFromTelegram,
  todayIn,
  toLocale,
  translator,
  type Translate,
} from "./i18n";
import { receiptPdf } from "./receipt";

/**
 * The uteach bot for students and parents (17): /start → language → share contact → linked to every matching
 * student, guardian and staff member across centers; then a menu with schedule, attendance and payments per
 * child (a child picker and a center switcher when needed), scores (M6) and settings. Staff only get alerts.
 * Every read goes through `worker.*` functions scoped to the Telegram user's own links.
 */
export type BotDeps = {
  db: WorkerDb;
  log?: (line: string) => void;
};

type Item = "s" | "a" | "p";
const MAX_TEXT = 4000;

type Turn = {
  uid: number;
  state: BotState & { staff?: boolean };
  locale: Locale;
  t: Translate;
};

export function createBot(token: string, deps: BotDeps, config?: BotConfig<Context>): Bot {
  const { db } = deps;
  const log = deps.log ?? ((line) => console.info(line));
  const bot = new Bot(token, config);

  async function turn(ctx: Context): Promise<Turn | null> {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== "private") return null;
    const state = ((await db.getSession(from.id)) ?? {}) as Turn["state"];
    const locale = toLocale(state.locale ?? localeFromTelegram(from.language_code));
    return { uid: from.id, state, locale, t: translator(locale) };
  }

  const save = (tu: Turn) => db.setSession(tu.uid, tu.state);

  function languagePicker() {
    const keyboard = new InlineKeyboard();
    for (const l of locales) keyboard.text(translator(l)(`locale.${l}`), `l:${l}`);
    return keyboard;
  }

  async function askLanguage(ctx: Context) {
    const header = locales.map((l) => translator(l)("bot.chooseLanguage")).join(" · ");
    await ctx.reply(header, { reply_markup: languagePicker() });
  }

  async function askContact(ctx: Context, tu: Turn, key = "bot.shareContact") {
    await ctx.reply(tu.t(key), {
      reply_markup: new Keyboard()
        .requestContact(tu.t("bot.shareContactButton"))
        .resized()
        .oneTime(),
    });
  }

  /** The user's students in the active center (all of them when there is only one center). */
  async function scope(tu: Turn) {
    const all = await db.subjects(tu.uid);
    const centers = [...new Map(all.map((s) => [s.center_id, s.center_name])).entries()].map(
      ([id, name]) => ({ id, name }),
    );
    let active: string | null = centers.length === 1 ? centers[0]!.id : null;
    if (centers.length > 1 && centers.some((c) => c.id === tu.state.activeCenterId)) {
      active = tu.state.activeCenterId ?? null;
    }
    return { all, centers, active, subjects: all.filter((s) => s.center_id === active) };
  }

  const backKeyboard = (t: Translate) => new InlineKeyboard().text(t("bot.back"), "m:menu");

  async function showMenu(ctx: Context, tu: Turn) {
    const sc = await scope(tu);
    if (sc.all.length === 0) {
      if (tu.state.staff) {
        await ctx.reply(tu.t("bot.settingsTitle"), {
          reply_markup: new InlineKeyboard().text(tu.t("bot.menuSettings"), "m:o"),
        });
      } else {
        await ctx.reply(tu.t("bot.notLinked"));
      }
      return;
    }
    if (!sc.active) {
      await pickCenter(ctx, tu, sc.centers);
      return;
    }
    const keyboard = new InlineKeyboard()
      .text(tu.t("bot.menuSchedule"), "m:s")
      .text(tu.t("bot.menuAttendance"), "m:a")
      .row()
      .text(tu.t("bot.menuPayments"), "m:p")
      .text(tu.t("bot.menuScores"), "m:x")
      .row()
      .text(tu.t("bot.menuSettings"), "m:o");
    if (sc.centers.length > 1) keyboard.row().text(tu.t("bot.menuCenter"), "m:c");
    const center = sc.centers.find((c) => c.id === sc.active)!;
    const header =
      sc.centers.length > 1 ? `${tu.t("bot.centerChosen", { center: center.name })}\n` : "";
    await ctx.reply(`${header}${tu.t("bot.menu")}`, { reply_markup: keyboard });
  }

  async function pickCenter(ctx: Context, tu: Turn, centers: { id: string; name: string }[]) {
    const keyboard = new InlineKeyboard();
    for (const c of centers) keyboard.text(c.name, `c:${c.id}`).row();
    await ctx.reply(tu.t("bot.pickCenter"), { reply_markup: keyboard });
  }

  async function openItem(ctx: Context, tu: Turn, item: Item) {
    const sc = await scope(tu);
    if (!sc.active) return showMenu(ctx, tu);
    if (sc.subjects.length === 1) return runItem(ctx, tu, item, sc.subjects[0]!);
    const keyboard = new InlineKeyboard();
    for (const s of sc.subjects) keyboard.text(s.student_name, `s:${item}:${s.student_id}`).row();
    await ctx.reply(tu.t("bot.pickStudent"), { reply_markup: keyboard });
  }

  const clip = (text: string) =>
    text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;

  async function runItem(ctx: Context, tu: Turn, item: Item, subject: SubjectRow) {
    const { t, locale } = tu;
    const today = todayIn(subject.timezone);
    if (item === "s") {
      const to = addDays(today, 6);
      const lessons = await db.schedule(tu.uid, subject.student_id, today, to);
      const lines = lessons.map((l) => {
        const parts = [
          `${formatDay(l.local_date, locale)} ${formatTime(l.starts_at, l.timezone)}`,
          l.group_name,
        ];
        if (l.room_name) parts.push(l.room_name);
        if (l.teacher_name) parts.push(l.teacher_name);
        const line = parts.join(" · ");
        return l.status === "cancelled" ? `${line} — ${t("bot.scheduleCancelled")}` : line;
      });
      const title = t("bot.scheduleTitle", {
        student: subject.student_name,
        from: formatDay(today, locale),
        to: formatDay(to, locale),
      });
      const body = lines.length ? lines.join("\n") : t("bot.scheduleEmpty");
      await ctx.reply(clip(`${title}\n\n${body}`), { reply_markup: backKeyboard(t) });
      return;
    }
    if (item === "a") {
      const from = `${today.slice(0, 8)}01`;
      const marks = await db.attendance(tu.uid, subject.student_id, from, today);
      const title = t("bot.attendanceTitle", {
        student: subject.student_name,
        from: formatDay(from, locale),
      });
      if (marks.length === 0) {
        await ctx.reply(`${title}\n\n${t("bot.attendanceEmpty")}`, {
          reply_markup: backKeyboard(t),
        });
        return;
      }
      const lines = marks.map(
        (m) =>
          `${formatDay(m.local_date, locale)} · ${m.group_name} · ${t(`bot.attendanceStatus.${m.status}`)}`,
      );
      const bp = attendanceRateBp(countMarks(marks.map((m) => m.status)));
      const rate =
        bp === null
          ? "—"
          : new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(
              bp / 100,
            );
      await ctx.reply(
        clip(`${title}\n\n${lines.join("\n")}\n\n${t("bot.attendanceRate", { rate })}`),
        {
          reply_markup: backKeyboard(t),
        },
      );
      return;
    }
    const summary = await db.payments(tu.uid, subject.student_id);
    const money = (minor: bigint) => formatMoney(minor, summary.currency, locale);
    const balance = BigInt(summary.balance);
    const lines = [t("bot.paymentsTitle", { student: subject.student_name }), ""];
    if (balance < 0n) lines.push(t("bot.balanceDebt", { amount: money(-balance) }));
    else if (balance > 0n) lines.push(t("bot.balanceCredit", { amount: money(balance) }));
    else lines.push(t("bot.balanceZero"));
    if (summary.debts.length) {
      lines.push("", t("bot.debtsTitle"));
      for (const d of summary.debts) {
        const values = { amount: money(BigInt(d.outstanding)), date: formatDay(d.dueDate, locale) };
        lines.push(
          d.daysOverdue > 0
            ? t("bot.debtOverdue", { ...values, days: d.daysOverdue })
            : t("bot.debtLine", values),
        );
      }
    }
    const keyboard = new InlineKeyboard();
    lines.push("", summary.payments.length ? t("bot.paymentsList") : t("bot.noPayments"));
    for (const p of summary.payments) {
      const day = todayIn(subject.timezone, new Date(p.paidAt));
      lines.push(
        t("bot.paymentLine", {
          date: formatDay(day, locale),
          amount: money(BigInt(p.amount)),
          receiptNo: p.receiptNo,
        }),
      );
      keyboard.text(t("bot.receiptButton", { receiptNo: p.receiptNo }), `r:${p.paymentId}`).row();
    }
    keyboard.text(t("bot.back"), "m:menu");
    await ctx.reply(clip(lines.join("\n")), { reply_markup: keyboard });
  }

  // /start [c_{slug}] → language picker.
  bot.command("start", async (ctx) => {
    const tu = await turn(ctx);
    if (!tu) return;
    const param = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (/^c_[a-z0-9-]{2,63}$/.test(param)) {
      tu.state.startCenterId = await db.centerBySlug(param.slice(2));
      await save(tu);
    }
    await askLanguage(ctx);
  });

  bot.command("menu", async (ctx) => {
    const tu = await turn(ctx);
    if (tu) await showMenu(ctx, tu);
  });

  bot.callbackQuery(/^l:(uz|ru|en)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    tu.locale = toLocale(ctx.match[1]);
    tu.t = translator(tu.locale);
    tu.state.locale = tu.locale;
    await save(tu);
    await db.setLocale(tu.uid, tu.locale);
    const sc = await scope(tu);
    if (sc.all.length > 0 || tu.state.staff) await showMenu(ctx, tu);
    else await askContact(ctx, tu);
  });

  bot.on("message:contact", async (ctx) => {
    const tu = await turn(ctx);
    if (!tu) return;
    const contact = ctx.message.contact;
    // Only the user's own number: a forwarded or picked contact has another (or no) user_id.
    if (contact.user_id !== ctx.from.id) {
      await askContact(ctx, tu, "bot.notYourContact");
      return;
    }
    const phone = `+${contact.phone_number.replace(/\D/g, "")}`;
    const links = await db.linkContact(tu.uid, ctx.chat.id, phone, tu.locale);
    const remove = { reply_markup: { remove_keyboard: true as const } };
    if (links.length === 0) {
      await ctx.reply(tu.t("bot.noMatch"), remove);
      return;
    }
    const subjects = await db.subjects(tu.uid);
    const staffCenters = [
      ...new Set(links.filter((l) => l.subject === "staff").map((l) => l.center_name)),
    ];
    const lines: string[] = [];
    if (subjects.length) {
      const names = subjects
        .map((s) => tu.t("bot.linkedItem", { name: s.student_name, center: s.center_name }))
        .join(", ");
      lines.push(tu.t("bot.linked", { names }));
    }
    if (staffCenters.length)
      lines.push(tu.t("bot.staffLinked", { centers: staffCenters.join(", ") }));
    tu.state.staff = staffCenters.length > 0;
    const centerIds = new Set(subjects.map((s) => s.center_id));
    if (tu.state.startCenterId && centerIds.has(tu.state.startCenterId)) {
      tu.state.activeCenterId = tu.state.startCenterId;
    } else if (centerIds.size === 1) {
      tu.state.activeCenterId = [...centerIds][0]!;
    }
    await save(tu);
    await ctx.reply(lines.join("\n"), remove);
    if (subjects.length) await showMenu(ctx, tu);
  });

  bot.callbackQuery(/^m:(menu|s|a|p|x|o|c)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    const what = ctx.match[1];
    if (what === "menu") return showMenu(ctx, tu);
    if (what === "s" || what === "a" || what === "p") return openItem(ctx, tu, what);
    if (what === "x") {
      await ctx.reply(tu.t("bot.scoresSoon"), { reply_markup: backKeyboard(tu.t) });
      return;
    }
    if (what === "c") return pickCenter(ctx, tu, (await scope(tu)).centers);
    await ctx.reply(tu.t("bot.settingsTitle"), {
      reply_markup: new InlineKeyboard()
        .text(tu.t("bot.settingsLanguage"), "o:lang")
        .row()
        .text(tu.t("bot.settingsUnlink"), "u:ask")
        .row()
        .text(tu.t("bot.back"), "m:menu"),
    });
  });

  bot.callbackQuery(/^s:([sap]):([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    const subject = (await db.subjects(tu.uid)).find((s) => s.student_id === ctx.match[2]);
    if (!subject) return showMenu(ctx, tu);
    await runItem(ctx, tu, ctx.match[1] as Item, subject);
  });

  bot.callbackQuery(/^c:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    tu.state.activeCenterId = ctx.match[1]!;
    await save(tu);
    await showMenu(ctx, tu);
  });

  bot.callbackQuery(/^r:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    const data = await db.receiptData(ctx.match[1]!, tu.uid);
    const pdf = await receiptPdf(data, tu.locale);
    await ctx.replyWithDocument(new InputFile(pdf, `${data.receiptNo}.pdf`));
  });

  bot.callbackQuery("o:lang", async (ctx) => {
    await ctx.answerCallbackQuery();
    await askLanguage(ctx);
  });

  bot.callbackQuery("u:ask", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    await ctx.reply(tu.t("bot.unlinkConfirm"), {
      reply_markup: new InlineKeyboard()
        .text(tu.t("bot.unlinkYes"), "u:yes")
        .text(tu.t("bot.unlinkNo"), "m:menu"),
    });
  });

  bot.callbackQuery("u:yes", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tu = await turn(ctx);
    if (!tu) return;
    await db.unlink(tu.uid);
    tu.state = { locale: tu.locale };
    await save(tu);
    await ctx.reply(tu.t("bot.unlinked"));
  });

  // Blocking the bot ends the user's links; the outbox then skips Telegram for them (SMS fallback applies).
  bot.on("my_chat_member", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const status = ctx.myChatMember.new_chat_member.status;
    if (status === "kicked") {
      const n = await db.unlink(ctx.myChatMember.from.id);
      log(`[bot] user blocked the bot; ${n} link(s) ended`);
    }
  });

  bot.on("message", async (ctx) => {
    const tu = await turn(ctx);
    if (!tu) return;
    const sc = await scope(tu);
    if (sc.all.length > 0 || tu.state.staff) await showMenu(ctx, tu);
    else await askLanguage(ctx);
  });

  bot.catch(async (err) => {
    log(`[bot] update ${err.ctx.update.update_id} failed: ${String(err.error)}`);
    try {
      const locale = toLocale(localeFromTelegram(err.ctx.from?.language_code));
      if (err.ctx.chat?.type === "private") await err.ctx.reply(translator(locale)("bot.error"));
    } catch {
      // The chat may be gone; nothing else to do.
    }
  });

  return bot;
}
