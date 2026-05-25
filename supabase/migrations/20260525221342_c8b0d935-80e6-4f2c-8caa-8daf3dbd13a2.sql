UPDATE public.rankings
SET badge = 'doacao'
WHERE tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
  AND stage_id = 'e56819a8-089b-4a05-ab41-637cfcfc8027'
  AND entry_type IN ('male','female')
  AND (
    athlete_name ILIKE '%Andressa%Vidal%'
    OR athlete_name ILIKE '%Tauane%Bergamin%'
    OR athlete_name ILIKE '%Gabrielly%Oliveira%'
    OR athlete_name ILIKE '%Maria Paula%Adamy%'
  );