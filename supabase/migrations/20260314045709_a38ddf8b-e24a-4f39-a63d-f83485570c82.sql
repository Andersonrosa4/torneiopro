
-- Fix APRENDIZ bracket: remove wrong-modality teams and place correct ones

-- R2 lower P1 (chapéu): replace wrong teams with caça rato/calopsita and Emanuel/Beto
UPDATE public.matches 
SET team1_id = 'fcddbab7-ed6e-4fa1-92e6-60baaa545304', 
    team2_id = 'c3052ed6-3f4a-4e08-921c-c5bbca6019f9'
WHERE id = 'd7b9f956-75b3-4af9-af3d-4935bd27d769';

-- R2 lower P2: clear wrong-modality teams (wait for R1 P2/P3 winners)
UPDATE public.matches 
SET team1_id = NULL, team2_id = NULL
WHERE id = '00ea590a-4eda-420c-bb8e-251938c2dcf7';

-- R4 upper P1: clear wrong-modality teams (wait for R3 winners)
UPDATE public.matches 
SET team1_id = NULL, team2_id = NULL
WHERE id = '80999ee6-22b3-4b7c-9b62-61c65436443d';
