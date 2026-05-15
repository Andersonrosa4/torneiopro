UPDATE teams SET stage_id = NULL WHERE stage_id = 'a61c3379-88d9-4720-a18a-0cdae0b0c443';
UPDATE matches SET stage_id = NULL WHERE stage_id = 'a61c3379-88d9-4720-a18a-0cdae0b0c443';
DELETE FROM tournament_stages WHERE id = 'a61c3379-88d9-4720-a18a-0cdae0b0c443';