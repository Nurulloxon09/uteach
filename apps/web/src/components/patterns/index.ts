/**
 * UI patterns (docs/spec/05-ui.md §5). Screens are built only from these and `components/ui`.
 * New patterns go on /dev/ui before a real screen uses them.
 */
export { ActivityList, type ActivityItem } from "./activity-list";
export { AppShell } from "./app-shell/app-shell";
export { CenterMenu, LanguageMenu, UserMenu } from "./app-shell/menus";
export type {
  NavEntry,
  NavGroup,
  NavLink,
  ShellCenter,
  ShellChip,
  ShellUser,
} from "./app-shell/nav";
export {
  AttendanceMatrix,
  type MatrixColumn,
  type MatrixMark,
  type MatrixRow,
} from "./attendance-matrix";
export { AttendanceRow, type AttendanceRowValue } from "./attendance-row";
export { AudiencePicker, type Audience, type AudienceRecipients } from "./audience-picker";
export { AuthCard, AuthLayout } from "./auth-layout";
export { Combobox, type ComboboxOption } from "./combobox";
export { ConfirmDialog } from "./confirm-dialog";
export { DataTable, NameCell, type Column, type Selection } from "./data-table";
export { DetailPage, type DetailTab } from "./detail-page";
export {
  CheckboxField,
  CheckboxGroup,
  ComboboxField,
  Field,
  FieldError,
  FormMessage,
  SelectField,
  SubmitButton,
} from "./fields";
export { FileDrop } from "./file-drop";
export { FilterButton, type FilterOption } from "./filter-button";
export { FormDialog } from "./form-dialog";
export { InitialsAvatar, initials, tintFor } from "./initials-avatar";
export { KanbanBoard, type KanbanColumn, type KanbanItem } from "./kanban-board";
export { LessonList, type LessonListItem } from "./lesson-list";
export { MobileCard, MobileList, MobileRecord } from "./mobile-list";
export { BalancePreview, MoneyAmount } from "./money";
export { PageAction, PageHeader, type Crumb } from "./page-header";
export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageCountFor,
  pageWindow,
  parseListParams,
} from "./list-params";
export { Pagination } from "./pagination";
export { PaletteField } from "./palette-field";
export { ProfileCard, ProfileChip } from "./profile-card";
export { RowActions, type RowAction } from "./row-actions";
export { Section } from "./section";
export { SegmentedControl } from "./segmented-control";
export { StatTiles, type StatTile, type StatTone } from "./stat-tiles";
export { EmptyState, ErrorState, LoadingState } from "./states";
export { StatusChip, type ChipTone } from "./status-chip";
export { Stepper, type Step } from "./stepper";
export { StatusToggleGroup, type StatusOption } from "./status-toggle-group";
export { TableSearch } from "./table-search";
export { TimezoneField } from "./timezone-field";
export { Timetable, minutesLabel, type TimetableColumn, type TimetableLesson } from "./timetable";
export { WeeklySlotsField, type WeeklySlot } from "./weekly-slots-field";
export { Wordmark } from "./wordmark";
