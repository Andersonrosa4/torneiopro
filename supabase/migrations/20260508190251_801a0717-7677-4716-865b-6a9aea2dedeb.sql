UPDATE public.matches m
SET stage_id = COALESCE(t1.stage_id, t2.stage_id)
FROM public.teams t1, public.teams t2
WHERE m.stage_id IS NULL
  AND t1.id = m.team1_id
  AND t2.id = m.team2_id
  AND COALESCE(t1.stage_id, t2.stage_id) IS NOT NULL;

UPDATE public.matches m
SET stage_id = t1.stage_id
FROM public.teams t1
WHERE m.stage_id IS NULL
  AND t1.id = m.team1_id
  AND m.team2_id IS NULL
  AND t1.stage_id IS NOT NULL;

UPDATE public.matches m
SET stage_id = t2.stage_id
FROM public.teams t2
WHERE m.stage_id IS NULL
  AND t2.id = m.team2_id
  AND m.team1_id IS NULL
  AND t2.stage_id IS NOT NULL;