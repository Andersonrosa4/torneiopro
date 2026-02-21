
-- Generic game scores table for mini-games (rally, etc.)
CREATE TABLE public.game_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL DEFAULT 'rally',
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  sport TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- Anyone can view scores
CREATE POLICY "Anyone can view game_scores"
ON public.game_scores FOR SELECT
USING (true);

-- Anyone can insert scores (public game)
CREATE POLICY "Anyone can insert game_scores"
ON public.game_scores FOR INSERT
WITH CHECK (true);

-- Only organizers can delete scores
CREATE POLICY "Organizer can delete game_scores"
ON public.game_scores FOR DELETE
USING (has_tournament_access(tournament_id));

-- Index for fast lookups
CREATE INDEX idx_game_scores_tournament_game ON public.game_scores(tournament_id, game_type, sport);
