
DO $mig$
DECLARE
  v_org uuid := '7ebde37a-697e-4804-8445-6610fa03ce34';
  v_old uuid[];
  v_tid uuid;
  v_mid uuid;
  v_team_ids uuid[] := ARRAY[]::uuid[];
  v_new_team uuid;
  v_g int; v_i int;
  v_groups uuid[] := ARRAY[]::uuid[];
  v_group uuid;
  v_t1 uuid; v_t2 uuid;
  v_winner uuid; v_loser uuid;
  v_pos int;
  v_eighth_ids uuid[] := ARRAY[]::uuid[];
  v_quarter_ids uuid[] := ARRAY[]::uuid[];
  v_semi_ids uuid[] := ARRAY[]::uuid[];
  v_final_id uuid;
  v_third_id uuid;
  v_id uuid;
  v_s1 int; v_s2 int;
  v_top jsonb := '[null,null,null,null]'::jsonb;
BEGIN
  SELECT array_agg(id) INTO v_old FROM tournaments WHERE name='TESTE MODO VERANICO 16 DUPLAS';
  IF v_old IS NOT NULL THEN
    -- limpar self-refs apenas em matches fora da fase de grupos (round > 0)
    UPDATE matches SET next_win_match_id=NULL, next_lose_match_id=NULL
      WHERE tournament_id = ANY(v_old);
    DELETE FROM classificacao_grupos WHERE tournament_id = ANY(v_old);
    DELETE FROM bracket_audit_log    WHERE tournament_id = ANY(v_old);
    DELETE FROM matches              WHERE tournament_id = ANY(v_old);
    DELETE FROM teams                WHERE tournament_id = ANY(v_old);
    DELETE FROM groups               WHERE tournament_id = ANY(v_old);
    DELETE FROM modalities           WHERE tournament_id = ANY(v_old);
    DELETE FROM tournaments          WHERE id = ANY(v_old);
  END IF;

  INSERT INTO tournaments (name, sport, format, max_participants, created_by, tournament_code, status, visibility)
  VALUES ('TESTE MODO VERANICO 16 DUPLAS', 'beach_volleyball', 'single_elimination', 32, v_org,
          'VRN' || substr(md5(random()::text),1,6), 'in_progress', 'public')
  RETURNING id INTO v_tid;

  SELECT id INTO v_mid FROM modalities WHERE tournament_id = v_tid ORDER BY created_at LIMIT 1;
  UPDATE modalities SET game_system='group_cross_repechage' WHERE id = v_mid;

  FOR v_i IN 1..16 LOOP
    INSERT INTO teams (tournament_id, modality_id, player1_name, player2_name)
    VALUES (v_tid, v_mid, 'Atleta '||v_i||'A', 'Atleta '||v_i||'B')
    RETURNING id INTO v_new_team;
    v_team_ids := array_append(v_team_ids, v_new_team);
  END LOOP;

  FOR v_g IN 1..4 LOOP
    INSERT INTO groups (tournament_id, name) VALUES (v_tid, 'Grupo '||chr(64+v_g))
    RETURNING id INTO v_group;
    v_groups := array_append(v_groups, v_group);
  END LOOP;

  FOR v_g IN 1..4 LOOP
    DECLARE
      g_teams uuid[] := ARRAY[]::uuid[];
      a int; b int; rk uuid[] := ARRAY[]::uuid[]; rec RECORD;
    BEGIN
      FOR v_i IN 1..16 LOOP
        IF ((v_i-1) % 4) = (v_g-1) THEN g_teams := array_append(g_teams, v_team_ids[v_i]); END IF;
      END LOOP;
      INSERT INTO classificacao_grupos (tournament_id, group_id, team_id)
      SELECT v_tid, v_groups[v_g], unnest(g_teams);

      v_pos := 0;
      FOR a IN 1..3 LOOP
        FOR b IN (a+1)..4 LOOP
          v_pos := v_pos + 1;
          v_t1 := g_teams[a]; v_t2 := g_teams[b];
          IF random()<0.5 THEN v_winner:=v_t1; v_s1:=2; v_s2:=(random())::int;
          ELSE v_winner:=v_t2; v_s2:=2; v_s1:=(random())::int; END IF;
          INSERT INTO matches (tournament_id, modality_id, round, position, team1_id, team2_id,
                               status, bracket_type, bracket_number, winner_team_id, score1, score2)
          VALUES (v_tid, v_mid, 0, v_pos, v_t1, v_t2, 'completed', 'groups', v_g, v_winner, v_s1, v_s2);
          UPDATE classificacao_grupos
             SET jogos=jogos+1,
                 vitorias=vitorias+CASE WHEN team_id=v_winner THEN 1 ELSE 0 END,
                 derrotas=derrotas+CASE WHEN team_id<>v_winner THEN 1 ELSE 0 END,
                 pontos=pontos+CASE WHEN team_id=v_winner THEN 2 ELSE 1 END,
                 sets_pro=sets_pro+CASE WHEN team_id=v_t1 THEN v_s1 ELSE v_s2 END,
                 sets_contra=sets_contra+CASE WHEN team_id=v_t1 THEN v_s2 ELSE v_s1 END,
                 saldo_sets=saldo_sets+CASE WHEN team_id=v_t1 THEN v_s1-v_s2 ELSE v_s2-v_s1 END
           WHERE group_id=v_groups[v_g] AND team_id IN (v_t1,v_t2);
        END LOOP;
      END LOOP;

      FOR rec IN
        SELECT team_id FROM classificacao_grupos
         WHERE group_id=v_groups[v_g]
         ORDER BY pontos DESC, vitorias DESC, saldo_sets DESC, random()
      LOOP rk := array_append(rk, rec.team_id); END LOOP;
      v_top := jsonb_set(v_top, ARRAY[(v_g-1)::text], to_jsonb(rk));
    END;
  END LOOP;

  -- Oitavas
  DECLARE pairs int[][] := ARRAY[
      ARRAY[1,1,4,4], ARRAY[2,1,3,4], ARRAY[3,1,2,4], ARRAY[4,1,1,4],
      ARRAY[1,2,4,3], ARRAY[2,2,3,3], ARRAY[3,2,2,3], ARRAY[4,2,1,3]
    ]; p int;
  BEGIN
    FOR p IN 1..8 LOOP
      v_t1 := ((v_top->(pairs[p][1]-1))->>(pairs[p][2]-1))::uuid;
      v_t2 := ((v_top->(pairs[p][3]-1))->>(pairs[p][4]-1))::uuid;
      INSERT INTO matches (tournament_id, modality_id, round, position, team1_id, team2_id,
                           status, bracket_type, bracket_number)
      VALUES (v_tid, v_mid, 1, p, v_t1, v_t2, 'pending', 'winners', 1)
      RETURNING id INTO v_id;
      v_eighth_ids := array_append(v_eighth_ids, v_id);
    END LOOP;
  END;

  FOR v_i IN 1..4 LOOP
    INSERT INTO matches (tournament_id, modality_id, round, position, status, bracket_type, bracket_number)
    VALUES (v_tid, v_mid, 2, v_i, 'pending', 'winners', 1) RETURNING id INTO v_id;
    v_quarter_ids := array_append(v_quarter_ids, v_id);
  END LOOP;
  UPDATE matches SET next_win_match_id=v_quarter_ids[1] WHERE id IN (v_eighth_ids[1], v_eighth_ids[6]);
  UPDATE matches SET next_win_match_id=v_quarter_ids[2] WHERE id IN (v_eighth_ids[3], v_eighth_ids[8]);
  UPDATE matches SET next_win_match_id=v_quarter_ids[3] WHERE id IN (v_eighth_ids[2], v_eighth_ids[5]);
  UPDATE matches SET next_win_match_id=v_quarter_ids[4] WHERE id IN (v_eighth_ids[4], v_eighth_ids[7]);

  FOR v_i IN 1..2 LOOP
    INSERT INTO matches (tournament_id, modality_id, round, position, status, bracket_type, bracket_number)
    VALUES (v_tid, v_mid, 3, v_i, 'pending', 'winners', 1) RETURNING id INTO v_id;
    v_semi_ids := array_append(v_semi_ids, v_id);
  END LOOP;
  UPDATE matches SET next_win_match_id=v_semi_ids[1] WHERE id IN (v_quarter_ids[1], v_quarter_ids[4]);
  UPDATE matches SET next_win_match_id=v_semi_ids[2] WHERE id IN (v_quarter_ids[2], v_quarter_ids[3]);

  INSERT INTO matches (tournament_id, modality_id, round, position, status, bracket_type, bracket_number)
  VALUES (v_tid, v_mid, 4, 1, 'pending', 'winners', 1) RETURNING id INTO v_final_id;
  INSERT INTO matches (tournament_id, modality_id, round, position, status, bracket_type, bracket_number)
  VALUES (v_tid, v_mid, 4, 2, 'pending', 'third_place', 1) RETURNING id INTO v_third_id;
  UPDATE matches SET next_win_match_id=v_final_id, next_lose_match_id=v_third_id WHERE id=ANY(v_semi_ids);

  DECLARE rec RECORD; rd int; parent RECORD;
  BEGIN
    FOREACH rd IN ARRAY ARRAY[1,2,3,4] LOOP
      FOR rec IN
        SELECT id, team1_id, team2_id, next_win_match_id, next_lose_match_id
          FROM matches WHERE tournament_id=v_tid AND round=rd ORDER BY position
      LOOP
        IF rec.team1_id IS NULL OR rec.team2_id IS NULL THEN CONTINUE; END IF;
        IF random()<0.5 THEN v_winner:=rec.team1_id; v_loser:=rec.team2_id; v_s1:=2; v_s2:=(random())::int;
        ELSE v_winner:=rec.team2_id; v_loser:=rec.team1_id; v_s2:=2; v_s1:=(random())::int; END IF;
        UPDATE matches SET winner_team_id=v_winner, status='completed', score1=v_s1, score2=v_s2 WHERE id=rec.id;
        IF rec.next_win_match_id IS NOT NULL THEN
          SELECT team1_id, team2_id INTO parent FROM matches WHERE id=rec.next_win_match_id;
          IF parent.team1_id IS NULL THEN UPDATE matches SET team1_id=v_winner WHERE id=rec.next_win_match_id;
          ELSIF parent.team2_id IS NULL THEN UPDATE matches SET team2_id=v_winner WHERE id=rec.next_win_match_id; END IF;
        END IF;
        IF rec.next_lose_match_id IS NOT NULL THEN
          SELECT team1_id, team2_id INTO parent FROM matches WHERE id=rec.next_lose_match_id;
          IF parent.team1_id IS NULL THEN UPDATE matches SET team1_id=v_loser WHERE id=rec.next_lose_match_id;
          ELSIF parent.team2_id IS NULL THEN UPDATE matches SET team2_id=v_loser WHERE id=rec.next_lose_match_id; END IF;
        END IF;
      END LOOP;
    END LOOP;
  END;

  UPDATE tournaments SET status='completed' WHERE id=v_tid;
END $mig$;
