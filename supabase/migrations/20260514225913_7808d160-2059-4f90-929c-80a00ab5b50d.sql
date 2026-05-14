CREATE OR REPLACE FUNCTION public.validate_group_match_has_teams()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.round = 0 THEN
    IF NEW.team1_id IS NULL OR NEW.team2_id IS NULL THEN
      RAISE EXCEPTION '[GUARD 1.4] Fase de grupos não permite partida com dupla A definir — todos contra todos deve ter duas duplas reais.';
    END IF;

    IF COALESCE(NEW.is_chapeu, false) THEN
      RAISE EXCEPTION '[GUARD 1.4] Fase de grupos não permite chapéu — descanso não é partida.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_group_match_has_teams ON public.matches;
CREATE TRIGGER trg_validate_group_match_has_teams
BEFORE INSERT OR UPDATE OF round, team1_id, team2_id, is_chapeu ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_group_match_has_teams();