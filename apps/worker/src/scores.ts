import {
  examGradeLabel,
  formatScore,
  scoreUplift,
  type ExamResultKind,
  type ExamTotalRule,
  type LocalizedLabel,
} from "@uteach/core";
import type { Locale } from "@uteach/i18n";
import { formatDay, type Translate } from "./i18n";

/** One exam type from `worker.bot_scores` (numbers as the database stores them). */
export type ScoreCard = {
  code: string;
  name: string;
  totalRule: ExamTotalRule;
  sections: { key: string; label: LocalizedLabel }[];
  latest: {
    kind: ExamResultKind;
    takenOn: string;
    scores: Record<string, number>;
    total: number | null;
  } | null;
  target: { total: number | null; examDate: string | null } | null;
  recent: { takenOn: string; kind: ExamResultKind; total: number }[];
};

function daysBetween(from: string, to: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** A total with its CEFR level or Milliy sertifikat grade, if the preset has one. */
function totalText(card: ScoreCard, total: number, t: Translate): string {
  const value = formatScore(total, card.totalRule);
  const grade = examGradeLabel(card.code, total);
  if (card.code === "cefr" && grade) return `${value} (${t(`exams.grade.${grade}`)})`;
  if (card.code === "milliy") return `${value} (${grade ?? t("exams.grade.noCertificate")})`;
  return value;
}

/** Totals oldest first, each after the first with ↑ or ↓ against the one before it. */
function recentText(card: ScoreCard): string {
  return card.recent
    .map((r, i) => {
      const value = formatScore(r.total, card.totalRule);
      const before = card.recent[i - 1];
      if (!before || before.total === r.total) return value;
      return `${value}${r.total > before.total ? "↑" : "↓"}`;
    })
    .join(" · ");
}

/**
 * The Scores item (17, M6 plan): per exam type the latest result (sections, total with level or grade), target and
 * gap, exam day with days left, and the last five totals with arrows.
 */
export function scoresText(
  student: string,
  cards: readonly ScoreCard[],
  today: string,
  locale: Locale,
  t: Translate,
): string {
  const title = t("bot.scoresTitle", { student });
  if (cards.length === 0) return `${title}\n\n${t("bot.scoresEmpty")}`;
  const blocks = cards.map((card) => {
    const sectionRule = card.totalRule === "ielts_band" ? "ielts_band" : "sum";
    const lines = [`📘 ${card.name}`];
    const latest = card.latest;
    if (latest) {
      lines.push(
        t("bot.scoresLatest", {
          kind: t(`exams.kind.${latest.kind}`),
          date: formatDay(latest.takenOn, locale),
        }),
      );
      const sections = card.sections
        .filter((s) => typeof latest.scores[s.key] === "number")
        .map((s) => `${s.label[locale]} ${formatScore(latest.scores[s.key], sectionRule)}`);
      if (sections.length > 1 || (sections.length === 1 && latest.total === null)) {
        lines.push(sections.join(" · "));
      }
      if (latest.total !== null) {
        lines.push(t("bot.scoresTotal", { total: totalText(card, latest.total, t) }));
      }
    } else {
      lines.push(t("bot.scoresNone"));
    }
    const target = card.target;
    if (target?.total !== null && target?.total !== undefined) {
      const gap = scoreUplift(target.total, latest?.total ?? null);
      const targetLine = t("bot.scoresTarget", {
        target: formatScore(target.total, card.totalRule),
      });
      if (gap === null) lines.push(targetLine);
      else if (gap <= 0) lines.push(`${targetLine} · ${t("bot.scoresReached")}`);
      else
        lines.push(
          `${targetLine} · ${t("bot.scoresGap", { gap: formatScore(gap, card.totalRule) })}`,
        );
    }
    if (target?.examDate) {
      const days = daysBetween(today, target.examDate);
      const date = formatDay(target.examDate, locale);
      lines.push(
        days >= 0 ? t("bot.scoresExamDay", { date, days }) : t("bot.scoresExamPast", { date }),
      );
    }
    if (card.recent.length > 1) lines.push(t("bot.scoresRecent", { list: recentText(card) }));
    return lines.join("\n");
  });
  return `${title}\n\n${blocks.join("\n\n")}`;
}
