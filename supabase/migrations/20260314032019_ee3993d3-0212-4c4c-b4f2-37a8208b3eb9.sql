
-- Fix Jogo 10: replace wrong-modality team (pablo/Guga from A+B) with Venâncio/Enzo (CONVIDADOS)
UPDATE public.matches
SET team1_id = 'd07913c3-76a6-4867-81e9-1dc4b15e8685'
WHERE id = 'e82ee04f-864c-4104-b74d-5b0d5c6007f6'
  AND team1_id = '57b51dff-b1a7-4683-a518-2700d00c9cb5';

-- Also remove Venâncio/Enzo from losers R2 P3 where it was incorrectly placed as dropper
UPDATE public.matches
SET team2_id = NULL
WHERE id = '5efb2bf6-77f3-4873-b14e-3ca7094ddb61'
  AND team2_id = 'd07913c3-76a6-4867-81e9-1dc4b15e8685';
