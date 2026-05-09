-- Preenche team2_id faltante nas 3 partidas L R2 do torneio CONVIDADOS
-- baseado no vencedor da partida feeder (next_win_match_id da R1 → L R2)

-- 87f6986d (L R2 lower 1): team2 = vencedor de 380530d2 (Neguebinha/Gustavo)
UPDATE public.matches 
SET team2_id = (SELECT winner_team_id FROM public.matches WHERE id = '380530d2-c9af-4688-8930-f1f18f6dac5c')
WHERE id = '87f6986d-30ef-4596-acf2-7a49ff8f60c2' AND team2_id IS NULL;

-- 03dc8a51 (L R2 upper 2): team2 = vencedor de 93ca83fe (Daniel/Franklin)
UPDATE public.matches 
SET team2_id = (SELECT winner_team_id FROM public.matches WHERE id = '93ca83fe-ddd7-4571-a075-0fb3ca11108b')
WHERE id = '03dc8a51-9885-4a5f-aaea-423c6804a7e8' AND team2_id IS NULL;

-- 8d008d3d (L R2 lower 2): team2 = vencedor de 2f6e44be (Gustavo/Bragança)
UPDATE public.matches 
SET team2_id = (SELECT winner_team_id FROM public.matches WHERE id = '2f6e44be-1d5a-4b66-a8cf-a99646442dfd')
WHERE id = '8d008d3d-4e46-4dc6-adc3-0337e6f20566' AND team2_id IS NULL;