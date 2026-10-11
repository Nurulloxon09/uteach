
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "attendance": {
                  Row: {
                    "center_id": string,"created_at": string,"enrollment_id": string,"group_id": string,"id": string,"last_edited_at": string | null,"last_edited_by": string | null,"late_minutes": number | null,"lesson_id": string,"marked_at": string,"marked_by": string,"note": string | null,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"created_at"?: string,"enrollment_id": string,"group_id": string,"id"?: string,"last_edited_at"?: string | null,"last_edited_by"?: string | null,"late_minutes"?: number | null,"lesson_id": string,"marked_at"?: string,"marked_by": string,"note"?: string | null,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"created_at"?: string,"enrollment_id"?: string,"group_id"?: string,"id"?: string,"last_edited_at"?: string | null,"last_edited_by"?: string | null,"late_minutes"?: number | null,"lesson_id"?: string,"marked_at"?: string,"marked_by"?: string,"note"?: string | null,"status"?: Database["public"]['Enums']["attendance_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_center_id_enrollment_id_fkey"
      columns: ["center_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "attendance_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_center_id_group_id_lesson_id_fkey"
      columns: ["center_id","group_id","lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["center_id","group_id","id"]
    },{
      foreignKeyName: "attendance_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "attendance_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "attendance_last_edited_by_fkey"
      columns: ["last_edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_kind": string,"actor_profile_id": string | null,"after": Json | null,"at": string,"before": Json | null,"center_id": string | null,"id": number,"row_id": string | null,"table_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_kind": string,"actor_profile_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"center_id"?: string | null,"id"?: never,"row_id"?: string | null,"table_name"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_kind"?: string,"actor_profile_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"center_id"?: string | null,"id"?: never,"row_id"?: string | null,"table_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"center_id": string,"created_at": string,"id": string,"name": string,"phone": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"center_id": string,"created_at"?: string,"id"?: string,"name": string,"phone"?: string | null,"timezone": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"center_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"phone"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"centers": {
                  Row: {
                    "absence_alert_delay_min": number,"archived_at": string | null,"attendance_edit_hours": number,"country_code": string,"created_at": string,"currency": string,"default_locale": string,"id": string,"late_alert_enabled": boolean,"logo_path": string | null,"name": string,"quiet_hours_end": string,"quiet_hours_start": string,"settings": NonNullable<Json>,"slug": string,"status": Database["public"]['Enums']["center_status"],"timezone": string,"trial_ends_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absence_alert_delay_min"?: number,"archived_at"?: string | null,"attendance_edit_hours"?: number,"country_code"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"id"?: string,"late_alert_enabled"?: boolean,"logo_path"?: string | null,"name": string,"quiet_hours_end"?: string,"quiet_hours_start"?: string,"settings"?: NonNullable<Json>,"slug": string,"status"?: Database["public"]['Enums']["center_status"],"timezone"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "absence_alert_delay_min"?: number,"archived_at"?: string | null,"attendance_edit_hours"?: number,"country_code"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"id"?: string,"late_alert_enabled"?: boolean,"logo_path"?: string | null,"name"?: string,"quiet_hours_end"?: string,"quiet_hours_start"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"status"?: Database["public"]['Enums']["center_status"],"timezone"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"courses": {
                  Row: {
                    "archived_at": string | null,"center_id": string,"created_at": string,"default_lesson_minutes": number | null,"default_price_amount": number | null,"description": string | null,"id": string,"kind": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"center_id": string,"created_at"?: string,"default_lesson_minutes"?: number | null,"default_price_amount"?: number | null,"description"?: string | null,"id"?: string,"kind"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"center_id"?: string,"created_at"?: string,"default_lesson_minutes"?: number | null,"default_price_amount"?: number | null,"description"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollment_freezes": {
                  Row: {
                    "center_id": string,"created_at": string,"created_by": string | null,"enrollment_id": string,"from_date": string,"id": string,"reason": string | null,"to_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"created_at"?: string,"created_by"?: string | null,"enrollment_id": string,"from_date": string,"id"?: string,"reason"?: string | null,"to_date": string,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"created_at"?: string,"created_by"?: string | null,"enrollment_id"?: string,"from_date"?: string,"id"?: string,"reason"?: string | null,"to_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollment_freezes_center_id_enrollment_id_fkey"
      columns: ["center_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "enrollment_freezes_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollment_freezes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "center_id": string,"created_at": string,"created_by": string | null,"discount_amount": number,"discount_bp": number,"discount_reason": string | null,"end_date": string | null,"end_reason": Database["public"]['Enums']["enrollment_end_reason"] | null,"group_id": string,"id": string,"price_override_amount": number | null,"start_date": string,"status": Database["public"]['Enums']["enrollment_status"],"student_id": string,"transferred_to_enrollment_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"discount_bp"?: number,"discount_reason"?: string | null,"end_date"?: string | null,"end_reason"?: Database["public"]['Enums']["enrollment_end_reason"] | null,"group_id": string,"id"?: string,"price_override_amount"?: number | null,"start_date": string,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id": string,"transferred_to_enrollment_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"discount_bp"?: number,"discount_reason"?: string | null,"end_date"?: string | null,"end_reason"?: Database["public"]['Enums']["enrollment_end_reason"] | null,"group_id"?: string,"id"?: string,"price_override_amount"?: number | null,"start_date"?: string,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id"?: string,"transferred_to_enrollment_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_center_id_group_id_fkey"
      columns: ["center_id","group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "enrollments_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "enrollments_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "enrollments_center_id_transferred_to_enrollment_id_fkey"
      columns: ["center_id","transferred_to_enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "enrollments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_prices": {
                  Row: {
                    "center_id": string,"created_at": string,"cycle_lessons": number,"effective_from": string,"group_id": string,"id": string,"price_amount": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"created_at"?: string,"cycle_lessons"?: number,"effective_from": string,"group_id": string,"id"?: string,"price_amount": number,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"created_at"?: string,"cycle_lessons"?: number,"effective_from"?: string,"group_id"?: string,"id"?: string,"price_amount"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_prices_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_prices_center_id_group_id_fkey"
      columns: ["center_id","group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["center_id","id"]
    }
                  ]
                },"group_schedule_rules": {
                  Row: {
                    "center_id": string,"created_at": string,"duration_minutes": number,"group_id": string,"id": string,"room_id": string | null,"start_time": string,"teacher_membership_id": string | null,"updated_at": string,"valid_from": string,"valid_to": string | null,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"created_at"?: string,"duration_minutes": number,"group_id": string,"id"?: string,"room_id"?: string | null,"start_time": string,"teacher_membership_id"?: string | null,"updated_at"?: string,"valid_from": string,"valid_to"?: string | null,"weekday": number
                  }
                  Update: {
                    "center_id"?: string,"created_at"?: string,"duration_minutes"?: number,"group_id"?: string,"id"?: string,"room_id"?: string | null,"start_time"?: string,"teacher_membership_id"?: string | null,"updated_at"?: string,"valid_from"?: string,"valid_to"?: string | null,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_schedule_rules_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_schedule_rules_center_id_group_id_fkey"
      columns: ["center_id","group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "group_schedule_rules_center_id_teacher_membership_id_fkey"
      columns: ["center_id","teacher_membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["center_id","id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"branch_id": string,"capacity": number | null,"center_id": string,"course_id": string,"created_at": string,"end_date": string | null,"id": string,"level_id": string | null,"name": string,"room_id": string | null,"start_date": string,"status": Database["public"]['Enums']["group_status"],"teacher_membership_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"branch_id": string,"capacity"?: number | null,"center_id": string,"course_id": string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"level_id"?: string | null,"name": string,"room_id"?: string | null,"start_date": string,"status"?: Database["public"]['Enums']["group_status"],"teacher_membership_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"branch_id"?: string,"capacity"?: number | null,"center_id"?: string,"course_id"?: string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"level_id"?: string | null,"name"?: string,"room_id"?: string | null,"start_date"?: string,"status"?: Database["public"]['Enums']["group_status"],"teacher_membership_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_branch_id_room_id_fkey"
      columns: ["branch_id","room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["branch_id","id"]
    },{
      foreignKeyName: "groups_center_id_branch_id_fkey"
      columns: ["center_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "groups_center_id_course_id_fkey"
      columns: ["center_id","course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "groups_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_center_id_teacher_membership_id_fkey"
      columns: ["center_id","teacher_membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "groups_course_id_level_id_fkey"
      columns: ["course_id","level_id"]
isOneToOne: false
      referencedRelation: "levels"
      referencedColumns: ["course_id","id"]
    }
                  ]
                },"guardians": {
                  Row: {
                    "archived_at": string | null,"center_id": string,"created_at": string,"full_name": string,"id": string,"locale": string | null,"phone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"center_id": string,"created_at"?: string,"full_name": string,"id"?: string,"locale"?: string | null,"phone": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"center_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"locale"?: string | null,"phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardians_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"holidays": {
                  Row: {
                    "branch_id": string | null,"center_id": string,"created_at": string,"date": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string | null,"center_id": string,"created_at"?: string,"date": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string | null,"center_id"?: string,"created_at"?: string,"date"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "holidays_center_id_branch_id_fkey"
      columns: ["center_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "holidays_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"import_jobs": {
                  Row: {
                    "center_id": string,"column_mapping": Json | null,"created_at": string,"created_by": string | null,"error_count": number | null,"errors": Json | null,"file_path": string,"id": string,"imported_at": string | null,"kind": string,"row_count": number | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"column_mapping"?: Json | null,"created_at"?: string,"created_by"?: string | null,"error_count"?: number | null,"errors"?: Json | null,"file_path": string,"id"?: string,"imported_at"?: string | null,"kind": string,"row_count"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"column_mapping"?: Json | null,"created_at"?: string,"created_by"?: string | null,"error_count"?: number | null,"errors"?: Json | null,"file_path"?: string,"id"?: string,"imported_at"?: string | null,"kind"?: string,"row_count"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_jobs_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_jobs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "branch_id": string,"cancel_reason": string | null,"center_id": string,"created_at": string,"ends_at": string,"group_id": string,"id": string,"is_billable": boolean,"is_makeup": boolean,"is_manually_edited": boolean,"local_date": string,"makeup_for_lesson_id": string | null,"original_teacher_membership_id": string | null,"room_id": string | null,"rule_date": string | null,"rule_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["lesson_status"],"teacher_membership_id": string,"topic": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"cancel_reason"?: string | null,"center_id": string,"created_at"?: string,"ends_at": string,"group_id": string,"id"?: string,"is_billable"?: boolean,"is_makeup"?: boolean,"is_manually_edited"?: boolean,"local_date": string,"makeup_for_lesson_id"?: string | null,"original_teacher_membership_id"?: string | null,"room_id"?: string | null,"rule_date"?: string | null,"rule_id"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["lesson_status"],"teacher_membership_id": string,"topic"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"cancel_reason"?: string | null,"center_id"?: string,"created_at"?: string,"ends_at"?: string,"group_id"?: string,"id"?: string,"is_billable"?: boolean,"is_makeup"?: boolean,"is_manually_edited"?: boolean,"local_date"?: string,"makeup_for_lesson_id"?: string | null,"original_teacher_membership_id"?: string | null,"room_id"?: string | null,"rule_date"?: string | null,"rule_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["lesson_status"],"teacher_membership_id"?: string,"topic"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_branch_id_room_id_fkey"
      columns: ["branch_id","room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["branch_id","id"]
    },{
      foreignKeyName: "lessons_center_id_branch_id_group_id_fkey"
      columns: ["center_id","branch_id","group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["center_id","branch_id","id"]
    },{
      foreignKeyName: "lessons_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_center_id_makeup_for_lesson_id_fkey"
      columns: ["center_id","makeup_for_lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "lessons_center_id_original_teacher_membership_id_fkey"
      columns: ["center_id","original_teacher_membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "lessons_center_id_teacher_membership_id_fkey"
      columns: ["center_id","teacher_membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "lessons_group_id_rule_id_fkey"
      columns: ["group_id","rule_id"]
isOneToOne: false
      referencedRelation: "group_schedule_rules"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"levels": {
                  Row: {
                    "archived_at": string | null,"center_id": string,"course_id": string,"created_at": string,"id": string,"name": string,"next_level_id": string | null,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"center_id": string,"course_id": string,"created_at"?: string,"id"?: string,"name": string,"next_level_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"center_id"?: string,"course_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"next_level_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "levels_center_id_course_id_fkey"
      columns: ["center_id","course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "levels_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "levels_center_id_next_level_id_fkey"
      columns: ["center_id","next_level_id"]
isOneToOne: false
      referencedRelation: "levels"
      referencedColumns: ["center_id","id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "branch_ids": (string)[],"center_id": string,"color": string | null,"created_at": string,"display_name": string,"id": string,"invite_expires_at": string | null,"invite_token_hash": string | null,"invited_phone": string | null,"permissions": (string)[],"profile_id": string | null,"role": Database["public"]['Enums']["membership_role"],"status": Database["public"]['Enums']["membership_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_ids"?: (string)[],"center_id": string,"color"?: string | null,"created_at"?: string,"display_name": string,"id"?: string,"invite_expires_at"?: string | null,"invite_token_hash"?: string | null,"invited_phone"?: string | null,"permissions"?: (string)[],"profile_id"?: string | null,"role": Database["public"]['Enums']["membership_role"],"status"?: Database["public"]['Enums']["membership_status"],"updated_at"?: string
                  }
                  Update: {
                    "branch_ids"?: (string)[],"center_id"?: string,"color"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"invite_expires_at"?: string | null,"invite_token_hash"?: string | null,"invited_phone"?: string | null,"permissions"?: (string)[],"profile_id"?: string | null,"role"?: Database["public"]['Enums']["membership_role"],"status"?: Database["public"]['Enums']["membership_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"center_id": string,"channel": Database["public"]['Enums']["notification_channel"] | null,"created_at": string,"dedupe_key": string | null,"fallback_of_id": string | null,"guardian_id": string | null,"id": string,"last_error": string | null,"locale": string,"locked_at": string | null,"membership_id": string | null,"payload": NonNullable<Json>,"phone": string | null,"provider_message_id": string | null,"send_after": string,"sent_at": string | null,"status": Database["public"]['Enums']["outbox_status"],"student_id": string | null,"telegram_chat_id": number | null,"template_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"center_id": string,"channel"?: Database["public"]['Enums']["notification_channel"] | null,"created_at"?: string,"dedupe_key"?: string | null,"fallback_of_id"?: string | null,"guardian_id"?: string | null,"id"?: string,"last_error"?: string | null,"locale": string,"locked_at"?: string | null,"membership_id"?: string | null,"payload"?: NonNullable<Json>,"phone"?: string | null,"provider_message_id"?: string | null,"send_after"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"student_id"?: string | null,"telegram_chat_id"?: number | null,"template_key": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"center_id"?: string,"channel"?: Database["public"]['Enums']["notification_channel"] | null,"created_at"?: string,"dedupe_key"?: string | null,"fallback_of_id"?: string | null,"guardian_id"?: string | null,"id"?: string,"last_error"?: string | null,"locale"?: string,"locked_at"?: string | null,"membership_id"?: string | null,"payload"?: NonNullable<Json>,"phone"?: string | null,"provider_message_id"?: string | null,"send_after"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"student_id"?: string | null,"telegram_chat_id"?: number | null,"template_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_center_id_guardian_id_fkey"
      columns: ["center_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "notification_outbox_center_id_membership_id_fkey"
      columns: ["center_id","membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "notification_outbox_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "notification_outbox_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "notification_outbox_fallback_of_id_fkey"
      columns: ["fallback_of_id"]
isOneToOne: false
      referencedRelation: "notification_outbox"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_templates": {
                  Row: {
                    "body": string,"center_id": string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"id": string,"is_enabled": boolean,"key": string,"locale": string,"sms_provider_template_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"center_id"?: string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"id"?: string,"is_enabled"?: boolean,"key": string,"locale": string,"sms_provider_template_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"center_id"?: string | null,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"id"?: string,"is_enabled"?: boolean,"key"?: string,"locale"?: string,"sms_provider_template_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_templates_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"is_super_admin": boolean,"locale": string,"phone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string,"is_super_admin"?: boolean,"locale"?: string,"phone": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"is_super_admin"?: boolean,"locale"?: string,"phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rooms": {
                  Row: {
                    "archived_at": string | null,"branch_id": string,"capacity": number | null,"center_id": string,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"branch_id": string,"capacity"?: number | null,"center_id": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"branch_id"?: string,"capacity"?: number | null,"center_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_center_id_branch_id_fkey"
      columns: ["center_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "rooms_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_conflicts": {
                  Row: {
                    "branch_id": string,"center_id": string,"conflict_kind": string,"conflicting_lesson_id": string | null,"created_at": string,"detected_at": string,"group_id": string,"id": string,"local_date": string,"resolution": string | null,"resolved_at": string | null,"rule_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"center_id": string,"conflict_kind": string,"conflicting_lesson_id"?: string | null,"created_at"?: string,"detected_at"?: string,"group_id": string,"id"?: string,"local_date": string,"resolution"?: string | null,"resolved_at"?: string | null,"rule_id": string,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"center_id"?: string,"conflict_kind"?: string,"conflicting_lesson_id"?: string | null,"created_at"?: string,"detected_at"?: string,"group_id"?: string,"id"?: string,"local_date"?: string,"resolution"?: string | null,"resolved_at"?: string | null,"rule_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_conflicts_center_id_branch_id_group_id_fkey"
      columns: ["center_id","branch_id","group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["center_id","branch_id","id"]
    },{
      foreignKeyName: "schedule_conflicts_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_conflicts_conflicting_lesson_id_fkey"
      columns: ["conflicting_lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_conflicts_group_id_rule_id_fkey"
      columns: ["group_id","rule_id"]
isOneToOne: false
      referencedRelation: "group_schedule_rules"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"student_guardians": {
                  Row: {
                    "center_id": string,"created_at": string,"guardian_id": string,"is_primary": boolean,"receives_billing": boolean,"receives_notifications": boolean,"relation": string,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"created_at"?: string,"guardian_id": string,"is_primary"?: boolean,"receives_billing"?: boolean,"receives_notifications"?: boolean,"relation"?: string,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"created_at"?: string,"guardian_id"?: string,"is_primary"?: boolean,"receives_billing"?: boolean,"receives_notifications"?: boolean,"relation"?: string,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_guardians_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardians_center_id_guardian_id_fkey"
      columns: ["center_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "student_guardians_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "student_guardians_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["center_id","id"]
    }
                  ]
                },"student_notes": {
                  Row: {
                    "body": string,"center_id": string,"created_at": string,"created_by": string,"id": string,"is_pinned": boolean,"student_id": string,"updated_at": string,"visible_to_teachers": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"center_id": string,"created_at"?: string,"created_by"?: string,"id"?: string,"is_pinned"?: boolean,"student_id": string,"updated_at"?: string,"visible_to_teachers"?: boolean
                  }
                  Update: {
                    "body"?: string,"center_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"is_pinned"?: boolean,"student_id"?: string,"updated_at"?: string,"visible_to_teachers"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_notes_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_notes_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "student_notes_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "student_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"students": {
                  Row: {
                    "archived_at": string | null,"birth_date": string | null,"branch_id": string,"center_id": string,"created_at": string,"external_ref": string | null,"full_name": string,"gender": string | null,"id": string,"phone": string | null,"school": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"branch_id": string,"center_id": string,"created_at"?: string,"external_ref"?: string | null,"full_name": string,"gender"?: string | null,"id"?: string,"phone"?: string | null,"school"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"branch_id"?: string,"center_id"?: string,"created_at"?: string,"external_ref"?: string | null,"full_name"?: string,"gender"?: string | null,"id"?: string,"phone"?: string | null,"school"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_center_id_branch_id_fkey"
      columns: ["center_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "students_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                },"telegram_links": {
                  Row: {
                    "center_id": string,"chat_id": number,"created_at": string,"guardian_id": string | null,"id": string,"linked_at": string,"locale": string,"membership_id": string | null,"phone": string,"student_id": string | null,"telegram_user_id": number,"unlinked_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "center_id": string,"chat_id": number,"created_at"?: string,"guardian_id"?: string | null,"id"?: string,"linked_at"?: string,"locale"?: string,"membership_id"?: string | null,"phone": string,"student_id"?: string | null,"telegram_user_id": number,"unlinked_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "center_id"?: string,"chat_id"?: number,"created_at"?: string,"guardian_id"?: string | null,"id"?: string,"linked_at"?: string,"locale"?: string,"membership_id"?: string | null,"phone"?: string,"student_id"?: string | null,"telegram_user_id"?: number,"unlinked_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "telegram_links_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "telegram_links_center_id_guardian_id_fkey"
      columns: ["center_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "telegram_links_center_id_membership_id_fkey"
      columns: ["center_id","membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "telegram_links_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "telegram_links_center_id_student_id_fkey"
      columns: ["center_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["center_id","id"]
    }
                  ]
                }
          }
          Views: {
            "student_overview": {
                  Row: {
                    "archived_at": string | null,"birth_date": string | null,"branch_id": string | null,"center_id": string | null,"course_ids": (string)[] | null,"created_at": string | null,"external_ref": string | null,"full_name": string | null,"gender": string | null,"group_ids": (string)[] | null,"id": string | null,"is_active": boolean | null,"phone": string | null,"school": string | null,"search_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "archived_at"?: string | null,"birth_date"?: string | null,"branch_id"?: string | null,"center_id"?: string | null,"course_ids"?: never,"created_at"?: string | null,"external_ref"?: string | null,"full_name"?: string | null,"gender"?: string | null,"group_ids"?: never,"id"?: string | null,"is_active"?: never,"phone"?: string | null,"school"?: string | null,"search_text"?: never
                         }
                        Update: {
                           "archived_at"?: string | null,"birth_date"?: string | null,"branch_id"?: string | null,"center_id"?: string | null,"course_ids"?: never,"created_at"?: string | null,"external_ref"?: string | null,"full_name"?: string | null,"gender"?: string | null,"group_ids"?: never,"id"?: string | null,"is_active"?: never,"phone"?: string | null,"school"?: string | null,"search_text"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "students_center_id_branch_id_fkey"
      columns: ["center_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["center_id","id"]
    },{
      foreignKeyName: "students_center_id_fkey"
      columns: ["center_id"]
isOneToOne: false
      referencedRelation: "centers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"add_holiday":
{ Args: { "p_branch_id"?: string,"p_center_id": string,"p_date": string,"p_name": string,"p_notify"?: boolean }; Returns: number
                           },
"attendance_lesson":
{ Args: { "p_lesson_id": string }; Returns: {
              "branch_id": string,"closes_at": string,"ends_at": string,"group_id": string,"group_name": string,"is_substitute": boolean,"lesson_id": string,"local_date": string,"mode": string,"opens_at": string,"room_name": string,"starts_at": string,"status": Database["public"]['Enums']["lesson_status"],"teacher_name": string,"timezone": string,"topic": string
            }[]
                           },
"attendance_matrix":
{ Args: { "p_from": string,"p_group_id": string,"p_to": string }; Returns: {
              "day_state": string,"full_name": string,"late_minutes": number,"lesson_id": string,"note": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string
            }[]
                           },
"attendance_sheet":
{ Args: { "p_lesson_id": string }; Returns: {
              "enrollment_id": string,"full_name": string,"is_expected": boolean,"late_minutes": number,"marked_at": string,"note": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string
            }[]
                           },
"cancel_lesson":
{ Args: { "p_center_fault"?: boolean,"p_lesson_id": string,"p_notify"?: boolean,"p_reason": string }; Returns: undefined
                           },
"check_schedule_conflicts":
{ Args: { "p_group_id": string,"p_rules": Json }; Returns: {
              "conflict_kind": string,"local_date": string,"other_group_name": string,"starts_at": string
            }[]
                           },
"course_default_prices":
{ Args: { "p_center_id": string }; Returns: {
              "course_id": string,"default_price_amount": number
            }[]
                           },
"create_center":
{ Args: { "p_branch_address"?: string,"p_branch_name": string,"p_locale": string,"p_name": string,"p_timezone": string }; Returns: string
                           },
"create_group":
{ Args: { "p_branch_id": string,"p_capacity"?: number,"p_course_id": string,"p_cycle_lessons"?: number,"p_end_date"?: string,"p_level_id"?: string,"p_name": string,"p_price_amount"?: number,"p_room_id"?: string,"p_rules"?: Json,"p_start_date": string,"p_teacher_membership_id"?: string }; Returns: string
                           },
"create_invite":
{ Args: { "p_branch_ids"?: (string)[],"p_center_id": string,"p_color"?: string,"p_display_name": string,"p_permissions"?: (string)[],"p_phone": string,"p_role": Database["public"]['Enums']["membership_role"] }; Returns: string
                           },
"create_makeup_lesson":
{ Args: { "p_duration_minutes": number,"p_for_lesson_id"?: string,"p_group_id": string,"p_is_billable"?: boolean,"p_notify"?: boolean,"p_room_id"?: string,"p_starts_at": string,"p_teacher_membership_id"?: string }; Returns: string
                           },
"end_enrollment":
{ Args: { "p_end_date": string,"p_enrollment_id": string,"p_reason": Database["public"]['Enums']["enrollment_end_reason"] }; Returns: undefined
                           },
"enroll":
{ Args: { "p_discount_amount"?: number,"p_discount_bp"?: number,"p_discount_reason"?: string,"p_group_id": string,"p_price_override_amount"?: number,"p_start_date"?: string,"p_student_id": string }; Returns: string
                           },
"freeze_enrollment":
{ Args: { "p_enrollment_id": string,"p_from": string,"p_reason"?: string,"p_to": string }; Returns: string
                           },
"generate_lessons":
{ Args: { "p_group_id": string }; Returns: number
                           },
"get_invite":
{ Args: { "p_token": string }; Returns: {
              "center_name": string,"display_name": string,"is_expired": boolean,"phone_hint": string,"role": Database["public"]['Enums']["membership_role"]
            }[]
                           },
"group_roster":
{ Args: { "p_group_id": string }; Returns: {
              "end_date": string,"enrollment_id": string,"full_name": string,"start_date": string,"status": Database["public"]['Enums']["enrollment_status"],"student_id": string
            }[]
                           },
"import_enrollments":
{ Args: { "p_job_id": string,"p_rows": Json }; Returns: Json
                           },
"import_groups":
{ Args: { "p_job_id": string,"p_rows": Json }; Returns: Json
                           },
"import_students":
{ Args: { "p_job_id": string,"p_rows": Json }; Returns: Json
                           },
"lesson_attendance_stats":
{ Args: { "p_lesson_ids": (string)[] }; Returns: {
              "absent": number,"excused": number,"expected": number,"late": number,"lesson_id": string,"marked": number,"present": number
            }[]
                           },
"lesson_move_conflicts":
{ Args: { "p_lesson_id": string,"p_room_id"?: string,"p_starts_at": string }; Returns: {
              "conflict_kind": string,"other_group_name": string,"other_starts_at": string
            }[]
                           },
"move_lesson":
{ Args: { "p_lesson_id": string,"p_notify"?: boolean,"p_room_id"?: string,"p_starts_at": string }; Returns: undefined
                           },
"next_lesson_date":
{ Args: { "p_group_id": string }; Returns: string
                           },
"regenerate_invite":
{ Args: { "p_membership_id": string }; Returns: string
                           },
"remove_holiday":
{ Args: { "p_holiday_id": string }; Returns: undefined
                           },
"resolve_conflict":
{ Args: { "p_conflict_id": string,"p_resolution": string,"p_room_id"?: string,"p_starts_at"?: string }; Returns: string
                           },
"save_attendance":
{ Args: { "p_lesson_id": string,"p_rows": Json,"p_topic"?: string }; Returns: Json
                           },
"save_schedule_rules":
{ Args: { "p_group_id": string,"p_rules": Json }; Returns: Json
                           },
"set_group_price":
{ Args: { "p_cycle_lessons": number,"p_effective_from": string,"p_group_id": string,"p_price_amount": number }; Returns: string
                           },
"set_lesson_topic":
{ Args: { "p_lesson_id": string,"p_topic": string }; Returns: undefined
                           },
"substitute_teacher":
{ Args: { "p_lesson_id": string,"p_membership_id": string }; Returns: undefined
                           },
"transfer_enrollment":
{ Args: { "p_date": string,"p_enrollment_id": string,"p_keep_discount"?: boolean,"p_target_group_id": string }; Returns: string
                           },
"unlink_guardian":
{ Args: { "p_guardian_id": string,"p_student_id": string }; Returns: undefined
                           },
"update_guardian":
{ Args: { "p_full_name": string,"p_guardian_id": string,"p_locale"?: string,"p_phone": string }; Returns: undefined
                           },
"upsert_guardian":
{ Args: { "p_full_name": string,"p_is_primary"?: boolean,"p_phone": string,"p_receives_billing"?: boolean,"p_receives_notifications"?: boolean,"p_relation"?: string,"p_student_id": string }; Returns: Json
                           }
          }
          Enums: {
            "attendance_status": "present"|"late"|"absent"|"excused","center_status": "trial"|"active"|"past_due"|"read_only"|"cancelled","enrollment_end_reason": "completed"|"dropped"|"transferred"|"moved_level","enrollment_status": "active"|"frozen"|"ended","group_status": "forming"|"active"|"finished","lesson_status": "scheduled"|"held"|"cancelled","membership_role": "owner"|"admin"|"teacher","membership_status": "invited"|"active"|"disabled","notification_channel": "telegram"|"sms"|"whatsapp"|"email","outbox_status": "pending"|"sending"|"sent"|"failed"|"cancelled"|"skipped"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "attendance_status": ["present", "late", "absent", "excused"],"center_status": ["trial", "active", "past_due", "read_only", "cancelled"],"enrollment_end_reason": ["completed", "dropped", "transferred", "moved_level"],"enrollment_status": ["active", "frozen", "ended"],"group_status": ["forming", "active", "finished"],"lesson_status": ["scheduled", "held", "cancelled"],"membership_role": ["owner", "admin", "teacher"],"membership_status": ["invited", "active", "disabled"],"notification_channel": ["telegram", "sms", "whatsapp", "email"],"outbox_status": ["pending", "sending", "sent", "failed", "cancelled", "skipped"]
          }
        }
} as const
