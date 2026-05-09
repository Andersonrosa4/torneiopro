-- 1) Reforça o guard existente: bloqueia winner_team_id sem ambos os times
CREATE OR REPLACE FUNCTION public.guard_match_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
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

  -- BLOQUEIO NOVO: vencedor fantasma (vencedor sem ambos os times)
  IF NEW.winner_team_id IS NOT NULL
     AND (NEW.team1_id IS NULL OR NEW.team2_id IS NULL) THEN
    RAISE EXCEPTION '[GUARD] vencedor (%) atribuído sem ambos os times definidos (team1=%, team2=%)',
      NEW.winner_team_id, NEW.team1_id, NEW.team2_id;
  END IF;

  -- BLOQUEIO NOVO: status 'completed' exige ambos os times
  IF NEW.status = 'completed'
     AND (NEW.team1_id IS NULL OR NEW.team2_id IS NULL) THEN
    RAISE EXCEPTION '[GUARD] partida não pode ser concluída sem ambos os times (team1=%, team2=%)',
      NEW.team1_id, NEW.team2_id;
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
$function$;

-- 2) Garante que o trigger esteja attachado (idempotente)
DROP TRIGGER IF EXISTS trg_guard_match_integrity ON public.matches;
CREATE TRIGGER trg_guard_match_integrity
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_match_integrity();

-- 3) Limpa partidas já contaminadas (vencedor fantasma)
UPDATE public.matches
   SET winner_team_id = NULL,
       status = 'pending',
       score1 = 0,
       score2 = 0
 WHERE winner_team_id IS NOT NULL
   AND (team1_id IS NULL OR team2_id IS NULL);

-- 4) Limpa partidas marcadas como concluídas sem times
UPDATE public.matches
   SET status = 'pending',
       winner_team_id = NULL
 WHERE status = 'completed'
   AND (team1_id IS NULL OR team2_id IS NULL);