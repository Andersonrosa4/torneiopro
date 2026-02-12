-- Remove foreign key constraint on user_roles so it can reference organizer IDs too
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_fkey;