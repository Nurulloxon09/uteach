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
  type ChipTone,
  type NavEntry,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { DEV_TEXT, FAKE_BRANCHES, FAKE_CENTERS, FAKE_MEMBERS, TOKENS, TOKEN_CLASS, type FakeMember } from "./fixtures";

const STATUS_TONE: Record<FakeMember["status"], ChipTone> = { active: "success", invited: "warning", disabled: "muted" };

/** A labelled block on the kit page; `id` is used for screenshots (/dev/ui#list-page). */
function Kit({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6 space-y-3">
      <p className="font-mono text-xs font-semibold tracking-wide text-muted-foreground uppercase">{name}</p>
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

export function DevUi() {
  const t = useTranslations();
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const text = DEV_TEXT[locale];
  const [selected, setSelected] = useState<Set<string>>(new Set(["3", "7"]));
  const [attendance, setAttendance] = useState("present");

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
  const statusOf = (m: FakeMember) => <StatusChip tone={STATUS_TONE[m.status]}>{t(`memberStatus.${m.status}`)}</StatusChip>;
  const actionsOf = (m: FakeMember) => (
    <RowActions
      actions={[
        { key: "delete", label: t("common.rowArchive", { name: m.name }), icon: Trash2, tone: "destructive", onSelect: () => toast(t("common.archivedToast")) },
        { key: "edit", label: t("common.rowEdit", { name: m.name }), icon: Pencil, onSelect: () => toast(t("common.saved")) },
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
        crumbs={[{ label: t("nav.home"), href: "/home" }, { label: text.patterns }, { label: text.kit }]}
        action={<PageAction onClick={() => toast.success(t("common.saved"))}>{t("staff.inviteButton")}</PageAction>}
      />

      <Kit id="stat-tiles" name="StatTiles in Section (dashboard)">
        <Section title={t("home.greeting", { name: "Malika" })} titleSize="dashboard">
          <StatTiles
            items={[
              { key: "students", label: t("home.staff"), value: "1 248", icon: GraduationCap, tone: "purple" },
              { key: "branches", label: t("home.branches"), value: "4", icon: Building2, tone: "blue" },
              { key: "rooms", label: t("home.rooms"), value: "27", icon: DoorOpen, tone: "orange" },
              { key: "money", label: t("flags.payments.label"), value: money(1_930_000_000n), icon: Wallet, tone: "green" },
            ]}
          />
        </Section>
      </Kit>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Kit id="list-page" name="ListPage: Section + TableSearch + FilterButton + DataTable + RowActions + Pagination">
          <Section
            title={t("staff.listTitle")}
            tools={
              <>
                <TableSearch placeholder={t("staff.searchPlaceholder")} label={t("staff.searchLabel")} />
                <FilterButton
                  icon={UserCog}
                  label={t("staff.filterRole")}
                  param="role"
                  allLabel={t("common.all")}
                  options={(["owner", "admin", "teacher"] as const).map((r) => ({ value: r, label: t(`roles.${r}`) }))}
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
                  setSelected((prev) => (prev.size === FAKE_MEMBERS.length ? new Set() : new Set(FAKE_MEMBERS.map((m) => m.id)))),
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

        <Kit id="activity-list" name="ActivityList">
          <Section title={t("home.nextSteps")} titleSize="card">
            <ActivityList
              items={[
                { key: "a", icon: Building2, tone: "blue", title: t("home.addBranch"), description: t("home.addBranchHint"), meta: <StatusChip tone="success">{t("home.done")}</StatusChip> },
                { key: "b", icon: DoorOpen, tone: "orange", title: t("home.addRooms"), description: t("home.addRoomsHint"), meta: <StatusChip tone="muted">{t("home.todo")}</StatusChip> },
                { key: "c", icon: UserPlus, tone: "green", title: t("home.inviteStaff"), description: t("home.inviteStaffHint"), meta: money(60_000_000n) },
                { key: "d", icon: GraduationCap, tone: "purple", title: text.lesson, description: text.group, meta: "18:00" },
              ]}
            />
          </Section>
        </Kit>
      </div>

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
              content: <EmptyState icon={DoorOpen} title={t("settings.rooms.empty")} hint={t("settings.rooms.emptyHint")} />,
            },
          ]}
        />
      </Kit>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="form-dialog" name="FormDialog + Field + SelectField + ComboboxField + CheckboxGroup">
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
                  <Field name="displayName" label={t("staff.fields.name")} placeholder="Malika Karimova" state={state} />
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
                    options={(["admin", "teacher"] as const).map((r) => ({ value: r, label: t(`roles.${r}`) }))}
                  />
                </>
              )}
            </FormDialog>
          </Section>
        </Kit>

        <Kit id="fields" name="Fields (inline form)">
          <Section>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <Field name="kitName" label={t("auth.fields.fullName")} defaultValue="Гулноза Юсупова" state={null} />
              <Field
                name="kitPhone"
                label={t("auth.fields.phone")}
                state={{ ok: false, fieldErrors: { kitPhone: "validation.phone" } }}
                defaultValue="12"
              />
              <TimezoneField name="kitTz" label={t("settings.center.timezone")} state={null} defaultValue="Asia/Tashkent" />
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="mobile-list" name="MobileList + MobileCard + StatusToggleGroup (teacher screens)">
          <div className="mx-auto max-w-sm">
            <MobileList>
              {FAKE_MEMBERS.slice(2, 4).map((m) => (
                <MobileCard key={m.id}>
                  <MobileRecord avatar={<InitialsAvatar name={m.name} />} title={m.name} subtitle={text.group} status={statusOf(m)} />
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

        <Kit id="states" name="EmptyState / ErrorState / LoadingState">
          <Section>
            <EmptyState icon={Users} title={t("staff.emptyTitle")} hint={t("staff.emptyHint")} action={<PageAction>{t("staff.inviteButton")}</PageAction>} />
          </Section>
          <Section>
            <ErrorState title={t("states.errorTitle")} hint={t("states.errorHint")} action={<Button variant="outline">{text.retry}</Button>} />
          </Section>
          <Section>
            <LoadingState variant="table" rows={3} label={t("common.loading")} />
          </Section>
          <Section>
            <EmptyState icon={SearchX} title={t("states.noResults")} hint={t("states.noResultsHint")} />
          </Section>
        </Kit>
      </div>

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
              <InitialsAvatar key={m.id} name={m.name} size={i === 0 ? "lg" : i < 3 ? "md" : "sm"} />
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Kit id="tokens" name="Tokens (globals.css)">
          <Section>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TOKENS.map((token) => (
                <div key={token} className="flex items-center gap-2.5">
                  <span className={`size-9 shrink-0 rounded-lg border border-border/70 ${TOKEN_CLASS[token]}`} />
                  <span className="font-mono text-xs text-secondary-foreground">{token}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              {(["rounded-lg", "rounded-xl", "rounded-2xl"] as const).map((r) => (
                <div key={r} className={`grid size-20 place-items-center bg-primary-soft font-mono text-xs text-primary ${r}`}>
                  {r}
                </div>
              ))}
              <div className="grid size-20 place-items-center rounded-2xl bg-card font-mono text-xs shadow-card">{"shadow-card"}</div>
              <div className="grid size-20 place-items-center rounded-2xl bg-card font-mono text-xs shadow-shell">{"shadow-shell"}</div>
            </div>
          </Section>
        </Kit>

        <Kit id="fonts" name="Typography (Plus Jakarta Sans + Manrope for Cyrillic)">
          <Section>
            <div className="space-y-3">
              <p className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{DEV_TEXT.uz.specimen.slice(0, 40)}</p>
              <p className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{DEV_TEXT.ru.specimen.slice(0, 40)}</p>
              <p className="text-xl font-bold">{DEV_TEXT.en.specimen}</p>
              <p className="text-[15px]">{DEV_TEXT.uz.specimen}</p>
              <p className="text-[15px]">{DEV_TEXT.ru.specimen}</p>
              <p className="text-sm text-muted-foreground">{DEV_TEXT.ru.specimen}</p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4 text-primary" /> {money(55_384_615n)} · {money(-150n)}
              </p>
            </div>
          </Section>
        </Kit>
      </div>

      <Kit id="filters" name="FilterButton (status)">
        <Section>
          <FilterButton
            icon={CircleDot}
            label={t("staff.filterStatus")}
            param="status"
            allLabel={t("common.all")}
            options={(["active", "invited", "disabled"] as const).map((s) => ({ value: s, label: t(`memberStatus.${s}`) }))}
          />
        </Section>
      </Kit>
    </AppShell>
  );
}
