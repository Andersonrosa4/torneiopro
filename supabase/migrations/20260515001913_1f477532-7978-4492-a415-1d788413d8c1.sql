
DO $$
DECLARE
  m record;
  s1 int; s2 int;
  win uuid;
BEGIN
  FOR m IN
    SELECT id, team1_id, team2_id
      FROM matches
     WHERE tournament_id='7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
       AND status='pending'
       AND team1_id IS NOT NULL AND team2_id IS NOT NULL
  LOOP
    -- placar aleatório com vencedor em 21
    IF random() < 0.5 THEN
      s1 := 21; s2 := floor(random()*20)::int;
      win := m.team1_id;
    ELSE
      s1 := floor(random()*20)::int; s2 := 21;
      win := m.team2_id;
    END IF;
    UPDATE matches
       SET score1=s1, score2=s2, winner_team_id=win, status='completed'
     WHERE id=m.id;
  END LOOP;
END $$;
