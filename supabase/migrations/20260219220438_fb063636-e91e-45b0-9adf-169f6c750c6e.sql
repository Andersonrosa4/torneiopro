
-- Add tennis and padel to sport_type enum
ALTER TYPE public.sport_type ADD VALUE IF NOT EXISTS 'tennis';
ALTER TYPE public.sport_type ADD VALUE IF NOT EXISTS 'padel';

-- Create tournament_rules table for detailed scoring configuration
CREATE TABLE public.tournament_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  
  -- Mode
  mode TEXT NOT NULL DEFAULT 'doubles', -- singles | doubles
  
  -- Sets format
  sets_format TEXT NOT NULL DEFAULT 'best_of_3', -- best_of_3 | best_of_5
  games_to_win_set INTEGER NOT NULL DEFAULT 6,
  min_difference INTEGER NOT NULL DEFAULT 2,
  
  -- Tiebreak
  tiebreak_enabled BOOLEAN NOT NULL DEFAULT true,
  tiebreak_at TEXT NOT NULL DEFAULT '6-6',
  tiebreak_points INTEGER NOT NULL DEFAULT 7,
  
  -- Final set
  final_set_tiebreak_mode TEXT NOT NULL DEFAULT 'normal', -- normal | super_tiebreak | advantage
  
  -- Super tiebreak
  super_tiebreak_enabled BOOLEAN NOT NULL DEFAULT false,
  super_tiebreak_points INTEGER NOT NULL DEFAULT 10,
  super_tiebreak_replaces_third_set BOOLEAN NOT NULL DEFAULT false,
  
  -- Scoring variants
  no_ad BOOLEAN NOT NULL DEFAULT false,
  golden_point BOOLEAN NOT NULL DEFAULT false,
  points_sequence TEXT NOT NULL DEFAULT '0,15,30,40,ADV',
  
  -- Server
  first_server TEXT NOT NULL DEFAULT 'coin_toss', -- coin_toss | manual
  server_rotation TEXT NOT NULL DEFAULT 'fixed_order',
  
  -- Match rules
  walkover_enabled BOOLEAN NOT NULL DEFAULT true,
  retirement_keep_score BOOLEAN NOT NULL DEFAULT true,
  
  -- Ranking criteria
  ranking_criteria_order TEXT NOT NULL DEFAULT 'WINS,HEAD_TO_HEAD,SETS_DIFF,GAMES_DIFF,POINTS_DIFF,RANDOM',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tournament_id)
);

-- Enable RLS
ALTER TABLE public.tournament_rules ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view tournament_rules"
  ON public.tournament_rules FOR SELECT USING (true);

CREATE POLICY "Creator can insert tournament_rules"
  ON public.tournament_rules FOR INSERT
  WITH CHECK (is_tournament_creator(tournament_id));

CREATE POLICY "Creator can update tournament_rules"
  ON public.tournament_rules FOR UPDATE
  USING (is_tournament_creator(tournament_id));

CREATE POLICY "Creator can delete tournament_rules"
  ON public.tournament_rules FOR DELETE
  USING (is_tournament_creator(tournament_id));

-- Trigger for updated_at
CREATE TRIGGER update_tournament_rules_updated_at
  BEFORE UPDATE ON public.tournament_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_rules;
