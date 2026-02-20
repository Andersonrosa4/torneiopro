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
      arena_admins: {
        Row: {
          arena_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          arena_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          arena_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_admins_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "arenas"
            referencedColumns: ["id"]
          },
        ]
      }
      arenas: {
        Row: {
          active: boolean
          address: string | null
          cancel_policy_hours: number
          city_id: string
          closing_time: string
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          opening_time: string
          phone: string | null
          state_id: string
          whatsapp: string | null
          working_days: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          cancel_policy_hours?: number
          city_id: string
          closing_time?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          opening_time?: string
          phone?: string | null
          state_id: string
          whatsapp?: string | null
          working_days?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          cancel_policy_hours?: number
          city_id?: string
          closing_time?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          opening_time?: string
          phone?: string | null
          state_id?: string
          whatsapp?: string | null
          working_days?: string
        }
        Relationships: [
          {
            foreignKeyName: "arenas_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arenas_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          arena_id: string
          booking_date: string
          court_id: string
          created_at: string
          end_time: string
          id: string
          payment_method: string | null
          payment_status: string
          start_time: string
          status: string
          user_id: string
        }
        Insert: {
          arena_id: string
          booking_date: string
          court_id: string
          created_at?: string
          end_time: string
          id?: string
          payment_method?: string | null
          payment_status?: string
          start_time: string
          status?: string
          user_id: string
        }
        Update: {
          arena_id?: string
          booking_date?: string
          court_id?: string
          created_at?: string
          end_time?: string
          id?: string
          payment_method?: string | null
          payment_status?: string
          start_time?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          id: string
          name: string
          state_id: string
        }
        Insert: {
          id?: string
          name: string
          state_id: string
        }
        Update: {
          id?: string
          name?: string
          state_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
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
      court_bookings: {
        Row: {
          arena_id: string
          court_id: string
          created_at: string
          customer_id: string
          date: string
          end_time: string
          id: string
          payment_status: string
          penalty_value: number
          price: number
          start_time: string
          status: string
        }
        Insert: {
          arena_id: string
          court_id: string
          created_at?: string
          customer_id: string
          date: string
          end_time: string
          id?: string
          payment_status?: string
          penalty_value?: number
          price?: number
          start_time: string
          status?: string
        }
        Update: {
          arena_id?: string
          court_id?: string
          created_at?: string
          customer_id?: string
          date?: string
          end_time?: string
          id?: string
          payment_status?: string
          penalty_value?: number
          price?: number
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_bookings_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      court_time_slots: {
        Row: {
          court_id: string
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          status: string
        }
        Insert: {
          court_id: string
          created_at?: string
          date: string
          end_time: string
          id?: string
          start_time: string
          status?: string
        }
        Update: {
          court_id?: string
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_time_slots_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          active: boolean
          arena_id: string
          created_at: string
          id: string
          name: string
          price_per_slot: number
          slot_duration_minutes: number
          sport_type: string
          surface_type: string | null
        }
        Insert: {
          active?: boolean
          arena_id: string
          created_at?: string
          id?: string
          name: string
          price_per_slot?: number
          slot_duration_minutes?: number
          sport_type?: string
          surface_type?: string | null
        }
        Update: {
          active?: boolean
          arena_id?: string
          created_at?: string
          id?: string
          name?: string
          price_per_slot?: number
          slot_duration_minutes?: number
          sport_type?: string
          surface_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courts_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "arenas"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wallet: {
        Row: {
          balance: number
          customer_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          customer_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_wallet_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city_id: string | null
          cpf: string
          created_at: string
          id: string
          name: string
          phone: string
          state_id: string | null
        }
        Insert: {
          city_id?: string | null
          cpf: string
          created_at?: string
          id?: string
          name: string
          phone: string
          state_id?: string | null
        }
        Update: {
          city_id?: string | null
          cpf?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          state_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
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
          live_score: Json | null
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
          live_score?: Json | null
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
          live_score?: Json | null
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
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          method: string
          status: string
        }
        Insert: {
          amount?: number
          booking_id: string
          created_at?: string
          id?: string
          method?: string
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          method?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "court_bookings"
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
      states: {
        Row: {
          id: string
          name: string
          uf: string
        }
        Insert: {
          id?: string
          name: string
          uf: string
        }
        Update: {
          id?: string
          name?: string
          uf?: string
        }
        Relationships: []
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
      tournament_organizers: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          organizer_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          organizer_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          organizer_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_organizers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_organizers_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_organizers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rules: {
        Row: {
          allow_draw: boolean
          created_at: string
          extra_time_halves: number
          extra_time_minutes: number
          final_set_tiebreak_mode: string
          first_server: string
          games_to_win_set: number
          golden_goal_extra_time: boolean
          golden_point: boolean
          half_duration_minutes: number
          halftime_interval_minutes: number
          halves_count: number
          id: string
          min_difference: number
          mode: string
          no_ad: boolean
          penalties_kicks: number
          points_sequence: string
          ranking_criteria_order: string
          retirement_keep_score: boolean
          server_rotation: string
          sets_format: string
          stop_clock_last_minutes: number
          super_tiebreak_enabled: boolean
          super_tiebreak_points: number
          super_tiebreak_replaces_third_set: boolean
          tiebreak_at: string
          tiebreak_enabled: boolean
          tiebreak_points: number
          tournament_id: string
          updated_at: string
          use_extra_time: boolean
          use_penalties: boolean
          walkover_enabled: boolean
          wo_enabled: boolean
        }
        Insert: {
          allow_draw?: boolean
          created_at?: string
          extra_time_halves?: number
          extra_time_minutes?: number
          final_set_tiebreak_mode?: string
          first_server?: string
          games_to_win_set?: number
          golden_goal_extra_time?: boolean
          golden_point?: boolean
          half_duration_minutes?: number
          halftime_interval_minutes?: number
          halves_count?: number
          id?: string
          min_difference?: number
          mode?: string
          no_ad?: boolean
          penalties_kicks?: number
          points_sequence?: string
          ranking_criteria_order?: string
          retirement_keep_score?: boolean
          server_rotation?: string
          sets_format?: string
          stop_clock_last_minutes?: number
          super_tiebreak_enabled?: boolean
          super_tiebreak_points?: number
          super_tiebreak_replaces_third_set?: boolean
          tiebreak_at?: string
          tiebreak_enabled?: boolean
          tiebreak_points?: number
          tournament_id: string
          updated_at?: string
          use_extra_time?: boolean
          use_penalties?: boolean
          walkover_enabled?: boolean
          wo_enabled?: boolean
        }
        Update: {
          allow_draw?: boolean
          created_at?: string
          extra_time_halves?: number
          extra_time_minutes?: number
          final_set_tiebreak_mode?: string
          first_server?: string
          games_to_win_set?: number
          golden_goal_extra_time?: boolean
          golden_point?: boolean
          half_duration_minutes?: number
          halftime_interval_minutes?: number
          halves_count?: number
          id?: string
          min_difference?: number
          mode?: string
          no_ad?: boolean
          penalties_kicks?: number
          points_sequence?: string
          ranking_criteria_order?: string
          retirement_keep_score?: boolean
          server_rotation?: string
          sets_format?: string
          stop_clock_last_minutes?: number
          super_tiebreak_enabled?: boolean
          super_tiebreak_points?: number
          super_tiebreak_replaces_third_set?: boolean
          tiebreak_at?: string
          tiebreak_enabled?: boolean
          tiebreak_points?: number
          tournament_id?: string
          updated_at?: string
          use_extra_time?: boolean
          use_penalties?: boolean
          walkover_enabled?: boolean
          wo_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
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
      user_debts: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          id: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_debts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      is_arena_admin: { Args: { _arena_id: string }; Returns: boolean }
      is_tournament_creator: {
        Args: { _tournament_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "organizer" | "athlete"
      match_status: "pending" | "in_progress" | "completed"
      sport_type:
        | "beach_volleyball"
        | "futevolei"
        | "beach_tennis"
        | "tennis"
        | "padel"
        | "futsal"
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
      sport_type: [
        "beach_volleyball",
        "futevolei",
        "beach_tennis",
        "tennis",
        "padel",
        "futsal",
      ],
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
