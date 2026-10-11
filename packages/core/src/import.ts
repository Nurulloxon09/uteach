/**
 * Excel import helpers (10-platform-onboarding): pure parsing of header names and cell values.
 * Files come from many sources, so cells are read leniently and normalised; anything unclear is an error
 * the user sees with its row and column, never a silent guess.
 */

export const IMPORT_FIELDS = {
  students: [
    "fullName",
    "phone",
    "birthDate",
    "gender",
    "school",
    "branch",
    "externalRef",
    "guardianName",
    "guardianPhone",
    "relation",
  ],
  groups: [
    "name",
    "course",
    "level",
    "branch",
    "teacher",
    "room",
    "weekdays",
    "startTime",
    "duration",
    "startDate",
    "endDate",
    "capacity",
    "price",
    "cycleLessons",
  ],
  enrollments: ["studentRef", "studentPhone", "studentName", "group", "branch", "startDate"],
} as const;

export type ImportKind = keyof typeof IMPORT_FIELDS;
export type ImportField<K extends ImportKind> = (typeof IMPORT_FIELDS)[K][number];

export const REQUIRED_FIELDS: { [K in ImportKind]: readonly ImportField<K>[] } = {
  students: ["fullName"],
  groups: ["name", "course", "startDate"],
  enrollments: ["group"],
};

/** Common header spellings beyond the template's own (template headers come from the i18n catalogs). */
export const HEADER_ALIASES: Record<string, string[]> = {
  fullName: [
    "name",
    "full name",
    "student",
    "student name",
    "fio",
    "fish",
    "ism",
    "ism familiya",
    "фио",
    "имя",
    "ученик",
    "familiya ism",
  ],
  phone: ["phone", "telephone", "mobile", "tel", "telefon", "телефон", "student phone"],
  birthDate: ["birthday", "date of birth", "dob", "tugilgan kun", "дата рождения", "день рождения"],
  gender: ["sex", "gender", "jins", "пол"],
  school: ["school", "maktab", "школа"],
  branch: ["branch", "filial", "филиал"],
  externalRef: ["id", "external id", "student id", "ref", "code", "kod", "код"],
  guardianName: ["parent", "parent name", "guardian", "ota ona", "родитель", "мама", "папа"],
  guardianPhone: ["parent phone", "guardian phone", "ota ona telefoni", "телефон родителя"],
  relation: ["relation", "relationship", "qarindoshlik", "кем приходится"],
  name: ["group", "group name", "guruh", "группа"],
  course: ["course", "kurs", "курс", "subject", "fan", "предмет"],
  level: ["level", "daraja", "уровень"],
  teacher: ["teacher", "oqituvchi", "преподаватель", "учитель"],
  room: ["room", "xona", "кабинет", "аудитория"],
  weekdays: ["days", "weekdays", "kunlar", "дни"],
  startTime: ["time", "start time", "vaqt", "время"],
  duration: ["duration", "minutes", "length", "davomiyligi", "длительность"],
  startDate: ["start", "start date", "boshlanish", "дата начала", "начало"],
  endDate: ["end", "end date", "tugash", "дата окончания"],
  capacity: ["capacity", "size", "sigim", "мест", "вместимость"],
  price: ["price", "fee", "narx", "цена", "стоимость"],
  cycleLessons: ["lessons", "lessons per cycle", "darslar soni", "уроков"],
  studentRef: ["student id", "id", "ref", "code"],
  studentPhone: ["student phone", "phone", "telefon", "телефон"],
  studentName: ["student", "student name", "name", "fio", "фио", "ism"],
  group: ["group", "group name", "guruh", "группа"],
};

/** Lower-case, apostrophes and punctuation removed, single spaces: "F.I.Sh." → "fish". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[ʻʼ‘’'`]/g, "")
    .replace(/[.,:;*()[\]_/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Picks a column for each field: an exact match with one of the field's labels (template headers in all
 * languages, then aliases). Each column is used at most once; unmatched fields stay null.
 */
export function guessMapping(
  headers: readonly string[],
  labels: Record<string, readonly string[]>,
  fields: readonly string[],
): Record<string, number | null> {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Record<string, number | null> = {};
  for (const field of fields) {
    const candidates = [...(labels[field] ?? []), ...(HEADER_ALIASES[field] ?? [])].map(
      normalizeHeader,
    );
    let found: number | null = null;
    for (const candidate of candidates) {
      const index = normalized.findIndex((h, i) => h === candidate && !used.has(i));
      if (index >= 0) {
        found = index;
        break;
      }
    }
    if (found !== null) used.add(found);
    mapping[field] = found;
  }
  return mapping;
}

/** A cell as trimmed text ("" for empty). Numbers keep their digits (phones typed as numbers). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // exceljs rich text / hyperlinks / formulas
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText))
      return v.richText
        .map((r) => r.text)
        .join("")
        .trim();
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    return "";
  }
  return String(value).trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  if (y < 1900 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * A calendar day from a cell: an Excel date, an Excel serial number, "2026-10-12", or day-first
 * "12.10.2026" / "12/10/2026" (the usual order in Uzbekistan and Russia). Returns null if unclear.
 */
export function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial: days since 1899-12-30.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const text = cellText(value);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** "18:00", "18.00", "9:30", an Excel time (fraction of a day) or a Date → "HH:mm". */
export function parseTimeCell(value: unknown): string | null {
  if (value instanceof Date) return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(cellText(value));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** A whole number in [min, max], or null. Empty cells are `undefined` (not given). */
export function parseIntCell(value: unknown, min: number, max: number): number | null | undefined {
  const text = cellText(value).replace(/\s/g, "");
  if (text === "") return undefined;
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

const GENDERS: Record<string, "male" | "female"> = {
  m: "male",
  male: "male",
  man: "male",
  boy: "male",
  erkak: "male",
  "o'g'il": "male",
  ogil: "male",
  м: "male",
  муж: "male",
  мужской: "male",
  мальчик: "male",
  f: "female",
  female: "female",
  woman: "female",
  girl: "female",
  ayol: "female",
  qiz: "female",
  ж: "female",
  жен: "female",
  женский: "female",
  девочка: "female",
};

export function parseGenderCell(value: unknown): "male" | "female" | null | undefined {
  const text = normalizeHeader(cellText(value)).replace(/ /g, "");
  if (text === "") return undefined;
  return GENDERS[text] ?? null;
}

const RELATIONS: Record<string, "mother" | "father" | "parent" | "other"> = {
  mother: "mother",
  mom: "mother",
  ona: "mother",
  онаси: "mother",
  мама: "mother",
  мать: "mother",
  father: "father",
  dad: "father",
  ota: "father",
  папа: "father",
  отец: "father",
  parent: "parent",
  "ota ona": "parent",
  родитель: "parent",
  other: "other",
  boshqa: "other",
  другое: "other",
};

export function parseRelationCell(
  value: unknown,
): "mother" | "father" | "parent" | "other" | null | undefined {
  const text = normalizeHeader(cellText(value));
  if (text === "") return undefined;
  return RELATIONS[text] ?? null;
}
