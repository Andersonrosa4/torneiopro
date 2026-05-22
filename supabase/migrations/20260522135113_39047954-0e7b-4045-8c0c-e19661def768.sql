ALTER TABLE public.rankings ADD COLUMN IF NOT EXISTS stage_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_rankings_tourn_mod_stage ON public.rankings (tournament_id, modality_id, stage_id);