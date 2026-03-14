
-- Jogo 11 (R2P2 Winners): add loser from feeder match (Adnaldo/Babão) as team2, reset status
UPDATE public.matches
SET team2_id = '84089dee-5f46-4295-afff-039a2358c609',
    winner_team_id = NULL,
    status = 'pending'
WHERE id = '03cbdd96-1ca8-4559-98a5-ea5e09ac53b6'
  AND team2_id IS NULL;
