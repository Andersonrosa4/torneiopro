UPDATE public.rankings SET badge = NULL
WHERE tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
  AND entry_type = 'pair'
  AND badge IS NOT NULL;

UPDATE public.ranking_points_history SET badge = NULL
WHERE tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
  AND ranking_id IN (
    SELECT id FROM public.rankings
    WHERE tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
      AND entry_type = 'pair'
  );