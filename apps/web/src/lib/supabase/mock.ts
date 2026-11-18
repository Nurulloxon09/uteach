import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIn } from "@uteach/core";
import type { Database } from "@uteach/db";
import {
  createInitialMockState,
  IDS,
  MOCK_AUTH_COOKIE,
  type MockDatabaseState,
  type MockRow,
} from "./mock-data";

export type MockCookieAdapter = {
  get: (name: string) => string | undefined;
  set: (
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      secure?: boolean;
      path?: string;
      maxAge?: number;
    },
  ) => void;
  remove: (name: string) => void;
};

type GlobalWithMock = typeof globalThis & { __uteachMockState?: MockDatabaseState };

function getState(): MockDatabaseState {
  const g = globalThis as GlobalWithMock;
  if (!g.__uteachMockState) {
    g.__uteachMockState = createInitialMockState();
  }
  return g.__uteachMockState;
}

type FilterFn = (row: MockRow) => boolean;

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function ilikeMatch(value: unknown, pattern: string): boolean {
  if (value === null || value === undefined) return false;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(String(value));
}

function parseOrClause(clause: string): FilterFn {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of clause) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const fns: FilterFn[] = parts.map((expr) => {
    const firstDot = expr.indexOf(".");
    const secondDot = expr.indexOf(".", firstDot + 1);
    if (firstDot < 0 || secondDot < 0) return () => true;
    const col = expr.slice(0, firstDot);
    const op = expr.slice(firstDot + 1, secondDot);
    const rawVal = expr.slice(secondDot + 1);
    return (row) => {
      const v = row[col];
      if (op === "is" && rawVal === "null") return v === null || v === undefined;
      if (op === "eq") return String(v ?? "") === rawVal;
      if (op === "neq") return String(v ?? "") !== rawVal;
      if (op === "gte") return v !== null && v !== undefined && String(v) >= rawVal;
      if (op === "lte") return v !== null && v !== undefined && String(v) <= rawVal;
      if (op === "ilike") return ilikeMatch(v, rawVal);
      if (op === "in") {
        const items = rawVal.replace(/^\(|\)$/g, "").split(",");
        return items.includes(String(v ?? ""));
      }
      return true;
    };
  });
  return (row) => fns.some((fn) => fn(row));
}

type MockResult<T = unknown> = {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number;
};

