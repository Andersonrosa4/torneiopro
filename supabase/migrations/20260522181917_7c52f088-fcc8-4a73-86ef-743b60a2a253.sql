DO $$
DECLARE
  v_tournament uuid := '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657';
  v_stage1 uuid;
BEGIN
  INSERT INTO public.tournament_stages (tournament_id, name)
  VALUES (v_tournament, '1° etapa')
  RETURNING id INTO v_stage1;

  UPDATE public.rankings SET stage_id = v_stage1
    WHERE tournament_id = v_tournament AND stage_id IS NULL;

  UPDATE public.teams SET stage_id = v_stage1
    WHERE tournament_id = v_tournament AND stage_id IS NULL;

  UPDATE public.ranking_points_history SET stage_id = v_stage1
    WHERE tournament_id = v_tournament AND stage_id IS NULL;
END $$;