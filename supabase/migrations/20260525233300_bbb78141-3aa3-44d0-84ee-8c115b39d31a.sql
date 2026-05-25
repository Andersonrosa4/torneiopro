-- Limpa destaques e bônus manuais em entradas de DUPLA que não tenham os 2 atletas com o mesmo destaque individual.
-- Regra: dupla só recebe badge/bônus se AMBOS os membros tiverem o mesmo badge individual.

WITH pair_rows AS (
  SELECT r.id, r.tournament_id, r.modality_id, r.stage_id, r.athlete_name,
         split_part(r.athlete_name, ' / ', 1) AS p1,
         split_part(r.athlete_name, ' / ', 2) AS p2
  FROM public.rankings r
  WHERE r.entry_type = 'pair'
),
member_badges AS (
  SELECT pr.id AS pair_id,
         MAX(CASE WHEN ri.athlete_name = pr.p1 THEN ri.badge END) AS b1,
         MAX(CASE WHEN ri.athlete_name = pr.p2 THEN ri.badge END) AS b2,
         MAX(CASE WHEN ri.athlete_name = pr.p1 THEN ri.manual_bonus END) AS mb1,
         MAX(CASE WHEN ri.athlete_name = pr.p2 THEN ri.manual_bonus END) AS mb2
  FROM pair_rows pr
  LEFT JOIN public.rankings ri
    ON ri.tournament_id = pr.tournament_id
   AND COALESCE(ri.modality_id::text,'') = COALESCE(pr.modality_id::text,'')
   AND COALESCE(ri.stage_id::text,'') = COALESCE(pr.stage_id::text,'')
   AND ri.entry_type IN ('male','female','individual')
   AND ri.athlete_name IN (pr.p1, pr.p2)
  GROUP BY pr.id
)
UPDATE public.rankings r
SET badge = CASE WHEN mb.b1 IS NOT NULL AND mb.b1 = mb.b2 THEN mb.b1 ELSE NULL END,
    manual_bonus = CASE WHEN mb.b1 IS NOT NULL AND mb.b1 = mb.b2 THEN LEAST(COALESCE(mb.mb1,0), COALESCE(mb.mb2,0)) ELSE 0 END,
    points = r.points - COALESCE(r.manual_bonus,0)
          + CASE WHEN mb.b1 IS NOT NULL AND mb.b1 = mb.b2 THEN LEAST(COALESCE(mb.mb1,0), COALESCE(mb.mb2,0)) ELSE 0 END
FROM member_badges mb
WHERE r.id = mb.pair_id
  AND (COALESCE(r.badge,'') <> COALESCE(CASE WHEN mb.b1 IS NOT NULL AND mb.b1 = mb.b2 THEN mb.b1 ELSE NULL END,'')
       OR COALESCE(r.manual_bonus,0) <> CASE WHEN mb.b1 IS NOT NULL AND mb.b1 = mb.b2 THEN LEAST(COALESCE(mb.mb1,0), COALESCE(mb.mb2,0)) ELSE 0 END);