
-- Trigger de validação: impede atribuir um time a uma partida se:
-- 1) O time não pertence à mesma modalidade da partida
-- 2) O time já está em outra partida do mesmo round (duplicidade)

CREATE OR REPLACE FUNCTION public.validate_match_team_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  match_modality_id uuid;
  team_modality_id uuid;
  duplicate_match_id uuid;
  team_name text;
BEGIN
  -- Só validar se team1_id ou team2_id mudaram
  IF (TG_OP = 'UPDATE' AND 
      NEW.team1_id IS NOT DISTINCT FROM OLD.team1_id AND 
      NEW.team2_id IS NOT DISTINCT FROM OLD.team2_id) THEN
    RETURN NEW;
  END IF;

  match_modality_id := NEW.modality_id;

  -- Se a partida não tem modalidade, pular validação (torneios antigos)
  IF match_modality_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ═══ VALIDAÇÃO 1: Team1 pertence à modalidade ═══
  IF NEW.team1_id IS NOT NULL THEN
    SELECT modality_id INTO team_modality_id FROM public.teams WHERE id = NEW.team1_id;
    IF team_modality_id IS NOT NULL AND team_modality_id != match_modality_id THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team1_id;
      RAISE EXCEPTION '[GUARD] Time "%" (%) pertence à modalidade % mas a partida é da modalidade %. Atribuição bloqueada.',
        team_name, NEW.team1_id, team_modality_id, match_modality_id;
    END IF;

    -- ═══ VALIDAÇÃO 2: Team1 não está duplicado no mesmo round ═══
    SELECT id INTO duplicate_match_id
    FROM public.matches
    WHERE modality_id = match_modality_id
      AND round = NEW.round
      AND id != NEW.id
      AND (team1_id = NEW.team1_id OR team2_id = NEW.team1_id)
    LIMIT 1;

    IF duplicate_match_id IS NOT NULL THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team1_id;
      RAISE EXCEPTION '[GUARD] Time "%" (%) já está em outra partida (%) do round %. Duplicidade bloqueada.',
        team_name, NEW.team1_id, duplicate_match_id, NEW.round;
    END IF;
  END IF;

  -- ═══ VALIDAÇÃO 3: Team2 pertence à modalidade ═══
  IF NEW.team2_id IS NOT NULL THEN
    SELECT modality_id INTO team_modality_id FROM public.teams WHERE id = NEW.team2_id;
    IF team_modality_id IS NOT NULL AND team_modality_id != match_modality_id THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team2_id;
      RAISE EXCEPTION '[GUARD] Time "%" (%) pertence à modalidade % mas a partida é da modalidade %. Atribuição bloqueada.',
        team_name, NEW.team2_id, team_modality_id, match_modality_id;
    END IF;

    -- ═══ VALIDAÇÃO 4: Team2 não está duplicado no mesmo round ═══
    SELECT id INTO duplicate_match_id
    FROM public.matches
    WHERE modality_id = match_modality_id
      AND round = NEW.round
      AND id != NEW.id
      AND (team1_id = NEW.team2_id OR team2_id = NEW.team2_id)
    LIMIT 1;

    IF duplicate_match_id IS NOT NULL THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team2_id;
      RAISE EXCEPTION '[GUARD] Time "%" (%) já está em outra partida (%) do round %. Duplicidade bloqueada.',
        team_name, NEW.team2_id, duplicate_match_id, NEW.round;
    END IF;
  END IF;

  -- ═══ VALIDAÇÃO 5: Team1 != Team2 (auto-confronto) ═══
  IF NEW.team1_id IS NOT NULL AND NEW.team2_id IS NOT NULL AND NEW.team1_id = NEW.team2_id THEN
    SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team1_id;
    RAISE EXCEPTION '[GUARD] Auto-confronto detectado: time "%" (%) atribuído a ambos os slots. Bloqueado.',
      team_name, NEW.team1_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger na tabela matches
CREATE TRIGGER trg_validate_match_teams
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_match_team_assignment();
