
-- Add live_score JSONB column to matches for point-by-point scoring
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS live_score JSONB DEFAULT NULL;

-- Add index for querying matches with live scores
CREATE INDEX IF NOT EXISTS idx_matches_live_score ON public.matches USING GIN (live_score) WHERE live_score IS NOT NULL;
