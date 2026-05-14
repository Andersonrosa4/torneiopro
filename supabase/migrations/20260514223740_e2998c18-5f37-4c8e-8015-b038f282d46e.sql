-- Trigger que impede uma equipe de ser colocada em múltiplos grupos (bracket_number)
-- da fase de grupos (round = 0) dentro da mesma modalidade.
CREATE OR REPLACE FUNCTION public.validate_team_single_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflicting_bracket integer;
  team_name text;
BEGIN
  IF NEW.round IS DISTINCT FROM 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.modality_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- team1
  IF NEW.team1_id IS NOT NULL THEN
    SELECT bracket_number INTO conflicting_bracket
    FROM public.matches
    WHERE modality_id = NEW.modality_id
      AND round = 0
      AND id != NEW.id
      AND COALESCE(bracket_number, 1) <> COALESCE(NEW.bracket_number, 1)
      AND (team1_id = NEW.team1_id OR team2_id = NEW.team1_id)
    LIMIT 1;
    IF conflicting_bracket IS NOT NULL THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team1_id;
      RAISE EXCEPTION '[GUARD 1.5] Equipe "%" (%) já está no Grupo % desta modalidade — uma equipe só pode pertencer a um grupo da fase de grupos.',
        team_name, NEW.team1_id, conflicting_bracket;
    END IF;
  END IF;

  -- team2
  IF NEW.team2_id IS NOT NULL THEN
    SELECT bracket_number INTO conflicting_bracket
    FROM public.matches
    WHERE modality_id = NEW.modality_id
      AND round = 0
      AND id != NEW.id
      AND COALESCE(bracket_number, 1) <> COALESCE(NEW.bracket_number, 1)
      AND (team1_id = NEW.team2_id OR team2_id = NEW.team2_id)
    LIMIT 1;
    IF conflicting_bracket IS NOT NULL THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team2_id;
      RAISE EXCEPTION '[GUARD 1.5] Equipe "%" (%) já está no Grupo % desta modalidade — uma equipe só pode pertencer a um grupo da fase de grupos.',
        team_name, NEW.team2_id, conflicting_bracket;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_team_single_group ON public.matches;
CREATE TRIGGER trg_validate_team_single_group
BEFORE INSERT OR UPDATE OF team1_id, team2_id, bracket_number ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_team_single_group();