function createQueryBuilder(table: string, state: MockDatabaseState) {
  const filters: FilterFn[] = [];
  const orders: { col: string; ascending: boolean; nullsFirst?: boolean }[] = [];
  let limitCount: number | null = null;
  let rangeSlice: [number, number] | null = null;
  let mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  let payload: MockRow | MockRow[] | null = null;
  let singleMode: "none" | "single" | "maybeSingle" = "none";
  let headOnly = false;

  const execute = (): MockResult => {
    const rows = state.tables[table] ?? [];

    if (mode === "insert" || mode === "upsert") {
      const items = (Array.isArray(payload) ? payload : payload ? [payload] : []).map((item) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...item,
      }));
      if (!state.tables[table]) state.tables[table] = [];
      state.tables[table].push(...items);
      const out = singleMode !== "none" ? (items[0] ?? null) : items;
      return { data: out, error: null, count: items.length };
    }

    if (mode === "update") {
      const matched: MockRow[] = [];
      for (const row of rows) {
        if (filters.every((fn) => fn(row))) {
          Object.assign(row, payload ?? {});
          matched.push(row);
        }
      }
      const out = singleMode !== "none" ? (matched[0] ?? null) : matched;
      return { data: out, error: null, count: matched.length };
    }

    if (mode === "delete") {
      const kept: MockRow[] = [];
      const removed: MockRow[] = [];
      for (const row of rows) {
        if (filters.every((fn) => fn(row))) removed.push(row);
        else kept.push(row);
      }
      state.tables[table] = kept;
      const out = singleMode !== "none" ? (removed[0] ?? null) : removed;
      return { data: out, error: null, count: removed.length };
    }

    let result = rows.filter((r) => filters.every((fn) => fn(r)));
    const totalCount = result.length;

    if (orders.length > 0) {
      result = [...result].sort((a, b) => {
        for (const ord of orders) {
          const av = a[ord.col];
          const bv = b[ord.col];
          if ((av === null || av === undefined) && (bv === null || bv === undefined)) continue;
          if (av === null || av === undefined) return ord.nullsFirst ? -1 : 1;
          if (bv === null || bv === undefined) return ord.nullsFirst ? 1 : -1;
          const cmp = compareValues(av, bv);
          if (cmp !== 0) return ord.ascending ? cmp : -cmp;
        }
        return 0;
      });
    }

    if (rangeSlice) {
      result = result.slice(rangeSlice[0], rangeSlice[1] + 1);
    } else if (limitCount !== null) {
      result = result.slice(0, limitCount);
    }

    if (headOnly) {
      return { data: null, error: null, count: totalCount };
    }
    if (singleMode === "single" || singleMode === "maybeSingle") {
      return { data: result[0] ?? null, error: null, count: totalCount };
    }
    return { data: result, error: null, count: totalCount };
  };

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) headOnly = true;
      return builder;
    },
    insert: (values: MockRow | MockRow[]) => {
      mode = "insert";
      payload = values;
      return builder;
    },
    update: (values: MockRow) => {
      mode = "update";
      payload = values;
      return builder;
    },
    upsert: (values: MockRow | MockRow[]) => {
      mode = "upsert";
      payload = values;
      return builder;
    },
    delete: () => {
      mode = "delete";
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return builder;
    },
    neq: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== val);
      return builder;
    },
    gt: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== null && r[col] !== undefined && compareValues(r[col], val) > 0);
      return builder;
    },
    gte: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== null && r[col] !== undefined && compareValues(r[col], val) >= 0);
      return builder;
    },
    lt: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== null && r[col] !== undefined && compareValues(r[col], val) < 0);
      return builder;
    },
    lte: (col: string, val: unknown) => {
      filters.push((r) => r[col] !== null && r[col] !== undefined && compareValues(r[col], val) <= 0);
      return builder;
    },
    like: (col: string, pattern: string) => {
      filters.push((r) => ilikeMatch(r[col], pattern));
      return builder;
    },
    ilike: (col: string, pattern: string) => {
      filters.push((r) => ilikeMatch(r[col], pattern));
      return builder;
    },
    is: (col: string, val: unknown) => {
      if (val === null) filters.push((r) => r[col] === null || r[col] === undefined);
      else filters.push((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    contains: (col: string, vals: unknown[]) => {
      filters.push((r) => {
        const arr = r[col];
        return Array.isArray(arr) && vals.every((v) => arr.includes(v));
      });
      return builder;
    },
    not: (col: string, op: string, val: unknown) => {
      if (op === "is" && val === null) {
        filters.push((r) => r[col] !== null && r[col] !== undefined);
      }
      return builder;
    },
    or: (clause: string) => {
      filters.push(parseOrClause(clause));
      return builder;
    },
    filter: () => builder,
    order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
      orders.push({ col, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
      return builder;
    },
    limit: (n: number) => {
      limitCount = n;
      return builder;
    },
    range: (from: number, to: number) => {
      rangeSlice = [from, to];
      return builder;
    },
    single: () => {
      singleMode = "single";
      return builder;
    },
    maybeSingle: () => {
      singleMode = "maybeSingle";
      return builder;
    },
    then: (
      onFulfilled?: (value: MockResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(execute()).then(onFulfilled, onRejected),
  };

  return builder;
}

function handleRpc(fn: string, args: Record<string, unknown>, state: MockDatabaseState) {
  const tz = "Asia/Tashkent";
  const today = todayIn(tz);
  const nowIso = new Date().toISOString();

  const wrap = (data: unknown) => {
    let isSingle = false;
    const chain: Record<string, unknown> = {
      single: () => {
        isSingle = true;
        return chain;
      },
      maybeSingle: () => {
        isSingle = true;
        return chain;
      },
      then: (
        onFulfilled?: (value: MockResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => {
        const resolved = isSingle && Array.isArray(data) ? (data[0] ?? null) : data;
        return Promise.resolve({ data: resolved, error: null }).then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  switch (fn) {
    case "public_plans":
      return wrap(
        (state.tables.plans ?? [])
          .filter((p) => p.is_public && !p.archived_at && p.code !== "trial")
          .sort((a, b) => compareValues(a.sort_order, b.sort_order)),
      );

    case "dashboard_owner":
      return wrap({
        today: {
          lessons: 3,
          marked_lessons: 1,
          present: 1,
          late: 0,
          absent: 1,
          payments_amount: 85_000_000,
          payments_count: 1,
        },
        month: {
          charged: 316_500_000,
          collected: 256_500_000,
        },
        debt: {
          total: 155_000_000,
          students: 2,
          buckets: { "0-30": 60_000_000, "31-60": 95_000_000, "61-90": 0, "90+": 0 },
        },
        students: { active: 6, active_last_month: 5 },
        leads: { new: 4, won: 1 },
        branches: [
          {
            id: IDS.branch1,
            name: "Chilonzor",
            lessons_today: 2,
            active_students: 4,
            collected_month: 161_500_000,
            debt: 60_000_000,
          },
          {
            id: IDS.branch2,
            name: "Yunusobod",
            lessons_today: 1,
            active_students: 2,
            collected_month: 95_000_000,
            debt: 95_000_000,
          },
        ],
      });

    case "dashboard_admin":
      return wrap({
        lessons: (state.tables.lessons ?? [])
          .filter((l) => l.local_date === today)
          .map((l) => ({
            id: l.id,
            group: (l.groups as { name?: string } | undefined)?.name ?? "Group",
            starts_at: l.starts_at,
            ends_at: l.ends_at,
            timezone: tz,
            teacher: "Nurulloxon",
            expected: 2,
            marked: l.id === IDS.lesson2 ? 2 : 0,
          })),
        debtors: [
          { student_id: IDS.student6, name: "Гулноза Юсупова", debt: 95_000_000, days_overdue: 35 },
          { student_id: IDS.student3, name: "Тимур Абдуллаев", debt: 60_000_000, days_overdue: 12 },
        ],
        follow_ups: [
          {
            lead_id: IDS.lead1,
            name: "Behruz Alimov",
            body: "Call parent to confirm IELTS placement test time",
            due_at: `${today}T09:00:00Z`,
          },
        ],
        follow_ups_overdue: 1,
        trials: [
          {
            lead_id: IDS.lead3,
            name: "Farrux Xolmatov",
            group: "SAT Math & Verbal",
            starts_at: `${today}T11:00:00Z`,
            timezone: tz,
          },
        ],
        no_telegram: 2,
        conflicts: 0,
      });

    case "dashboard_teacher":
      return wrap({
        to_mark: [
          {
            id: IDS.lesson1,
            group: "IELTS 7.0 Evening",
            starts_at: `${today}T13:30:00Z`,
            timezone: tz,
            closes_at: `${addDays(today, 2)}T15:00:00Z`,
            expected: 2,
            marked: 0,
          },
        ],
        groups: [
          { id: IDS.group1, name: "IELTS 7.0 Evening", students: 2, last_score: addDays(today, -2) },
        ],
        scores_to_enter: [
          { id: IDS.group1, name: "IELTS 7.0 Evening", last_score: addDays(today, -2) },
        ],
      });

    case "my_follow_ups":
      return wrap([
        {
          activity_id: "la1",
          lead_id: IDS.lead1,
          lead_name: "Behruz Alimov",
          body: "Call parent to confirm IELTS placement test time",
          due_at: `${today}T09:00:00Z`,
          is_overdue: false,
        },
        {
          activity_id: "la2",
          lead_id: IDS.lead2,
          lead_name: "Kamola Saidova",
          body: "Follow up on afternoon General English group",
          due_at: `${addDays(today, -1)}T12:00:00Z`,
          is_overdue: true,
        },
      ]);

    case "course_default_prices":
      return wrap([
        { course_id: IDS.courseIelts, default_price_amount: 85_000_000 },
        { course_id: IDS.courseGeneral, default_price_amount: 60_000_000 },
        { course_id: IDS.courseSat, default_price_amount: 95_000_000 },
      ]);

    case "student_balance": {
      const sid = String(args.p_student_id ?? "");
      if (sid === IDS.student3) return wrap("-60000000");
      if (sid === IDS.student6) return wrap("-95000000");
      return wrap("0");
    }

    case "lesson_attendance_stats": {
      const ids = Array.isArray(args.p_lesson_ids) ? (args.p_lesson_ids as string[]) : [];
      return wrap(
        ids.map((id) => {
          const rows = (state.tables.attendance ?? []).filter((a) => a.lesson_id === id);
          return {
            lesson_id: id,
            expected: 2,
            marked: rows.length,
            absent: rows.filter((a) => a.status === "absent").length,
          };
        }),
      );
    }

    case "attendance_lesson": {
      const lid = String(args.p_lesson_id ?? "");
      const lesson = (state.tables.lessons ?? []).find((l) => l.id === lid);
      if (!lesson) return wrap(null);
      const group = (state.tables.groups ?? []).find((g) => g.id === lesson.group_id);
      const room = (state.tables.rooms ?? []).find((r) => r.id === lesson.room_id);
      const teacher = (state.tables.memberships ?? []).find(
        (m) => m.id === lesson.teacher_membership_id,
      );
      return wrap([
        {
          lesson_id: lesson.id,
          group_id: lesson.group_id,
          group_name: group?.name ?? "Group",
          local_date: lesson.local_date,
          starts_at: lesson.starts_at,
          ends_at: lesson.ends_at,
          opens_at: lesson.starts_at,
          closes_at: new Date(Date.parse(String(lesson.ends_at)) + 48 * 3_600_000).toISOString(),
          timezone: tz,
          room_name: room?.name ?? null,
          teacher_name: teacher?.display_name ?? "Nurulloxon",
          status: lesson.status,
          is_substitute: lesson.original_teacher_membership_id !== null,
          topic: lesson.topic ?? null,
          mode: lesson.status === "cancelled" ? "cancelled" : "admin",
        },
      ]);
    }

    case "attendance_sheet": {
      const lid = String(args.p_lesson_id ?? "");
      const lesson = (state.tables.lessons ?? []).find((l) => l.id === lid);
      if (!lesson) return wrap([]);
      const enrolled = (state.tables.enrollments ?? []).filter(
        (e) => e.group_id === lesson.group_id && e.status !== "ended",
      );
      const marks = (state.tables.attendance ?? []).filter((a) => a.lesson_id === lid);
      return wrap(
        enrolled.map((e) => {
          const st = (state.tables.students ?? []).find((s) => s.id === e.student_id);
          const mark = marks.find((m) => m.student_id === e.student_id);
          return {
            student_id: e.student_id,
            lead_trial_id: null,
            trial_feedback: null,
            full_name: st?.full_name ?? "Student",
            is_expected: true,
            status: mark?.status ?? null,
            late_minutes: mark?.late_minutes ?? null,
            note: mark?.note ?? null,
          };
        }),
      );
    }

    case "attendance_matrix": {
      const gid = String(args.p_group_id ?? "");
      const groupLessons = (state.tables.lessons ?? []).filter((l) => l.group_id === gid);
      const enrolled = (state.tables.enrollments ?? []).filter(
        (e) => e.group_id === gid && e.status !== "ended",
      );
      const rows: MockRow[] = [];
      for (const e of enrolled) {
        const st = (state.tables.students ?? []).find((s) => s.id === e.student_id);
        for (const l of groupLessons) {
          const mark = (state.tables.attendance ?? []).find(
            (a) => a.lesson_id === l.id && a.student_id === e.student_id,
          );
          rows.push({
            student_id: e.student_id,
            full_name: st?.full_name ?? "Student",
            lesson_id: l.id,
            day_state: "expected",
            status: mark?.status ?? null,
            late_minutes: mark?.late_minutes ?? null,
            note: mark?.note ?? null,
          });
        }
      }
      return wrap(rows);
    }

    case "score_entries":
      return wrap([
        {
          group_id: IDS.group1,
          group_name: "IELTS 7.0 Evening",
          exam_type_id: IDS.examIelts,
          exam_name: "IELTS",
          kind: "mock",
          taken_on: addDays(today, -2),
          students: 2,
          average_total: 7.0,
        },
        {
          group_id: IDS.group1,
          group_name: "IELTS 7.0 Evening",
          exam_type_id: IDS.examIelts,
          exam_name: "IELTS",
          kind: "diagnostic",
          taken_on: `${today.slice(0, 7)}-01`,
          students: 1,
          average_total: 6.0,
        },
      ]);

    case "group_roster": {
      const gid = String(args.p_group_id ?? "");
      return wrap(
        (state.tables.enrollments ?? [])
          .filter((e) => e.group_id === gid && e.status !== "ended")
          .map((e) => ({
            student_id: e.student_id,
            full_name: (e.students as { full_name?: string } | undefined)?.full_name ?? "Student",
          })),
      );
    }

    case "broadcast_stats": {
      const ids = Array.isArray(args.p_broadcast_ids) ? (args.p_broadcast_ids as string[]) : [];
      return wrap(
        ids.map((id) => ({
          broadcast_id: id,
          pending: 0,
          sent: 4,
          failed: 0,
          skipped: 0,
          cancelled: 0,
        })),
      );
    }

    case "notification_overview":
      return wrap({
        activeStudents: 6,
        reachedStudents: 4,
        linkedStudents: 2,
        linkedGuardians: 3,
        linkedStaff: 1,
        smsThisMonth: 18,
      });

    case "center_usage":
      return wrap({
        activeStudents: 6,
        studentLimit: 200,
        branches: 2,
        branchLimit: 3,
        planCode: "growth",
        planName: "Growth",
      });

    case "worker_health":
      return wrap([{ service: "worker", last_beat_at: nowIso }]);

    case "lead_duplicates":
      return wrap([]);

    case "admin_centers":
      return wrap(
        (state.tables.centers ?? []).map((c) => {
          const plan = (state.tables.plans ?? []).find((p) => p.id === c.plan_id);
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            plan_id: c.plan_id ?? IDS.planTrial,
            plan_name: plan?.name ?? "Trial",
            student_limit: plan?.student_limit ?? 50,
            active_students: c.id === IDS.center1 ? 6 : 0,
            trial_ends_at: c.trial_ends_at,
            paid_until: c.paid_until,
            owner_name: c.id === IDS.center1 ? "Nurulloxon" : "Demo Owner",
            owner_phone: c.id === IDS.center1 ? "+998932702409" : "+998900000000",
            last_activity_at: nowIso,
          };
        }),
      );

    case "admin_invoices":
      return wrap(
        (state.tables.platform_invoices ?? []).map((inv) => {
          const c = (state.tables.centers ?? []).find((x) => x.id === inv.center_id);
          const p = (state.tables.plans ?? []).find((x) => x.id === inv.plan_id);
          return {
            ...inv,
            center_name: c?.name ?? "Bright English Academy",
            plan_name: p?.name ?? "Growth",
          };
        }),
      );

    case "admin_health":
      return wrap({
        heartbeats: [{ service: "worker", last_beat_at: nowIso }],
        outbox: {
          pending: 0,
          due: 0,
          oldest_due_at: null,
          sent_24h: 24,
          failed_24h: 0,
          sms_failed_24h: 0,
        },
        cron: [
          {
            job: "charge_enrollments",
            schedule: "0 1 * * *",
            active: true,
            last_start: nowIso,
            last_status: "succeeded",
            last_message: null,
          },
          {
            job: "payment_reminders",
            schedule: "0 9 * * *",
            active: true,
            last_start: nowIso,
            last_status: "succeeded",
            last_message: null,
          },
        ],
      });

    case "admin_support_view": {
      const cid = String(args.p_center_id ?? IDS.center1);
      const center = (state.tables.centers ?? []).find((c) => c.id === cid);
      if (!center) return wrap(null);
      return wrap({
        center: {
          id: center.id,
          name: center.name,
          status: center.status,
          timezone: center.timezone,
          default_locale: center.default_locale,
          currency: center.currency,
          created_at: center.created_at,
        },
        branches: (state.tables.branches ?? [])
          .filter((b) => b.center_id === cid)
          .map((b) => ({ name: b.name, archived: b.archived_at !== null })),
        staff: (state.tables.memberships ?? [])
          .filter((m) => m.center_id === cid)
          .map((m) => ({
            name: m.display_name,
            role: m.role,
            status: m.status,
            last_sign_in_at: m.status === "active" ? nowIso : null,
          })),
        students: { total: 6, active: 6, archived: 0 },
        groups: (state.tables.groups ?? [])
          .filter((g) => g.center_id === cid)
          .map((g) => ({ name: g.name, status: g.status, students: 2 })),
        payments: (state.tables.payments ?? [])
          .filter((p) => p.center_id === cid)
          .map((p) => ({
            paid_at: p.paid_at,
            amount: p.amount,
            method: p.method,
            voided: p.voided_at !== null,
          })),
        failed_messages: [],
        imports: [],
      });
    }

    case "save_attendance": {
      const lid = String(args.p_lesson_id ?? "");
      const items = Array.isArray(args.p_marks)
        ? (args.p_marks as { student_id?: string; status?: string; late_minutes?: number | null; note?: string | null }[])
        : [];
      for (const item of items) {
        if (!item.student_id || !item.status) continue;
        const existing = (state.tables.attendance ?? []).find(
          (a) => a.lesson_id === lid && a.student_id === item.student_id,
        );
        if (existing) {
          existing.status = item.status;
          existing.late_minutes = item.late_minutes ?? null;
          existing.note = item.note ?? null;
          existing.marked_at = nowIso;
        } else {
          state.tables.attendance?.push({
            id: crypto.randomUUID(),
            lesson_id: lid,
            group_id: IDS.group1,
            student_id: item.student_id,
            status: item.status,
            late_minutes: item.late_minutes ?? null,
            note: item.note ?? null,
            marked_at: nowIso,
            lessons: { local_date: today },
          });
        }
      }
      return wrap(true);
    }

    default:
      return wrap(null);
  }
}

/**
 * In-memory mock Supabase client used when NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY are not set.
 * Supports cookie-backed auth for the admin account (+998932702409 / Nurulloxon-57) and full seeded center data.
 */
export function createMockSupabaseClient(
  cookieAdapter?: MockCookieAdapter,
): SupabaseClient<Database> {
  const state = getState();

  const currentUser = () => {
    const uid = cookieAdapter?.get(MOCK_AUTH_COOKIE);
    if (!uid) return null;
    const found = state.users.find((u) => u.id === uid);
    if (!found) return null;
    return {
      id: found.id,
      phone: found.phone,
      user_metadata: { full_name: found.fullName, locale: found.locale },
    };
  };

  const client = {
    auth: {
      getUser: async () => ({ data: { user: currentUser() }, error: null }),
      getSession: async () => {
        const user = currentUser();
        return { data: { session: user ? { user } : null }, error: null };
      },
      signInWithPassword: async (creds: { phone?: string; password?: string }) => {
        const normalized = creds.phone?.startsWith("+")
          ? creds.phone
          : `+998${(creds.phone ?? "").replace(/\D/g, "")}`;
        const user = state.users.find(
          (u) =>
            (u.phone === creds.phone || u.phone === normalized) && u.password === creds.password,
        );
        if (!user) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials", code: "invalid_credentials" },
          };
        }
        cookieAdapter?.set(MOCK_AUTH_COOKIE, user.id, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 3600,
        });
        return {
          data: {
            user: {
              id: user.id,
              phone: user.phone,
              user_metadata: { full_name: user.fullName, locale: user.locale },
            },
            session: { access_token: "mock-token" },
          },
          error: null,
        };
      },
      signUp: async (creds: {
        phone?: string;
        password?: string;
        options?: { data?: { full_name?: string; locale?: string } };
      }) => {
        const phone = creds.phone ?? "";
        if (state.users.some((u) => u.phone === phone)) {
          return {
            data: { user: null, session: null },
            error: { message: "User already exists", code: "user_already_exists" },
          };
        }
        const id = crypto.randomUUID();
        const fullName = creds.options?.data?.full_name ?? "User";
        const locale = creds.options?.data?.locale ?? "uz";
        state.users.push({ id, phone, password: creds.password ?? "", fullName, locale });
        state.tables.profiles?.push({
          id,
          phone,
          full_name: fullName,
          locale,
          is_super_admin: false,
        });
        cookieAdapter?.set(MOCK_AUTH_COOKIE, id, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 3600,
        });
        return { data: { user: { id, phone }, session: null }, error: null };
      },
      signInWithOtp: async () => ({ data: { user: null, session: null }, error: null }),
      verifyOtp: async () => ({ data: { user: currentUser(), session: null }, error: null }),
      resend: async () => ({ data: { user: null, session: null }, error: null }),
      updateUser: async () => ({ data: { user: currentUser() }, error: null }),
      signOut: async () => {
        cookieAdapter?.remove(MOCK_AUTH_COOKIE);
        return { error: null };
      },
    },
    from: (table: string) => createQueryBuilder(table, state),
    rpc: (fn: string, args: Record<string, unknown> = {}) => handleRpc(fn, args, state),
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: null }),
        upload: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };

  return client as unknown as SupabaseClient<Database>;
}
