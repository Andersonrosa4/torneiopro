ALTER TABLE public.rankings 
  ADD COLUMN IF NOT EXISTS manual_bonus integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.rankings.manual_bonus IS 'Pontos extras lançados manualmente (destaques/bônus). Preservados ao regenerar o ranking automático. points = pontos_auto + manual_bonus';