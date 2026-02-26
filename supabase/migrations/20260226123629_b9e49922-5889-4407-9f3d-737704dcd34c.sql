
-- Create tournament_stages table
CREATE TABLE public.tournament_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  event_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tournament_stages ENABLE ROW LEVEL SECURITY;

-- Anyone can view stages
CREATE POLICY "Anyone can view tournament_stages"
  ON public.tournament_stages FOR SELECT
  USING (true);

-- Organizer can insert stages
CREATE POLICY "Organizer can insert tournament_stages"
  ON public.tournament_stages FOR INSERT
  WITH CHECK (has_tournament_access(tournament_id));

-- Organizer can update stages
CREATE POLICY "Organizer can update tournament_stages"
  ON public.tournament_stages FOR UPDATE
  USING (has_tournament_access(tournament_id));

-- Organizer can delete stages
CREATE POLICY "Organizer can delete tournament_stages"
  ON public.tournament_stages FOR DELETE
  USING (has_tournament_access(tournament_id));

-- Add stage_id to teams (nullable for backward compat)
ALTER TABLE public.teams ADD COLUMN stage_id UUID REFERENCES public.tournament_stages(id) ON DELETE SET NULL;

-- Add stage_id to matches (nullable for backward compat)
ALTER TABLE public.matches ADD COLUMN stage_id UUID REFERENCES public.tournament_stages(id) ON DELETE SET NULL;

-- Add stage_id to ranking_points_history for tracking which stage gave points
ALTER TABLE public.ranking_points_history ADD COLUMN stage_id UUID REFERENCES public.tournament_stages(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_tournament_stages_tournament ON public.tournament_stages(tournament_id);
CREATE INDEX idx_teams_stage ON public.teams(stage_id);
CREATE INDEX idx_matches_stage ON public.matches(stage_id);

-- Enable realtime for stages
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_stages;
