
CREATE OR REPLACE FUNCTION public.guard_match_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Placar nunca negativo
  IF NEW.score1 IS NOT NULL AND NEW.score1 < 0 THEN
    RAISE EXCEPTION '[GUARD] score1 não pode ser negativo (recebido: %)', NEW.score1;
  END IF;
  IF NEW.score2 IS NOT NULL AND NEW.score2 < 0 THEN
    RAISE EXCEPTION '[GUARD] score2 não pode ser negativo (recebido: %)', NEW.score2;
  END IF;

  -- winner_team_id deve ser team1_id ou team2_id (quando ambos existem)
  IF NEW.winner_team_id IS NOT NULL
     AND NEW.team1_id IS NOT NULL
     AND NEW.team2_id IS NOT NULL
     AND NEW.winner_team_id <> NEW.team1_id
     AND NEW.winner_team_id <> NEW.team2_id THEN
    RAISE EXCEPTION '[GUARD] winner_team_id (%) não pertence aos times da partida (% vs %)',
      NEW.winner_team_id, NEW.team1_id, NEW.team2_id;
  END IF;

  -- Próxima partida (vencedor) deve ser de rodada maior
  IF NEW.next_win_match_id IS NOT NULL AND NEW.next_win_match_id = NEW.id THEN
    RAISE EXCEPTION '[GUARD] next_win_match_id não pode apontar para si mesma (%)', NEW.id;
  END IF;
  IF NEW.next_lose_match_id IS NOT NULL AND NEW.next_lose_match_id = NEW.id THEN
    RAISE EXCEPTION '[GUARD] next_lose_match_id não pode apontar para si mesma (%)', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_match_integrity ON public.matches;
CREATE TRIGGER trg_guard_match_integrity
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.guard_match_integrity();

-- Auditoria leve: log de quem apagou a chave
CREATE TABLE IF NOT EXISTS public.bracket_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  modality_id uuid,
  stage_id uuid,
  action text NOT NULL,
  detail jsonb,
  user_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bracket_audit_log_tournament ON public.bracket_audit_log(tournament_id, created_at DESC);

ALTER TABLE public.bracket_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament access can view audit" ON public.bracket_audit_log;
CREATE POLICY "Tournament access can view audit"
ON public.bracket_audit_log FOR SELECT
USING (public.has_tournament_access(tournament_id));

DROP POLICY IF EXISTS "Tournament access can insert audit" ON public.bracket_audit_log;
CREATE POLICY "Tournament access can insert audit"
ON public.bracket_audit_log FOR INSERT
WITH CHECK (public.has_tournament_access(tournament_id));
