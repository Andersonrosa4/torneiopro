
-- Add missing columns to courts table
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS open_time time without time zone DEFAULT '08:00';
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS close_time time without time zone DEFAULT '22:00';
