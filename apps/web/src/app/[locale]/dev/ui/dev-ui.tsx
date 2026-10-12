"use client";

import { formatMoney, isLocale, type Locale } from "@uteach/i18n";
import {
  Building2,
  CalendarDays,
  CircleDot,
  DoorOpen,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  SearchX,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ActivityList,
  AppShell,
  AttendanceMatrix,
  AttendanceRow,
  type AttendanceRowValue,
  BalancePreview,
  type MatrixColumn,
  type MatrixRow,
  CheckboxField,
  CheckboxGroup,
  ComboboxField,
  DataTable,
  DetailPage,
  EmptyState,
  ErrorState,
  Field,
  FilterButton,
  FormDialog,
  InitialsAvatar,
  LoadingState,
  MobileCard,
  MobileList,
  MobileRecord,
  MoneyAmount,
  NameCell,
  PageAction,
  PageHeader,
  Pagination,
  ProfileCard,
  ProfileChip,
  RowActions,
  Section,
  SelectField,
  StatTiles,
  StatusChip,
  StatusToggleGroup,
  TableSearch,
  TimezoneField,
  FileDrop,
  LessonList,
  PaletteField,
  Stepper,
  SegmentedControl,
  Timetable,
  WeeklySlotsField,
  type ChipTone,
  type NavEntry,
  type TimetableLesson,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { attendanceOptions } from "@/lib/attendance";
import { weekdayLabels } from "@/lib/dates";
import {
  DEV_TEXT,
  FAKE_BRANCHES,
  FAKE_CENTERS,
  FAKE_MEMBERS,
  TOKENS,
  TOKEN_CLASS,
  type FakeMember,
} from "./fixtures";

const STATUS_TONE: Record<FakeMember["status"], ChipTone> = {
  active: "success",
  invited: "warning",
  disabled: "muted",
};

/** A labelled block on the kit page; `id` is used for screenshots (/dev/ui#list-page). */
function Kit({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  return (
    <div id={id} className="min-w-0 scroll-mt-6 space-y-3">
      <p className="font-mono text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {name}
      </p>
      {children}
    </div>
  );
}

/** Fake action for the FormDialog demo: requires a name, then succeeds. */
async function fakeSave(_prev: ActionState, form: FormData): Promise<ActionState> {
  await new Promise((r) => setTimeout(r, 400));
  const name = String(form.get("displayName") ?? "").trim();
  if (!name) return { ok: false, fieldErrors: { displayName: "validation.required" } };
  return { ok: true };
}

/** Fake month for the AttendanceMatrix demo (fixtures aren't translated, 05-ui §6b). */
const MATRIX_COLUMNS: MatrixColumn[] = [
  { id: "l1", day: "1", weekday: "Wed", label: "Wed 1 · 18:00", cancelled: false, editable: true },
  { id: "l2", day: "3", weekday: "Fri", label: "Fri 3 · 18:00", cancelled: false, editable: true },
  { id: "l3", day: "6", weekday: "Mon", label: "Mon 6 · 18:00", cancelled: true, editable: false },
  { id: "l4", day: "8", weekday: "Wed", label: "Wed 8 · 18:00", cancelled: false, editable: true },
  {
    id: "l5",
    day: "10",
    weekday: "Fri",
    label: "Fri 10 · 18:00",
    cancelled: false,
    editable: true,
  },
];
const MATRIX_ROWS: MatrixRow[] = [
  {
    id: "s1",
    name: "Ali Valiyev",
    rate: "75%",
    rateTone: "warning",
    counts: "3 · 0 · 1 · 0",
    cells: {
      l1: { state: "expected", status: "present" },
      l2: { state: "expected", status: "absent" },
      l3: { state: "expected", status: null },
      l4: { state: "expected", status: "present" },
      l5: { state: "expected", status: "present" },
    },
  },
  {
    id: "s2",
    name: "Анна Смирнова",
    rate: "100%",
    rateTone: "success",
    counts: "2 · 1 · 0 · 1",
    cells: {
      l1: { state: "expected", status: "late" },
      l2: { state: "expected", status: "excused" },
      l3: { state: "expected", status: null },
      l4: { state: "frozen", status: null },
      l5: { state: "expected", status: null },
    },
  },
  {
    id: "s3",
    name: "Madina Karimova",
    rate: "—",
    rateTone: "muted",
    counts: "0 · 0 · 0 · 0",
    cells: {
      l1: { state: "out", status: null },
      l2: { state: "out", status: null },
      l3: { state: "out", status: null },
      l4: { state: "expected", status: null },
      l5: { state: "expected", status: null },
    },
  },
];

export function DevUi() {
  const t = useTranslations();
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const text = DEV_TEXT[locale];
  const days = weekdayLabels(locale, "short");
  const longDays = weekdayLabels(locale, "long");
  const [ttView, setTtView] = useState<"week" | "day">("week");
  const [ttLessons, setTtLessons] = useState<TimetableLesson[]>(() => [
    {
      id: "a",
      column: "1",
      startMinutes: 9 * 60,
      endMinutes: 10 * 60 + 30,
      title: "IELTS 6.0",
      subtitle: "Анна Смирнова · Room 3",
      palette: "violet",
      status: "scheduled",
      draggable: true,
    },
    {
      id: "b",
      column: "1",
      startMinutes: 10 * 60,
      endMinutes: 11 * 60,
      title: "Kids English",
      subtitle: "Jasur Toshmatov · Room 1",
      palette: "sky",
      status: "scheduled",
      draggable: true,
    },
    {
      id: "c",
      column: "2",
      startMinutes: 14 * 60,
      endMinutes: 15 * 60 + 20,
      title: "SAT Math",
      subtitle: "Emily Carter · Room 2",
      palette: "orange",
      status: "held",
    },
    {
      id: "d",
      column: "3",
      startMinutes: 18 * 60,
      endMinutes: 19 * 60 + 30,
      title: "General English B1",
      subtitle: "Гулноза Юсупова · Room 3",
      palette: "green",
      status: "cancelled",
      badge: "×",
    },
    {
      id: "e",
      column: "4",
      startMinutes: 16 * 60,
      endMinutes: 17 * 60 + 30,
      title: "Milliy sertifikat",
      subtitle: "Dilnoza · Room 4",
      palette: "rose",
      status: "scheduled",
      draggable: true,
    },
    {
      id: "f",
      column: "5",
      startMinutes: 11 * 60,
      endMinutes: 12 * 60 + 30,
      title: "CEFR B2",
      subtitle: "Sardor · Room 1",
      palette: "teal",
      status: "scheduled",
      draggable: true,
    },
  ]);
  const [selected, setSelected] = useState<Set<string>>(new Set(["3", "7"]));
  const [attendance, setAttendance] = useState("present");
  const [sheet, setSheet] = useState<Record<string, AttendanceRowValue>>({
    a: { status: "present", lateMinutes: "", note: "" },
    b: { status: "late", lateMinutes: "10", note: "Bus was late" },
    c: { status: null, lateMinutes: "", note: "" },
  });
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>(MATRIX_ROWS);
  const attendanceLabels = {
    lateMinutes: t("attendance.lateMinutes"),
    minutesShort: t("attendance.minutesShort"),
    note: t("attendance.note"),
    addNote: t("attendance.addNote", { name: "…" }),
    notePlaceholder: t("attendance.notePlaceholder"),
  };

  const nav: NavEntry[] = [
    { key: "home", label: t("nav.home"), href: "/home", icon: "home" },
    { key: "staff", label: t("nav.staff"), href: "/staff", icon: "staff" },
    {
      key: "settings",
      label: t("nav.settings"),
      icon: "settings",
      children: [
        { key: "center", label: t("nav.center"), href: "/settings/center" },
        { key: "branches", label: t("nav.branches"), href: "/settings/branches" },
      ],
    },
    {
      key: "patterns",
      label: text.patterns,
      icon: "today",
      children: [{ key: "kit", label: text.kit, href: "/dev/ui" }],
    },
  ];

  const money = (minor: bigint) => formatMoney(minor, "UZS", locale);
  const roleOf = (m: FakeMember) => t(`roles.${m.role}`);
  const statusOf = (m: FakeMember) => (
    <StatusChip tone={STATUS_TONE[m.status]}>{t(`memberStatus.${m.status}`)}</StatusChip>
  );
  const actionsOf = (m: FakeMember) => (
    <RowActions
      actions={[
        {
          key: "delete",
          label: t("common.rowArchive", { name: m.name }),
          icon: Trash2,
          tone: "destructive",
          onSelect: () => toast(t("common.archivedToast")),
        },
        {
          key: "edit",
          label: t("common.rowEdit", { name: m.name }),
          icon: Pencil,
          onSelect: () => toast(t("common.saved")),
        },
      ]}
    />
  );

  return (
    <AppShell
      nav={nav}
      user={{ name: "Malika Karimova", roleLabel: t("roles.owner") }}
      centers={FAKE_CENTERS}
      currentCenterId="c1"
      centerChip={{ label: t("centerStatus.trial"), tone: "primary" }}
    >
      <PageHeader
        title={text.kit}
        breadcrumbLabel={t("common.breadcrumb")}
        crumbs={[
          { label: t("nav.home"), href: "/home" },
          { label: text.patterns },
          { label: text.kit },
        ]}
        action={
          <PageAction onClick={() => toast.success(t("common.saved"))}>
            {t("staff.inviteButton")}
          </PageAction>
        }
      />

      <Kit id="stat-tiles" name="StatTiles in Section (dashboard)">
        <Section title={t("home.greeting", { name: "Malika" })} titleSize="dashboard">
          <StatTiles
            items={[
              {
                key: "students",
                label: t("home.staff"),
                value: "1 248",
                icon: GraduationCap,
                tone: "purple",
              },
              {
                key: "branches",
                label: t("home.branches"),
                value: "4",
                icon: Building2,
                tone: "blue",
              },
              { key: "rooms", label: t("home.rooms"), value: "27", icon: DoorOpen, tone: "orange" },
              {
                key: "money",
                label: t("flags.payments.label"),
                value: money(1_930_000_000n),
                icon: Wallet,
                tone: "green",
              },
            ]}
          />
        </Section>
      </Kit>

      <Kit
        id="list-page"
        name="ListPage: Section + TableSearch + FilterButton + DataTable + RowActions + Pagination"
      >
        <Section
          title={t("staff.listTitle")}
          tools={
            <>
              <TableSearch
                placeholder={t("staff.searchPlaceholder")}
                label={t("staff.searchLabel")}
              />
              <FilterButton
                icon={<UserCog strokeWidth={1.8} />}
                label={t("staff.filterRole")}
                param="role"
                allLabel={t("common.all")}
                options={(["owner", "admin", "teacher"] as const).map((r) => ({
                  value: r,
                  label: t(`roles.${r}`),
                }))}
              />
            </>
          }
        >
          <DataTable
            rows={FAKE_MEMBERS}
            rowKey={(m) => m.id}
            selection={{
              selected,
              onToggle: (key) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                }),
              onToggleAll: () =>
                setSelected((prev) =>
                  prev.size === FAKE_MEMBERS.length
                    ? new Set()
                    : new Set(FAKE_MEMBERS.map((m) => m.id)),
                ),
              labelAll: t("common.all"),
              labelRow: (key) => FAKE_MEMBERS.find((m) => m.id === key)?.name ?? key,
            }}
            columns={[
              {
                key: "name",
                header: t("staff.columns.name"),
                cell: (m) => <NameCell avatar={<InitialsAvatar name={m.name} />} name={m.name} />,
              },
              { key: "phone", header: t("staff.fields.phone"), cell: (m) => m.phone },
              { key: "branch", header: t("staff.columns.branches"), cell: (m) => m.branch },
              { key: "role", header: t("staff.columns.role"), cell: roleOf },
              { key: "status", header: t("staff.columns.status"), cell: statusOf },
              { key: "actions", header: t("staff.columns.actions"), cell: actionsOf },
            ]}
            mobileCard={(m) => (
              <MobileRecord
                avatar={<InitialsAvatar name={m.name} />}
                title={m.name}
                subtitle={m.phone}
                status={statusOf(m)}
                fields={[
                  { label: t("staff.columns.role"), value: roleOf(m) },
                  { label: t("staff.columns.branches"), value: m.branch },
                ]}
                actions={actionsOf(m)}
              />
            )}
          />
        </Section>
        <Pagination page={2} pageCount={100} pageSize={10} alwaysShow />
      </Kit>

      <Kit id="detail-page" name="DetailPage: ProfileCard + Tabs">
        <DetailPage
          header={
            <ProfileCard
              avatar={<InitialsAvatar name="Анна Смирнова" size="lg" />}
              name="Анна Смирнова"
              subtitle={`${t("roles.teacher")} · ${text.lesson}`}
              rows={[
                { key: "addr", icon: MapPin, value: "Chilonzor, Bunyodkor 12" },
                { key: "phone", icon: Phone, value: "+998 93 345 67 89" },
                { key: "mail", icon: Mail, value: "anna@uteach.uz" },
              ]}
              chip={<ProfileChip>{"ID #0031"}</ProfileChip>}
            />
          }
          tabs={[
            {
              value: "details",
              label: t("settings.branches.tabDetails"),
              content: <p className="text-[15px] text-secondary-foreground">{text.specimen}</p>,
            },
            {
              value: "rooms",
              label: t("settings.branches.tabRooms"),
              content: (
                <EmptyState
                  icon={DoorOpen}
                  title={t("settings.rooms.empty")}
                  hint={t("settings.rooms.emptyHint")}
                />
              ),
            },
          ]}
        />
      </Kit>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit
          id="form-dialog"
          name="FormDialog + Field + SelectField + ComboboxField + CheckboxGroup"
        >
          <Section title={t("staff.inviteTitle")} description={t("staff.inviteDescription")}>
            <FormDialog
              trigger={<PageAction>{t("staff.inviteButton")}</PageAction>}
              title={t("staff.inviteTitle")}
              description={t("staff.inviteDescription")}
              action={fakeSave}
              submitLabel={t("common.save")}
              successToast={t("common.saved")}
              testId="dev-form-dialog"
            >
              {(state) => (
                <>
                  <Field
                    name="displayName"
                    label={t("staff.fields.name")}
                    placeholder="Malika Karimova"
                    state={state}
                  />
                  <ComboboxField
                    name="branch"
                    label={t("staff.fields.branches")}
                    state={state}
                    options={FAKE_BRANCHES.map((b) => ({ value: b, label: b }))}
                    defaultValue="Chilonzor"
                    placeholder={t("timezone.placeholder")}
                    searchPlaceholder={t("staff.searchPlaceholder")}
                    emptyText={t("states.noResults")}
                  />
                  <SelectField
                    name="role"
                    label={t("staff.fields.role")}
                    state={state}
                    defaultValue="teacher"
                    options={(["admin", "teacher"] as const).map((r) => ({
                      value: r,
                      label: t(`roles.${r}`),
                    }))}
                  />
                </>
              )}
            </FormDialog>
          </Section>
        </Kit>

        <Kit id="fields" name="Fields (inline form)">
          <Section>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <Field
                name="kitName"
                label={t("auth.fields.fullName")}
                defaultValue="Гулноза Юсупова"
                state={null}
              />
              <Field
                name="kitPhone"
                label={t("auth.fields.phone")}
                state={{ ok: false, fieldErrors: { kitPhone: "validation.phone" } }}
                defaultValue="12"
              />
              <TimezoneField
                name="kitTz"
                label={t("settings.center.timezone")}
                state={null}
                defaultValue="Asia/Tashkent"
              />
              <CheckboxGroup legend={t("staff.fields.permissions")} name="kitFlags" state={null}>
                {(["students", "payments", "billing"] as const).map((f, i) => (
                  <CheckboxField
                    key={f}
                    name="kitFlags"
                    value={f}
                    label={t(`flags.${f}.label`)}
                    hint={t(`flags.${f}.hint`)}
                    defaultChecked={i < 2}
                  />
                ))}
              </CheckboxGroup>
            </form>
          </Section>
        </Kit>
      </div>

      <Kit id="money" name="MoneyAmount · BalancePreview (payments, adjustments)">
        <Section>
          <div className="flex flex-wrap items-center gap-6">
            <MoneyAmount minor={54_000_000} currency="UZS" />
            <MoneyAmount minor={-31_500_000} currency="UZS" tone="balance" />
            <MoneyAmount minor={2_000_000} currency="UZS" tone="balance" />
            <MoneyAmount minor={46_800_000} currency="UZS" tone="muted" />
          </div>
          <div className="mt-5 max-w-md">
            <BalancePreview
              before={-54_000_000}
              after={0}
              beforeLabel={t("billing.record.now")}
              afterLabel={t("billing.record.after")}
              describe={(minor) =>
                minor < 0n
                  ? t("billing.debt", { amount: formatMoney(-minor, "UZS", locale) })
                  : minor > 0n
                    ? t("billing.credit", { amount: formatMoney(minor, "UZS", locale) })
                    : t("billing.settled")
              }
            />
          </div>
        </Section>
      </Kit>

      <Kit id="attendance-matrix" name="AttendanceMatrix (group page → Attendance)">
        <Section>
          <AttendanceMatrix
            columns={MATRIX_COLUMNS}
            rows={matrixRows}
            letters={{
              present: t("attendance.letter.present"),
              late: t("attendance.letter.late"),
              absent: t("attendance.letter.absent"),
              excused: t("attendance.letter.excused"),
              frozen: t("attendance.letter.frozen"),
            }}
            labels={{
              student: t("attendance.matrix.student"),
              rate: t("attendance.matrix.rate"),
              marks: {
                present: t("attendance.status.present"),
                late: t("attendance.status.late"),
                absent: t("attendance.status.absent"),
                excused: t("attendance.status.excused"),
              },
              cell: (r, c, state) => `${r.name}, ${c.label}: ${state}`,
              notMarked: t("attendance.matrix.notMarked"),
              outside: t("attendance.matrix.outside"),
              frozen: t("attendance.matrix.frozen"),
              cancelled: t("attendance.matrix.cancelled"),
              edit: (r, c) => `${r.name} · ${c.label}`,
            }}
            onMark={async (studentId, lessonId, mark) => {
              await new Promise((r) => setTimeout(r, 300));
              setMatrixRows((rows) =>
                rows.map((r) =>
                  r.id === studentId
                    ? {
                        ...r,
                        cells: { ...r.cells, [lessonId]: { state: "expected", status: mark } },
                      }
                    : r,
                ),
              );
            }}
          />
        </Section>
      </Kit>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="mobile-list" name="MobileList + MobileCard + StatusToggleGroup (teacher screens)">
          <div className="mx-auto max-w-sm">
            <MobileList>
              {FAKE_MEMBERS.slice(2, 4).map((m) => (
                <MobileCard key={m.id}>
                  <MobileRecord
                    avatar={<InitialsAvatar name={m.name} />}
                    title={m.name}
                    subtitle={text.group}
                    status={statusOf(m)}
                  />
                  <div className="mt-4">
                    <StatusToggleGroup
                      name={`att-${m.id}`}
                      legend={m.name}
                      value={m.id === "3" ? attendance : undefined}
                      defaultValue={m.id === "3" ? undefined : "late"}
                      onChange={m.id === "3" ? setAttendance : undefined}
                      options={[
                        { value: "present", label: text.attendance[0], tone: "success" },
                        { value: "late", label: text.attendance[1], tone: "warning" },
                        { value: "absent", label: text.attendance[2], tone: "destructive" },
                        { value: "excused", label: text.attendance[3], tone: "muted" },
                      ]}
                    />
                  </div>
                </MobileCard>
              ))}
            </MobileList>
          </div>
        </Kit>

        <Kit id="attendance-row" name="AttendanceRow (attendance sheet, 375 px)">
          <div className="mx-auto max-w-[375px]">
            <MobileList>
              {[
                { id: "a", name: "Ali Valiyev" },
                { id: "b", name: "Анна Смирнова" },
                { id: "c", name: "Madina Karimova", badge: t("attendance.notExpected") },
              ].map((s) => (
                <AttendanceRow
                  key={s.id}
                  name={s.name}
                  value={sheet[s.id]!}
                  onChange={(v) => setSheet((m) => ({ ...m, [s.id]: v }))}
                  options={attendanceOptions(
                    (k) => t(`attendance.statusShort.${k}`),
                    (k) => t(`attendance.status.${k}`),
                  )}
                  legend={t("attendance.legend", { name: s.name })}
                  labels={attendanceLabels}
                  badge={s.badge ? <StatusChip tone="muted">{s.badge}</StatusChip> : undefined}
                />
              ))}
            </MobileList>
          </div>
        </Kit>

        <Kit id="states" name="EmptyState / ErrorState / LoadingState">
          <Section>
            <EmptyState
              icon={Users}
              title={t("staff.emptyTitle")}
              hint={t("staff.emptyHint")}
              action={<PageAction>{t("staff.inviteButton")}</PageAction>}
            />
          </Section>
          <Section>
            <ErrorState
              title={t("states.errorTitle")}
              hint={t("states.errorHint")}
              action={<Button variant="outline">{text.retry}</Button>}
            />
          </Section>
          <Section>
            <LoadingState variant="table" rows={3} label={t("common.loading")} />
          </Section>
          <Section>
            <EmptyState
              icon={SearchX}
              title={t("states.noResults")}
              hint={t("states.noResultsHint")}
            />
          </Section>
        </Kit>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="activity-list" name="ActivityList">
          <Section title={t("home.nextSteps")} titleSize="card">
            <ActivityList
              items={[
                {
                  key: "a",
                  icon: Building2,
                  tone: "blue",
                  title: t("home.addBranch"),
                  description: t("home.addBranchHint"),
                  meta: <StatusChip tone="success">{t("home.done")}</StatusChip>,
                },
                {
                  key: "b",
                  icon: DoorOpen,
                  tone: "orange",
                  title: t("home.addRooms"),
                  description: t("home.addRoomsHint"),
                  meta: <StatusChip tone="muted">{t("home.todo")}</StatusChip>,
                },
                {
                  key: "c",
                  icon: UserPlus,
                  tone: "green",
                  title: t("home.inviteStaff"),
                  description: t("home.inviteStaffHint"),
                  meta: money(60_000_000n),
                },
                {
                  key: "d",
                  icon: GraduationCap,
                  tone: "purple",
                  title: text.lesson,
                  description: text.group,
                  meta: "18:00",
                },
              ]}
            />
          </Section>
        </Kit>
        <Kit id="chips" name="StatusChip + InitialsAvatar + Buttons + Toast">
          <Section>
            <div className="flex flex-wrap items-center gap-3">
              {(["primary", "success", "warning", "destructive", "muted"] as const).map((tone) => (
                <StatusChip key={tone} tone={tone}>
                  {tone}
                </StatusChip>
              ))}
              <ProfileChip>{"ID #0021"}</ProfileChip>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {FAKE_MEMBERS.slice(0, 6).map((m, i) => (
                <InitialsAvatar
                  key={m.id}
                  name={m.name}
                  size={i === 0 ? "lg" : i < 3 ? "md" : "sm"}
                />
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button>{t("common.save")}</Button>
              <Button variant="outline">{t("common.cancel")}</Button>
              <PageAction>{t("common.add")}</PageAction>
              <Button variant="ghost-round" size="icon" aria-label={t("common.edit")}>
                <Pencil />
              </Button>
              <Button variant="destructive">{t("common.archive")}</Button>
              <Button variant="link" onClick={() => toast.success(t("common.saved"))}>
                {t("common.saved")}
              </Button>
            </div>
          </Section>
        </Kit>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="tokens" name="Tokens (globals.css)">
          <Section>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TOKENS.map((token) => (
                <div key={token} className="flex items-center gap-2.5">
                  <span
                    className={`size-9 shrink-0 rounded-lg border border-border/70 ${TOKEN_CLASS[token]}`}
                  />
                  <span className="font-mono text-xs text-secondary-foreground">{token}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              {(["rounded-lg", "rounded-xl", "rounded-2xl"] as const).map((r) => (
                <div
                  key={r}
                  className={`grid size-20 place-items-center bg-primary-soft font-mono text-xs text-primary ${r}`}
                >
                  {r}
                </div>
              ))}
              <div className="grid size-20 place-items-center rounded-2xl bg-card font-mono text-xs shadow-card">
                {"shadow-card"}
              </div>
              <div className="grid size-20 place-items-center rounded-2xl bg-card font-mono text-xs shadow-shell">
                {"shadow-shell"}
              </div>
            </div>
          </Section>
        </Kit>

        <Kit id="fonts" name="Typography (Plus Jakarta Sans + Manrope for Cyrillic)">
          <Section>
            <div className="space-y-3">
              <p className="text-2xl font-extrabold tracking-tight sm:text-[28px]">
                {DEV_TEXT.uz.specimen.slice(0, 40)}
              </p>
              <p className="text-2xl font-extrabold tracking-tight sm:text-[28px]">
                {DEV_TEXT.ru.specimen.slice(0, 40)}
              </p>
              <p className="text-xl font-bold">{DEV_TEXT.en.specimen}</p>
              <p className="text-[15px]">{DEV_TEXT.uz.specimen}</p>
              <p className="text-[15px]">{DEV_TEXT.ru.specimen}</p>
              <p className="text-sm text-muted-foreground">{DEV_TEXT.ru.specimen}</p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4 text-primary" /> {money(55_384_615n)} ·{" "}
                {money(-150n)}
              </p>
            </div>
          </Section>
        </Kit>
      </div>

      <Kit id="filters" name="FilterButton (status)">
        <Section>
          <FilterButton
            icon={<CircleDot strokeWidth={1.8} />}
            label={t("staff.filterStatus")}
            param="status"
            allLabel={t("common.all")}
            options={(["active", "invited", "disabled"] as const).map((s) => ({
              value: s,
              label: t(`memberStatus.${s}`),
            }))}
          />
        </Section>
      </Kit>
      <Kit id="timetable" name="Timetable (week, lanes, drag) + SegmentedControl">
        <Section
          title={text.kit}
          tools={
            <SegmentedControl
              label={text.kit}
              value={ttView}
              options={[
                { value: "week", label: days[1] ?? "" },
                { value: "day", label: days[2] ?? "" },
              ]}
              onChange={setTtView}
            />
          }
        >
          <Timetable
            columns={[1, 2, 3, 4, 5].map((d) => ({ key: String(d), label: longDays[d] ?? "" }))}
            lessons={ttLessons}
            startHour={9}
            endHour={20}
            onMove={(id, column, start) =>
              setTtLessons((all) =>
                all.map((l) =>
                  l.id === id
                    ? {
                        ...l,
                        column,
                        startMinutes: start,
                        endMinutes: start + (l.endMinutes - l.startMinutes),
                      }
                    : l,
                ),
              )
            }
            renderActions={(l) => <p className="text-sm text-secondary-foreground">{l.title}</p>}
          />
        </Section>
      </Kit>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="lesson-list" name="LessonList (Today, timetable below md)">
          <div className="mx-auto max-w-sm">
            <LessonList
              items={ttLessons.slice(0, 3).map((l) => ({
                id: l.id,
                time: `${String(Math.floor(l.startMinutes / 60)).padStart(2, "0")}:${String(l.startMinutes % 60).padStart(2, "0")}`,
                title: l.title,
                subtitle: l.subtitle,
                palette: l.palette,
                status:
                  l.status === "cancelled" ? (
                    <StatusChip tone="muted">{text.lesson}</StatusChip>
                  ) : undefined,
                cancelled: l.status === "cancelled",
                href: "/dev/ui",
              }))}
            />
          </div>
        </Kit>

        <Kit id="slots" name="WeeklySlotsField + PaletteField">
          <Section>
            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              <WeeklySlotsField
                name="kitSlots"
                label={text.lesson}
                state={null}
                dayLabels={longDays}
                defaultValue={[
                  { weekday: 1, startTime: "18:00", durationMinutes: 90 },
                  { weekday: 3, startTime: "18:00", durationMinutes: 90 },
                ]}
                rooms={FAKE_BRANCHES.map((b) => ({ value: b, label: b }))}
              />
              <PaletteField name="kitColor" label={text.patterns} defaultValue="sky" />
            </form>
          </Section>
        </Kit>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="stepper" name="Stepper (onboarding wizard)">
          <Section>
            <Stepper
              label={text.kit}
              steps={[
                { key: "a", label: t("nav.center"), state: "done" },
                { key: "b", label: t("nav.branches"), state: "done" },
                { key: "c", label: t("nav.courses"), state: "skipped" },
                { key: "d", label: t("nav.staff"), state: "current" },
                { key: "e", label: t("nav.students"), state: "todo" },
              ]}
            />
          </Section>
        </Kit>
        <Kit id="file-drop" name="FileDrop (Excel import)">
          <FileDrop
            label={t("import.dropLabel")}
            hint={t("import.dropHint")}
            accept=".xlsx,.csv"
            onFile={(file) => toast(file.name)}
          />
        </Kit>
      </div>
    </AppShell>
  );
}
