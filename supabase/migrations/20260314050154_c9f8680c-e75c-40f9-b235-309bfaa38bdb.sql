
-- 1. Clear R2 P1 (was chapéu, now becomes regular R2 receiving 2 R1 winners)
UPDATE public.matches 
SET team1_id = NULL, team2_id = NULL, is_chapeu = false
WHERE id = 'd7b9f956-75b3-4af9-af3d-4935bd27d769';

-- 2. Create new R1 lower P8: caça rato vs Emanuel/Beto
INSERT INTO public.matches (
  tournament_id, modality_id, round, position, 
  bracket_type, bracket_half, status,
  team1_id, team2_id,
  next_win_match_id, next_lose_match_id,
  score1, score2, is_chapeu
) VALUES (
  '1e58c058-0c89-4ff4-aa34-498c3f62ca97',
  'aa265d48-ee0f-414d-a6a6-952795226fc3',
  1, 8,
  'winners', 'lower', 'pending',
  'fcddbab7-ed6e-4fa1-92e6-60baaa545304',
  'c3052ed6-3f4a-4e08-921c-c5bbca6019f9',
  'd7b9f956-75b3-4af9-af3d-4935bd27d769',
  'f5e1b1cd-18a1-44a7-b6ef-2f53bfba1e86',
  0, 0, false
);
