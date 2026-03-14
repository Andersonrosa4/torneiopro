
-- Fix JOGO 29: Ortega/Luis (loser of WA R2P3) into team1
UPDATE public.matches 
SET team1_id = '4e9221f2-52a2-4261-88bd-6f71b8474e1d'
WHERE id = '5efb2bf6-77f3-4873-b14e-3ca7094ddb61' 
  AND team1_id IS NULL;
