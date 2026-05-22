
-- Reverter +10 da Helena Trindade na 1ª etapa (stage_id NULL)
UPDATE public.rankings
SET points = points - 10, manual_bonus = manual_bonus - 10
WHERE id IN ('ed22af91-2a30-4f51-b8d1-ca44f315d2e8','c8a0b392-b5ce-4fbb-8d86-0d9038cd53ee');

-- Inserir destaque +10 na 2ª etapa (Helena Trindade / Junior Scapini, misto)
INSERT INTO public.rankings (tournament_id, modality_id, stage_id, athlete_name, sport, entry_type, points, manual_bonus, created_by)
VALUES
  ('7478c4d5-f58e-4d85-b39f-0f8cd0d5c657','f62cda02-ad93-4dfa-a3be-ef65f387d9ca','ed9db2ad-19fc-48d2-badc-48594f8b115e','Helena Trindade / Junior Scapini','beach_volleyball','pair',10,10,'777160cf-42fa-4b14-ad3f-3b1daacb20eb'),
  ('7478c4d5-f58e-4d85-b39f-0f8cd0d5c657','f62cda02-ad93-4dfa-a3be-ef65f387d9ca','ed9db2ad-19fc-48d2-badc-48594f8b115e','Helena Trindade','beach_volleyball','female',10,10,'777160cf-42fa-4b14-ad3f-3b1daacb20eb');
