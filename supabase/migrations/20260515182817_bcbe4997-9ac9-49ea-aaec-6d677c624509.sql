-- Atualiza pareamento Veranico (Quartas) do torneio 7478c4d5-f58e-4d85-b39f-0f8cd0d5c657
-- Novo mapeamento: R1P1→Q3, R1P2→Q1, R1P3→Q2 (já), R1P4→Q4
WITH q AS (
  SELECT id, position FROM matches
  WHERE tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
    AND round = 2 AND bracket_type = 'winners'
)
UPDATE matches m
SET next_win_match_id = (SELECT id FROM q WHERE position = CASE m.position
    WHEN 1 THEN 3
    WHEN 2 THEN 1
    WHEN 3 THEN 2
    WHEN 4 THEN 4
  END)
WHERE m.tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
  AND m.round = 1
  AND m.bracket_type = 'repechage';