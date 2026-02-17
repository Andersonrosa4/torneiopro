export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      classificacao_grupos: {
        Row: {
          created_at: string
          derrotas: number
          group_id: string
          id: string
          jogos: number
          pontos: number
          saldo_sets: number
          sets_contra: number
          sets_pro: number
          team_id: string
          tournament_id: string
          vitorias: number
        }
        Insert: {
          created_at?: string
          derrotas?: number
          group_id: string
          id?: string
          jogos?: number
          pontos?: number
          saldo_sets?: number
          sets_contra?: number
          sets_pro?: number
          team_id: string
          tournament_id: string
          vitorias?: number
        }
        Update: {
          created_at?: string
          derrotas?: number
          group_id?: string
          id?: string
          jogos?: number
          pontos?: number
          saldo_sets?: number
          sets_contra?: number
          sets_pro?: number
          team_id?: string
          tournament_id?: string
          vitorias?: number
        }
        Relationships: [
          {
            foreignKeyName: "classificacao_grupos_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classificacao_grupos_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classificacao_grupos_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          bracket_half: string | null
          bracket_number: number | null
          bracket_type: string | null
          created_at: string
          id: string
          is_chapeu: boolean | null
          modality_id: string | null
          next_lose_match_id: string | null
          next_win_match_id: string | null
          participant1_id: string | null
          participant2_id: string | null
          position: number
          round: number
          score1: number | null
          score2: number | null
          status: Database["public"]["Enums"]["match_status"]
          team1_id: string | null
          team2_id: string | null
          tournament_id: string
          winner_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          bracket_half?: string | null
          bracket_number?: number | null
          bracket_type?: string | null
          created_at?: string
          id?: string
          is_chapeu?: boolean | null
          modality_id?: string | null
          next_lose_match_id?: string | null
          next_win_match_id?: string | null
          participant1_id?: string | null
          participant2_id?: string | null
          position: number
          round: number
          score1?: number | null
          score2?: number | null
          status?: Database["public"]["Enums"]["match_status"]
          team1_id?: string | null
          team2_id?: string | null
          tournament_id: string
          winner_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          bracket_half?: string | null
          bracket_number?: number | null
          bracket_type?: string | null
          created_at?: string
          id?: string
          is_chapeu?: boolean | null
          modality_id?: string | null
          next_lose_match_id?: string | null
          next_win_match_id?: string | null
          participant1_id?: string | null
          participant2_id?: string | null
          position?: number
          round?: number
          score1?: number | null
          score2?: number | null
          status?: Database["public"]["Enums"]["match_status"]
          team1_id?: string | null
          team2_id?: string | null
          tournament_id?: string
          winner_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_modality_id_fkey"
            columns: ["modality_id"]
            isOneToOne: false
            referencedRelation: "modalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_lose_match_id_fkey"
            columns: ["next_lose_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_win_match_id_fkey"
            columns: ["next_win_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_participant2_id_fkey"
            columns: ["participant2_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      modalities: {
        Row: {
          created_at: string
          game_system: string
          id: string
          name: string
          sport: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          game_system?: string
          id?: string
          name: string
          sport?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          game_system?: string
          id?: string
          name?: string
          sport?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modalities_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          created_at: string
          created_by: string
          display_name: string | null
          email: string | null
          id: string
          last_online_at: string | null
          password_hash: string
          role: string
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_online_at?: string | null
          password_hash: string
          role?: string
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_online_at?: string | null
          password_hash?: string
          role?: string
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          created_at: string
          id: string
          name: string
          seed: number | null
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          seed?: number | null
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          seed?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          correct_option: string
          created_at: string
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question: string
          sport: string
        }
        Insert: {
          correct_option: string
          created_at?: string
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question: string
          sport: string
        }
        Update: {
          correct_option?: string
          created_at?: string
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question?: string
          sport?: string
        }
        Relationships: []
      }
      quiz_scores: {
        Row: {
          created_at: string
          id: string
          player_name: string
          score: number
          sport: string
          total_questions: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_name: string
          score?: number
          sport: string
          total_questions?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_name?: string
          score?: number
          sport?: string
          total_questions?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_scores_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      rankings: {
        Row: {
          athlete_name: string
          created_at: string
          created_by: string
          id: string
          points: number
          sport: Database["public"]["Enums"]["sport_type"]
          tournament_id: string | null
        }
        Insert: {
          athlete_name: string
          created_at?: string
          created_by: string
          id?: string
          points?: number
          sport: Database["public"]["Enums"]["sport_type"]
          tournament_id?: string | null
        }
        Update: {
          athlete_name?: string
          created_at?: string
          created_by?: string
          id?: string
          points?: number
          sport?: Database["public"]["Enums"]["sport_type"]
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rankings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          is_fictitious: boolean | null
          modality_id: string | null
          payment_status: string | null
          player1_name: string
          player2_name: string
          seed: number | null
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_fictitious?: boolean | null
          modality_id?: string | null
          payment_status?: string | null
          player1_name: string
          player2_name: string
          seed?: number | null
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_fictitious?: boolean | null
          modality_id?: string | null
          payment_status?: string | null
          player1_name?: string
          player2_name?: string
          seed?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_modality_id_fkey"
            columns: ["modality_id"]
            isOneToOne: false
            referencedRelation: "modalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          event_date: string | null
          format: string
          games_per_set: number | null
          id: string
          location: string | null
          max_participants: number
          name: string
          num_brackets: number | null
          num_sets: number | null
          registration_value: number | null
          sport: Database["public"]["Enums"]["sport_type"]
          status: Database["public"]["Enums"]["tournament_status"]
          tournament_code: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          event_date?: string | null
          format?: string
          games_per_set?: number | null
          id?: string
          location?: string | null
          max_participants?: number
          name: string
          num_brackets?: number | null
          num_sets?: number | null
          registration_value?: number | null
          sport?: Database["public"]["Enums"]["sport_type"]
          status?: Database["public"]["Enums"]["tournament_status"]
          tournament_code: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          event_date?: string | null
          format?: string
          games_per_set?: number | null
          id?: string
          location?: string | null
          max_participants?: number
          name?: string
          num_brackets?: number | null
          num_sets?: number | null
          registration_value?: number | null
          sport?: Database["public"]["Enums"]["sport_type"]
          status?: Database["public"]["Enums"]["tournament_status"]
          tournament_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tournament_creator: {
        Args: { _tournament_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "organizer" | "athlete"
      match_status: "pending" | "in_progress" | "completed"
      sport_type: "beach_volleyball" | "futevolei" | "beach_tennis"
      tournament_status:
        | "draft"
        | "registration"
        | "in_progress"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "organizer", "athlete"],
      match_status: ["pending", "in_progress", "completed"],
      sport_type: ["beach_volleyball", "futevolei", "beach_tennis"],
      tournament_status: [
        "draft",
        "registration",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
