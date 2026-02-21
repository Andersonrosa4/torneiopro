
-- Add nickname column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS nickname text;

-- Create system_ads table for admin-controlled banners in athlete panel
CREATE TABLE IF NOT EXISTS public.system_ads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  image_url text,
  link_url text,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.system_ads ENABLE ROW LEVEL SECURITY;

-- Anyone can view active ads
CREATE POLICY "Anyone can view active ads" ON public.system_ads
  FOR SELECT USING (active = true);

-- Only admins can manage ads
CREATE POLICY "Admins can manage ads" ON public.system_ads
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Make CPF nullable since we're removing it from registration
ALTER TABLE public.customers ALTER COLUMN cpf DROP NOT NULL;
ALTER TABLE public.customers ALTER COLUMN cpf SET DEFAULT '';
