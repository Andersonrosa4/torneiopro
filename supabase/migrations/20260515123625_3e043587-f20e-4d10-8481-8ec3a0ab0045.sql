
DO $mig$
DECLARE
  v_org uuid := '7ebde37a-697e-4804-8445-6610fa03ce34';
  v_test_ids uuid[];
  v_tid uuid;
  v_mid uuid;
  v_team_ids uuid[] := ARRAY[]::uuid[];
  v_new_team uuid;
  v_g int;
  v_i int;
  v_j int;
  v_groups uuid[] := ARRAY[]::uuid[];
  v_group uuid;
  v_t1 uuid; v_t2 uuid;
  v_winner uuid;
  v_pos int;
  -- knockout
  v_eighth_ids uuid[] := ARRAY[]::uuid[];
  v_quarter_ids uuid[] := ARRAY[]::uuid[];
  v_semi_ids uuid[] := ARRAY[]::uuid[];
  v_final_id uuid;
  v_third_id uuid;
  v_id uuid;
  v_s1 int; v_s2 int;
  v_classif RECORD;
  -- group standings: team_id => points
  v_standings jsonb;
  v_rankings jsonb;
  -- top4 per group [4][4]
  v_top jsonb := '{}'::jsonb;
BEGIN
  -- ════════════════ 1) LIMPEZA ════════════════
  SELECT array_agg(id) INTO v_test_ids
    FROM tournaments
   WHERE name LIKE 'TESTE DE FUTEVÔLEI%'
      OR name LIKE 'TESTE MODO VERANICO%';

  IF v_test_ids IS NOT NULL THEN
    UPDATE matches SET winner_team_id=NULL, winner_id=NULL, status='pending',
                       team1_id=NULL, team2_id=NULL,
                       next_win_match_id=NULL, next_lose_match_id=NULL
     WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM ranking_points_history WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM rankings              WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM classificacao_grupos  WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM bracket_audit_log     WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM bracket_backups       WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM bug_combatant_log     WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM matches               WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM teams                 WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM groups                WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM modalities            WHERE tournament_id = ANY(v_test_ids);
    DELETE FROM tournaments           WHERE id = ANY(v_test_ids);
  END IF;

  -- ════════════════ 2) CRIAR TORNEIO VERANICO ════════════════
  INSERT INTO tournaments (name, sport, format, max_participants, created_by,
                           tournament_code, status, visibility)
  VALUES ('TESTE MODO VERANICO 16 DUPLAS', 'beach_volleyball', 'single_elimination',
          32, v_org, 'VRN' || substr(md5(random()::text), 1, 6), 'in_progress', 'public')
  RETURNING id INTO v_tid;

  -- Trigger create_default_modalities cria 3 modalidades. Pegar a primeira.
  SELECT id INTO v_mid FROM modalities WHERE tournament_id = v_tid ORDER BY created_at LIMIT 1;
  UPDATE modalities SET game_system='group_cross_repechage' WHERE id = v_mid;

  -- 16 duplas
  FOR v_i IN 1..16 LOOP
    INSERT INTO teams (tournament_id, modality_id, player1_name, player2_name)
    VALUES (v_tid, v_mid, 'Atleta ' || v_i || 'A', 'Atleta ' || v_i || 'B')
    RETURNING id INTO v_new_team;
    v_team_ids := array_append(v_team_ids, v_new_team);
  END LOOP;

  -- Criar 4 grupos (A, B, C, D)
  FOR v_g IN 1..4 LOOP
    INSERT INTO groups (tournament_id, name)
    VALUES (v_tid, 'Grupo ' || chr(64 + v_g))
    RETURNING id INTO v_group;
    v_groups := array_append(v_groups, v_group);
  END LOOP;

  -- ════════════════ 3) FASE DE GRUPOS (round-robin 4 duplas) ════════════════
  -- Distribuir teams: time (i) → grupo ((i-1) % 4)
  -- Para cada grupo, criar 6 partidas (round=0)
  FOR v_g IN 1..4 LOOP
    -- times do grupo g (índices 1..16, com (i-1)%4 == g-1)
    DECLARE
      g_teams uuid[] := ARRAY[]::uuid[];
      a int; b int;
    BEGIN
      FOR v_i IN 1..16 LOOP
        IF ((v_i - 1) % 4) = (v_g - 1) THEN
          g_teams := array_append(g_teams, v_team_ids[v_i]);
        END IF;
      END LOOP;

      -- inicializar standings deste grupo
      INSERT INTO classificacao_grupos (tournament_id, group_id, team_id, pontos, vitorias, derrotas, jogos, sets_pro, sets_contra, saldo_sets)
      SELECT v_tid, v_groups[v_g], unnest(g_teams), 0, 0, 0, 0, 0, 0, 0;

      v_pos := 0;
      FOR a IN 1..3 LOOP
        FOR b IN (a+1)..4 LOOP
          v_pos := v_pos + 1;
          v_t1 := g_teams[a]; v_t2 := g_teams[b];
          -- placar 2x0 ou 2x1 aleatório
          IF random() < 0.5 THEN
            v_winner := v_t1; v_s1 := 2; v_s2 := CASE WHEN random()<0.5 THEN 0 ELSE 1 END;
          ELSE
            v_winner := v_t2; v_s2 := 2; v_s1 := CASE WHEN random()<0.5 THEN 0 ELSE 1 END;
          END IF;

          INSERT INTO matches (tournament_id, modality_id, round, position,
                               team1_id, team2_id, status, bracket_type,
                               bracket_number, winner_team_id, score1, score2)
          VALUES (v_tid, v_mid, 0, v_pos, v_t1, v_t2, 'completed', 'groups',
                  v_g, v_winner, v_s1, v_s2);

          -- atualizar standings
          UPDATE classificacao_grupos
             SET jogos = jogos + 1,
                 vitorias = vitorias + CASE WHEN team_id = v_winner THEN 1 ELSE 0 END,
                 derrotas = derrotas + CASE WHEN team_id <> v_winner THEN 1 ELSE 0 END,
                 pontos = pontos + CASE WHEN team_id = v_winner THEN 2 ELSE 1 END,
                 sets_pro = sets_pro + CASE WHEN team_id = v_t1 THEN v_s1 ELSE v_s2 END,
                 sets_contra = sets_contra + CASE WHEN team_id = v_t1 THEN v_s2 ELSE v_s1 END,
                 saldo_sets = saldo_sets + CASE WHEN team_id = v_t1 THEN (v_s1 - v_s2) ELSE (v_s2 - v_s1) END
           WHERE group_id = v_groups[v_g] AND team_id IN (v_t1, v_t2);
        END LOOP;
      END LOOP;

      -- ranking 1º..4º deste grupo (ordem: pontos, vitorias, saldo_sets)
      DECLARE
        rk uuid[] := ARRAY[]::uuid[];
        rec RECORD;
      BEGIN
        FOR rec IN
          SELECT team_id FROM classificacao_grupos
           WHERE group_id = v_groups[v_g]
           ORDER BY pontos DESC, vitorias DESC, saldo_sets DESC, random()
        LOOP
          rk := array_append(rk, rec.team_id);
        END LOOP;
        v_top := jsonb_set(v_top, ARRAY[(v_g-1)::text], to_jsonb(rk));
      END;
    END;
  END LOOP;

  -- ════════════════ 4) OITAVAS (Mirrored Extremes) ════════════════
  -- VERANICO_EIGHTHS_MAP: pos=1 1A×4D ; 2 1B×4C ; 3 1C×4B ; 4 1D×4A ;
  --                      5 2A×3D ; 6 2B×3C ; 7 2C×3B ; 8 2D×3A
  DECLARE
    pairs int[][] := ARRAY[
      ARRAY[1,1, 4,4],  -- pos 1: g=1 rank=1, g=4 rank=4
      ARRAY[2,1, 3,4],
      ARRAY[3,1, 2,4],
      ARRAY[4,1, 1,4],
      ARRAY[1,2, 4,3],
      ARRAY[2,2, 3,3],
      ARRAY[3,2, 2,3],
      ARRAY[4,2, 1,3]
    ];
    p int;
  BEGIN
    FOR p IN 1..8 LOOP
      v_t1 := (v_top -> (pairs[p][1]-1) ->> (pairs[p][2]-1))::uuid;
      v_t2 := (v_top -> (pairs[p][3]-1) ->> (pairs[p][4]-1))::uuid;
      INSERT INTO matches (tournament_id, modality_id, round, position,
                           team1_id, team2_id, status, bracket_type, bracket_number)
      VALUES (v_tid, v_mid, 1, p, v_t1, v_t2, 'pending', 'winners', 1)
      RETURNING id INTO v_id;
      v_eighth_ids := array_append(v_eighth_ids, v_id);
    END LOOP;
  END;

  -- ════════════════ 5) QUARTAS ════════════════
  -- Map: Q1: O1×O6 ; Q2: O3×O8 ; Q3: O2×O5 ; Q4: O4×O7
  FOR v_i IN 1..4 LOOP
    INSERT INTO matches (tournament_id, modality_id, round, position,
                         team1_id, team2_id, status, bracket_type, bracket_number)
    VALUES (v_tid, v_mid, 2, v_i, NULL, NULL, 'pending', 'winners', 1)
    RETURNING id INTO v_id;
    v_quarter_ids := array_append(v_quarter_ids, v_id);
  END LOOP;

  -- linkar oitavas → quartas (next_win_match_id)
  UPDATE matches SET next_win_match_id = v_quarter_ids[1] WHERE id IN (v_eighth_ids[1], v_eighth_ids[6]);
  UPDATE matches SET next_win_match_id = v_quarter_ids[2] WHERE id IN (v_eighth_ids[3], v_eighth_ids[8]);
  UPDATE matches SET next_win_match_id = v_quarter_ids[3] WHERE id IN (v_eighth_ids[2], v_eighth_ids[5]);
  UPDATE matches SET next_win_match_id = v_quarter_ids[4] WHERE id IN (v_eighth_ids[4], v_eighth_ids[7]);

  -- ════════════════ 6) SEMIS ════════════════
  -- S1: Q1×Q4 ; S2: Q2×Q3
  FOR v_i IN 1..2 LOOP
    INSERT INTO matches (tournament_id, modality_id, round, position,
                         team1_id, team2_id, status, bracket_type, bracket_number)
    VALUES (v_tid, v_mid, 3, v_i, NULL, NULL, 'pending', 'winners', 1)
    RETURNING id INTO v_id;
    v_semi_ids := array_append(v_semi_ids, v_id);
  END LOOP;

  UPDATE matches SET next_win_match_id = v_semi_ids[1] WHERE id IN (v_quarter_ids[1], v_quarter_ids[4]);
  UPDATE matches SET next_win_match_id = v_semi_ids[2] WHERE id IN (v_quarter_ids[2], v_quarter_ids[3]);

  -- ════════════════ 7) FINAL e 3º LUGAR ════════════════
  INSERT INTO matches (tournament_id, modality_id, round, position,
                       team1_id, team2_id, status, bracket_type, bracket_number)
  VALUES (v_tid, v_mid, 4, 1, NULL, NULL, 'pending', 'winners', 1)
  RETURNING id INTO v_final_id;

  INSERT INTO matches (tournament_id, modality_id, round, position,
                       team1_id, team2_id, status, bracket_type, bracket_number)
  VALUES (v_tid, v_mid, 4, 2, NULL, NULL, 'pending', 'third_place', 1)
  RETURNING id INTO v_third_id;

  UPDATE matches SET next_win_match_id = v_final_id, next_lose_match_id = v_third_id
   WHERE id = ANY(v_semi_ids);

  -- ════════════════ 8) SIMULAR PROPAGAÇÃO (oitavas → quartas → semis → final + 3º) ════════════════
  -- Helper: para cada partida com ambos os times, sortear vencedor, atualizar e propagar
  DECLARE
    rec RECORD;
    parent RECORD;
    slot text;
    rounds_to_process int[] := ARRAY[1, 2, 3, 4];
    rd int;
  BEGIN
    FOREACH rd IN ARRAY rounds_to_process LOOP
      FOR rec IN
        SELECT id, team1_id, team2_id, next_win_match_id, next_lose_match_id, position, bracket_type
          FROM matches
         WHERE tournament_id = v_tid AND round = rd
         ORDER BY position
      LOOP
        IF rec.team1_id IS NULL OR rec.team2_id IS NULL THEN
          CONTINUE;
        END IF;
        IF random() < 0.5 THEN
          v_winner := rec.team1_id; v_s1 := 2; v_s2 := (random()*1)::int;
        ELSE
          v_winner := rec.team2_id; v_s2 := 2; v_s1 := (random()*1)::int;
        END IF;
        UPDATE matches SET winner_team_id = v_winner, status='completed', score1=v_s1, score2=v_s2
         WHERE id = rec.id;

        -- Propagar vencedor
        IF rec.next_win_match_id IS NOT NULL THEN
          SELECT team1_id, team2_id INTO parent FROM matches WHERE id = rec.next_win_match_id;
          IF parent.team1_id IS NULL THEN
            UPDATE matches SET team1_id = v_winner WHERE id = rec.next_win_match_id;
          ELSIF parent.team2_id IS NULL THEN
            UPDATE matches SET team2_id = v_winner WHERE id = rec.next_win_match_id;
          END IF;
        END IF;

        -- Propagar perdedor → 3º lugar (apenas semis)
        IF rec.next_lose_match_id IS NOT NULL THEN
          v_winner := CASE WHEN rec.team1_id = v_winner THEN rec.team2_id ELSE rec.team1_id END;
          -- na verdade já reatribuído... pegar o perdedor da partida atualizada:
          SELECT CASE WHEN winner_team_id = team1_id THEN team2_id ELSE team1_id END INTO v_winner
            FROM matches WHERE id = rec.id;
          SELECT team1_id, team2_id INTO parent FROM matches WHERE id = rec.next_lose_match_id;
          IF parent.team1_id IS NULL THEN
            UPDATE matches SET team1_id = v_winner WHERE id = rec.next_lose_match_id;
          ELSIF parent.team2_id IS NULL THEN
            UPDATE matches SET team2_id = v_winner WHERE id = rec.next_lose_match_id;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END;

  -- Marcar torneio como concluído
  UPDATE tournaments SET status='completed' WHERE id = v_tid;

  RAISE NOTICE 'Torneio Veranico criado: %', v_tid;
END $mig$;
