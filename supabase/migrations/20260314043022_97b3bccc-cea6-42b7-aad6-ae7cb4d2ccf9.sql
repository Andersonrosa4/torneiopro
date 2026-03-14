
CREATE OR REPLACE FUNCTION validate_match_team_assignment()
RETURNS trigger
LANGUAGE plpgsql
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

    -- ═══ VALIDAÇÃO 2: Team1 não está duplicado no mesmo round + bracket_type ═══
    -- Em dupla eliminação, uma equipe pode estar no mesmo round em bracket_types diferentes
    -- (ex: perdeu na Winners R2, vai para Losers R2)
    SELECT id INTO duplicate_match_id
    FROM public.matches
    WHERE modality_id = match_modality_id
      AND round = NEW.round
      AND id != NEW.id
      AND COALESCE(bracket_type, '') = COALESCE(NEW.bracket_type, '')
      AND (team1_id = NEW.team1_id OR team2_id = NEW.team1_id)
    LIMIT 1;

    IF duplicate_match_id IS NOT NULL THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team1_id;
      RAISE EXCEPTION '[GUARD] Time "%" (%) já está em outra partida (%) do round % (%). Duplicidade bloqueada.',
        team_name, NEW.team1_id, duplicate_match_id, NEW.round, COALESCE(NEW.bracket_type, 'winners');
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

    -- ═══ VALIDAÇÃO 4: Team2 não está duplicado no mesmo round + bracket_type ═══
    SELECT id INTO duplicate_match_id
    FROM public.matches
    WHERE modality_id = match_modality_id
      AND round = NEW.round
      AND id != NEW.id
      AND COALESCE(bracket_type, '') = COALESCE(NEW.bracket_type, '')
      AND (team1_id = NEW.team2_id OR team2_id = NEW.team2_id)
    LIMIT 1;

    IF duplicate_match_id IS NOT NULL THEN
      SELECT (player1_name || '/' || player2_name) INTO team_name FROM public.teams WHERE id = NEW.team2_id;
      RAISE EXCEPTION '[GUARD] Time "%" (%) já está em outra partida (%) do round % (%). Duplicidade bloqueada.',
        team_name, NEW.team2_id, duplicate_match_id, NEW.round, COALESCE(NEW.bracket_type, 'winners');
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
