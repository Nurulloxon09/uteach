/**
 * Fake data for /dev/ui (developer page, never shown to users). Mixes Uzbek, Russian and English names so
 * both fonts (Plus Jakarta Sans + Manrope for Cyrillic) and money formatting get exercised.
 */
import type { Locale } from "@uteach/i18n";

export type FakeMember = {
  id: string;
  name: string;
  phone: string;
  role: "owner" | "admin" | "teacher";
  status: "active" | "invited" | "disabled";
  branch: string;
  balanceMinor: bigint;
};

export const FAKE_MEMBERS: FakeMember[] = [
  { id: "1", name: "Malika Karimova", phone: "+998 90 123 45 67", role: "owner", status: "active", branch: "Chilonzor", balanceMinor: 0n },
  { id: "2", name: "Aziz Rahimov", phone: "+998 91 234 56 78", role: "admin", status: "active", branch: "Yunusobod", balanceMinor: 60_000_000n },
  { id: "3", name: "Анна Смирнова", phone: "+998 93 345 67 89", role: "teacher", status: "active", branch: "Chilonzor", balanceMinor: 49_800_000n },
  { id: "4", name: "Jasur Toshmatov", phone: "+998 94 456 78 90", role: "teacher", status: "invited", branch: "Sergeli", balanceMinor: 0n },
  { id: "5", name: "Дмитрий Ким", phone: "+998 95 567 89 01", role: "teacher", status: "active", branch: "Yunusobod", balanceMinor: 125_000_000n },
  { id: "6", name: "Nilufar Qodirova", phone: "+998 97 678 90 12", role: "admin", status: "disabled", branch: "Chilonzor", balanceMinor: 0n },
  { id: "7", name: "Sardor Oʻrinboyev", phone: "+998 98 789 01 23", role: "teacher", status: "active", branch: "Sergeli", balanceMinor: 72_500_000n },
  { id: "8", name: "Emily Carter", phone: "+998 99 890 12 34", role: "teacher", status: "invited", branch: "Yunusobod", balanceMinor: 0n },
  { id: "9", name: "Гулноза Юсупова", phone: "+998 90 901 23 45", role: "teacher", status: "active", branch: "Chilonzor", balanceMinor: 30_000_000n },
];

export const FAKE_CENTERS = [
  { id: "c1", name: "Bright English" },
  { id: "c2", name: "IELTS Pro Academy" },
];

export const FAKE_BRANCHES = ["Chilonzor", "Yunusobod", "Sergeli", "Mirzo Ulugʻbek"];

/** Strings that have no real i18n key yet (patterns only appear in later milestones). */
export const DEV_TEXT: Record<
  Locale,
  { attendance: [string, string, string, string]; lesson: string; group: string; retry: string; patterns: string; kit: string; specimen: string }
> = {
  en: {
    attendance: ["Present", "Late", "Absent", "Excused"],
    lesson: "IELTS 6.5 · Mon/Wed/Fri 18:00",
    group: "Room 3 · 12 students",
    retry: "Try again",
    patterns: "Patterns",
    kit: "UI kit",
    specimen: "The quick brown fox jumps over the lazy dog. 0123456789 · 600 000 so'm",
  },
  uz: {
    attendance: ["Keldi", "Kechikdi", "Kelmadi", "Sababli"],
    lesson: "IELTS 6.5 · Du/Chor/Ju 18:00",
    group: "3-xona · 12 oʻquvchi",
    retry: "Qayta urinish",
    patterns: "Patternlar",
    kit: "UI toʻplami",
    specimen: "Oʻquvchilar gʻayrat bilan shugʻullanishdi. Toʻlov: 600 000 soʻm · 0123456789",
  },
  ru: {
    attendance: ["Был", "Опоздал", "Не был", "Уважительно"],
    lesson: "IELTS 6.5 · Пн/Ср/Пт 18:00",
    group: "Кабинет 3 · 12 учеников",
    retry: "Повторить",
    patterns: "Паттерны",
    kit: "UI-кит",
    specimen: "Съешь же ещё этих мягких французских булок, да выпей чаю. Оплата: 600 000 сум",
  },
};

export const TOKENS = [
  "background",
  "foreground",
  "card",
  "primary",
  "primary-soft",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "border",
  "destructive",
  "success",
  "warning",
  "stat-purple",
  "stat-blue",
  "stat-orange",
  "stat-green",
  "chart-1",
  "chart-2",
  "chart-3",
] as const;

/** Tailwind needs literal class names, so each swatch's class is listed. */
export const TOKEN_CLASS: Record<(typeof TOKENS)[number], string> = {
  background: "bg-background",
  foreground: "bg-foreground",
  card: "bg-card",
  primary: "bg-primary",
  "primary-soft": "bg-primary-soft",
  secondary: "bg-secondary",
  "secondary-foreground": "bg-secondary-foreground",
  muted: "bg-muted",
  "muted-foreground": "bg-muted-foreground",
  accent: "bg-accent",
  border: "bg-border",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
  "stat-purple": "bg-stat-purple",
  "stat-blue": "bg-stat-blue",
  "stat-orange": "bg-stat-orange",
  "stat-green": "bg-stat-green",
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
};
