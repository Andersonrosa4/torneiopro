-- Add unique index on tournament_code for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_tournament_code ON public.tournaments (tournament_code) WHERE tournament_code IS NOT NULL;
