-- Add email column to organizers for admin login
ALTER TABLE public.organizers ADD COLUMN email text UNIQUE;

-- Add role column to organizers to track admin vs organizer
ALTER TABLE public.organizers ADD COLUMN role text NOT NULL DEFAULT 'organizer';

-- Update existing admin users
UPDATE public.organizers SET role = 'admin', email = 'joao2892002@gmail.com' WHERE id = '777160cf-42fa-4b14-ad3f-3b1daacb20eb';
UPDATE public.organizers SET role = 'admin' WHERE id = 'ed04eeb8-5b33-4956-8629-b4237648dec5';