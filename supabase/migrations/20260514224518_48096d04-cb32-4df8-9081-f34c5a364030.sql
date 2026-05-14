CREATE OR REPLACE FUNCTION public.prevent_duplicate_team_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_p1 text;
  new_p2 text;
  new_a text;
  new_b text;
  existing_team_id uuid;
BEGIN
  new_p1 := lower(regexp_replace(trim(COALESCE(NEW.player1_name, '')), '\s+', ' ', 'g'));
  new_p2 := lower(regexp_replace(trim(COALESCE(NEW.player2_name, '')), '\s+', ' ', 'g'));

  IF new_p1 = '' OR new_p2 = '' THEN
    RAISE EXCEPTION '[GUARD] Nome dos dois atletas é obrigatório para cadastrar a dupla.';
  END IF;

  new_a := LEAST(new_p1, new_p2);
  new_b := GREATEST(new_p1, new_p2);

  SELECT t.id INTO existing_team_id
  FROM public.teams t
  WHERE t.tournament_id = NEW.tournament_id
    AND t.id IS DISTINCT FROM NEW.id
    AND t.modality_id IS NOT DISTINCT FROM NEW.modality_id
    AND t.stage_id IS NOT DISTINCT FROM NEW.stage_id
    AND LEAST(
      lower(regexp_replace(trim(COALESCE(t.player1_name, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(trim(COALESCE(t.player2_name, '')), '\s+', ' ', 'g'))
    ) = new_a
    AND GREATEST(
      lower(regexp_replace(trim(COALESCE(t.player1_name, '')), '\s+', ' ', 'g')),
      lower(regexp_replace(trim(COALESCE(t.player2_name, '')), '\s+', ' ', 'g'))
    ) = new_b
  LIMIT 1;

  IF existing_team_id IS NOT NULL THEN
    RAISE EXCEPTION '[GUARD] Dupla duplicada bloqueada: "% / %" já existe neste torneio/modalidade/etapa.', NEW.player1_name, NEW.player2_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_team_pair ON public.teams;
CREATE TRIGGER trg_prevent_duplicate_team_pair
BEFORE INSERT OR UPDATE OF player1_name, player2_name, tournament_id, modality_id, stage_id
ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_team_pair();