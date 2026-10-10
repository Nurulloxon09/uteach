// Generated shape for the public schema. Regenerate with `pnpm db:types` (needs `pnpm db:start`).
// Until Docker is available this file is maintained by hand to match supabase/migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_kind: string;
          actor_profile_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          center_id: string | null;
          id: number;
          row_id: string | null;
          table_name: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      branches: {
        Row: {
          address: string | null;
          archived_at: string | null;
          center_id: string;
          created_at: string;
          id: string;
          name: string;
          phone: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          center_id: string;
          name: string;
          phone?: string | null;
          timezone: string;
        };
        Update: {
          address?: string | null;
          archived_at?: string | null;
          name?: string;
          phone?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      centers: {
        Row: {
          archived_at: string | null;
          country_code: string;
          created_at: string;
          currency: string;
          default_locale: string;
          id: string;
          name: string;
          settings: Json;
          slug: string;
          status: Database["public"]["Enums"]["center_status"];
          timezone: string;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: {
          default_locale?: string;
          name?: string;
          settings?: Json;
          timezone?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          branch_ids: string[];
          center_id: string;
          color: string | null;
          created_at: string;
          display_name: string;
          id: string;
          invite_expires_at: string | null;
          invite_token_hash: string | null;
          invited_phone: string | null;
          permissions: string[];
          profile_id: string | null;
          role: Database["public"]["Enums"]["membership_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
        };
        Insert: never;
        Update: {
          branch_ids?: string[];
          color?: string | null;
          display_name?: string;
          permissions?: string[];
          role?: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Relationships: [
          {
            foreignKeyName: "memberships_center_id_fkey";
            columns: ["center_id"];
            isOneToOne: false;
            referencedRelation: "centers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_super_admin: boolean;
          locale: string;
          phone: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          full_name?: string;
          locale?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          archived_at: string | null;
          branch_id: string;
          capacity: number | null;
          center_id: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          branch_id: string;
          capacity?: number | null;
          center_id: string;
          name: string;
        };
        Update: {
          archived_at?: string | null;
          capacity?: number | null;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      create_center: {
        Args: {
          p_branch_address?: string | null;
          p_branch_name: string;
          p_locale: string;
          p_name: string;
          p_timezone: string;
        };
        Returns: string;
      };
      create_invite: {
        Args: {
          p_branch_ids?: string[];
          p_center_id: string;
          p_color?: string | null;
          p_display_name: string;
          p_permissions?: string[];
          p_phone: string;
          p_role: Database["public"]["Enums"]["membership_role"];
        };
        Returns: string;
      };
      get_invite: {
        Args: { p_token: string };
        Returns: {
          center_name: string;
          display_name: string;
          is_expired: boolean;
          phone_hint: string;
          role: Database["public"]["Enums"]["membership_role"];
        }[];
      };
      regenerate_invite: {
        Args: { p_membership_id: string };
        Returns: string;
      };
    };
    Enums: {
      center_status: "trial" | "active" | "past_due" | "read_only" | "cancelled";
      membership_role: "owner" | "admin" | "teacher";
      membership_status: "invited" | "active" | "disabled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
