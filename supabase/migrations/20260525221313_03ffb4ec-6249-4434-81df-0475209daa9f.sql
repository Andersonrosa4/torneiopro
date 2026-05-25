UPDATE public.rankings
SET badge = 'doacao'
WHERE tournament_id = '7478c4d5-f58e-4d85-b39f-0f8cd0d5c657'
  AND stage_id = 'e56819a8-089b-4a05-ab41-637cfcfc8027'
  AND lower(translate(athlete_name,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )) = ANY (ARRAY[
    'andressa vidal','julia veronese','juliana maria','tauane bergamin',
    'veronica wassen','francieli santos','gabrielly oliveira','luiza machado',
    'maria paula','mariana didone','olga endres','scheila arena',
    'daniel zuselski','joao paulo santos'
  ]);