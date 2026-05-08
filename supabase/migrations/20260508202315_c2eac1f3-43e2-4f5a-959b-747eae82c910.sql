
CREATE TABLE IF NOT EXISTS public.bracket_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  modality_id uuid,
  stage_id uuid,
  reason text NOT NULL DEFAULT 'undo_bracket',
  matches_snapshot jsonb NOT NULL,
  groups_snapshot jsonb,
  classificacao_snapshot jsonb,
  match_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bracket_backups_tournament ON public.bracket_backups(tournament_id, created_at DESC);

ALTER TABLE public.bracket_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament access can view backups" ON public.bracket_backups;
CREATE POLICY "Tournament access can view backups"
ON public.bracket_backups FOR SELECT
USING (public.has_tournament_access(tournament_id));

DROP POLICY IF EXISTS "Tournament access can insert backups" ON public.bracket_backups;
CREATE POLICY "Tournament access can insert backups"
ON public.bracket_backups FOR INSERT
WITH CHECK (public.has_tournament_access(tournament_id));

DROP POLICY IF EXISTS "Tournament access can delete backups" ON public.bracket_backups;
CREATE POLICY "Tournament access can delete backups"
ON public.bracket_backups FOR DELETE
USING (public.has_tournament_access(tournament_id));
