
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
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
                    "archived_at": string | null,"country_code": string,"created_at": string,"currency": string,"default_locale": string,"id": string,"name": string,"settings": NonNullable<Json>,"slug": string,"status": Database["public"]['Enums']["center_status"],"timezone": string,"trial_ends_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"country_code"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"id"?: string,"name": string,"settings"?: NonNullable<Json>,"slug": string,"status"?: Database["public"]['Enums']["center_status"],"timezone"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"country_code"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"id"?: string,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"status"?: Database["public"]['Enums']["center_status"],"timezone"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"create_center":
{ Args: { "p_branch_address"?: string,"p_branch_name": string,"p_locale": string,"p_name": string,"p_timezone": string }; Returns: string
                           },
"create_invite":
{ Args: { "p_branch_ids"?: (string)[],"p_center_id": string,"p_color"?: string,"p_display_name": string,"p_permissions"?: (string)[],"p_phone": string,"p_role": Database["public"]['Enums']["membership_role"] }; Returns: string
                           },
"get_invite":
{ Args: { "p_token": string }; Returns: {
              "center_name": string,"display_name": string,"is_expired": boolean,"phone_hint": string,"role": Database["public"]['Enums']["membership_role"]
            }[]
                           },
"regenerate_invite":
{ Args: { "p_membership_id": string }; Returns: string
                           }
          }
          Enums: {
            "center_status": "trial"|"active"|"past_due"|"read_only"|"cancelled","membership_role": "owner"|"admin"|"teacher","membership_status": "invited"|"active"|"disabled"
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
            "center_status": ["trial", "active", "past_due", "read_only", "cancelled"],"membership_role": ["owner", "admin", "teacher"],"membership_status": ["invited", "active", "disabled"]
          }
        }
} as const
